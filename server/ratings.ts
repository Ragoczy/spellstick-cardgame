// Ratings for ranked matches, using the Elo system that chess uses.
//
// Everyone starts at 1200. After a ranked match, the winner takes points from the loser. How
// many depends on how surprising the result was: beating a much stronger player gains a lot,
// beating a much weaker one gains almost nothing. A draw moves both players toward each other.
// New players' ratings move faster for their first matches, so they reach their level quickly.
//
// Every finished ranked match counts, however it ended: played out, resigned, forfeited, or
// finished by the computer after a player's time ran out.
//
// Ratings can always be worked out again from the ranked matches since the last reset
// (recalculateRatings), for example after changing the numbers below.

import type pg from 'pg';
import type { RatingRecord, RatingsBoard, RatingTier } from '../src/shared/matchApi';
import type { User } from './users';

/** Everyone's first rating. */
export const START_RATING = 1200;
/** The most a rating can move in one match (the "K factor"), for new players and then for everyone else. */
export const NEW_PLAYER_K = 40;
export const K = 20;
/** Ranked matches played before a player stops counting as new. */
export const NEW_PLAYER_GAMES = 20;
/** Ranked matches a player finishes before they get a tier and a place on the board. */
export const PLACEMENT_GAMES = 5;
/** Highest first. A player's tier is the first one their rating reaches. */
export const TIERS: RatingTier[] = [
  { name: 'Spellstick Master', from: 1450 },
  { name: 'Gold', from: 1300 },
  { name: 'Silver', from: 1150 },
  { name: 'Bronze', from: 0 },
];
/** Players shown on the leaderboard. */
const BOARD_SIZE = 100;

// ---- The sums ----

/** A player's chance of winning, by Elo: 0.5 against an equal rating, about 0.76 when 200 points ahead. */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

/** How far one match can move a rating, given the ranked matches played before it. */
export function kFactor(gamesBefore: number): number {
  return gamesBefore < NEW_PLAYER_GAMES ? NEW_PLAYER_K : K;
}

export function tierFor(rating: number, games: number): string | null {
  if (games < PLACEMENT_GAMES) return null;
  return TIERS.find((t) => rating >= t.from)!.name;
}

/** A player's rating and ranked matches so far. */
export interface Standing {
  rating: number;
  games: number;
}

/**
 * How much each side's rating changes. winner: 'A', 'B', or null for a draw. Each side uses its
 * own K factor, so a new player and a regular can move by different amounts.
 */
export function ratingChanges(a: Standing, b: Standing, winner: 'A' | 'B' | null): { A: number; B: number } {
  const scoreA = winner === 'A' ? 1 : winner === 'B' ? 0 : 0.5;
  return {
    A: Math.round(kFactor(a.games) * (scoreA - expectedScore(a.rating, b.rating))),
    B: Math.round(kFactor(b.games) * (1 - scoreA - expectedScore(b.rating, a.rating))),
  };
}

// ---- Recording results ----

interface FinishedRow {
  id: string;
  player_a: string;
  player_b: string;
  winner: string | null;
}

/** Which side won, from the winner's user id. */
function winningSide(row: FinishedRow): 'A' | 'B' | null {
  if (row.winner === null) return null;
  return row.winner === row.player_a ? 'A' : 'B';
}

/**
 * Changes both players' ratings for a ranked match that has just finished. Does nothing for
 * unranked matches, or if this match was already counted. Call inside the transaction that
 * finished the match.
 */
export async function recordRankedResult(client: pg.PoolClient, matchId: number): Promise<void> {
  const { rows } = await client.query<FinishedRow>(
    `select id, player_a, player_b, winner from matches
     where id = $1 and ranked and status = 'finished' and rating_change_a is null`,
    [matchId],
  );
  const row = rows[0];
  if (!row) return;

  // Lock both players' rows, lowest id first, so two matches finishing at once can't deadlock.
  const players = [row.player_a, row.player_b];
  await client.query(
    `insert into ratings (user_id, rating) select unnest($1::bigint[]), $2 on conflict (user_id) do nothing`,
    [players, START_RATING],
  );
  const current = await client.query<{ user_id: string; rating: number; games: number }>(
    'select user_id, rating, games from ratings where user_id = any($1::bigint[]) order by user_id for update',
    [players],
  );
  const standing = (id: string) => current.rows.find((r) => r.user_id === id)!;
  const winner = winningSide(row);
  const change = ratingChanges(standing(row.player_a), standing(row.player_b), winner);

  for (const side of ['A', 'B'] as const) {
    const outcome = winner === null ? 'draws' : winner === side ? 'wins' : 'losses';
    await client.query(
      `update ratings set rating = rating + $2, games = games + 1, ${outcome} = ${outcome} + 1, updated_at = now() where user_id = $1`,
      [side === 'A' ? row.player_a : row.player_b, change[side]],
    );
  }
  await client.query('update matches set rating_change_a = $2, rating_change_b = $3 where id = $1', [row.id, change.A, change.B]);
}

/** When ratings last started over, or null. */
async function lastReset(db: pg.Pool | pg.PoolClient): Promise<Date | null> {
  const { rows } = await db.query<{ at: Date }>('select at from rating_resets order by id desc limit 1');
  return rows[0]?.at ?? null;
}

/**
 * Works out every rating again from the ranked matches since the last reset, in the order they
 * finished. Returns how many matches were counted.
 */
export async function recalculateRatings(client: pg.PoolClient): Promise<number> {
  // Nobody else may change ratings while they're being rebuilt.
  await client.query('lock table ratings in exclusive mode');
  const since = await lastReset(client);
  const { rows } = await client.query<FinishedRow>(
    `select id, player_a, player_b, winner from matches
     where ranked and status = 'finished' and ($1::timestamptz is null or finished_at > $1)
     order by finished_at, id`,
    [since],
  );

  const records = new Map<string, RatingRecord>();
  const recordOf = (id: string) => {
    if (!records.has(id)) records.set(id, { rating: START_RATING, games: 0, wins: 0, losses: 0, draws: 0, tier: null });
    return records.get(id)!;
  };
  for (const row of rows) {
    const a = recordOf(row.player_a);
    const b = recordOf(row.player_b);
    const winner = winningSide(row);
    const change = ratingChanges(a, b, winner);
    for (const [side, record] of [['A', a], ['B', b]] as const) {
      record.rating += change[side];
      record.games += 1;
      if (winner === null) record.draws += 1;
      else if (winner === side) record.wins += 1;
      else record.losses += 1;
    }
    await client.query('update matches set rating_change_a = $2, rating_change_b = $3 where id = $1', [row.id, change.A, change.B]);
  }

  await client.query('delete from ratings');
  for (const [userId, r] of records) {
    // Players who unlinked their Discord account keep no rating (their opponents' changes stand).
    await client.query(
      `insert into ratings (user_id, rating, games, wins, losses, draws)
       select id, $2, $3, $4, $5, $6 from users where id = $1 and unlinked_at is null`,
      [userId, r.rating, r.games, r.wins, r.losses, r.draws],
    );
  }
  return rows.length;
}

/**
 * Starts ratings over: everyone is unrated again, and only ranked matches finished from now on
 * count. Earlier matches keep the rating changes they showed at the time.
 */
export async function resetRatings(client: pg.PoolClient): Promise<void> {
  await client.query('lock table ratings in exclusive mode');
  await client.query('insert into rating_resets default values');
  await client.query('delete from ratings');
}

// ---- The leaderboard ----

interface RatingRow {
  user_id: string;
  name: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  rank: string;
}

function toRecord(row: { rating: number; games: number; wins: number; losses: number; draws: number }): RatingRecord {
  return { rating: row.rating, games: row.games, wins: row.wins, losses: row.losses, draws: row.draws, tier: tierFor(row.rating, row.games) };
}

/** The leaderboard: players who have finished their placement matches, best first. */
export async function ratingsBoard(db: pg.Pool, user: User): Promise<RatingsBoard> {
  const ranked = `select r.user_id, u.display_name as name, r.rating, r.games, r.wins, r.losses, r.draws,
      rank() over (order by r.rating desc) as rank
    from ratings r join users u on u.id = r.user_id
    where r.games >= $1 and u.display_name is not null`;
  const top = await db.query<RatingRow>(`${ranked} order by r.rating desc, r.games desc, lower(u.display_name) limit $2`, [PLACEMENT_GAMES, BOARD_SIZE]);
  const mine = await db.query<RatingRow>('select rating, games, wins, losses, draws from ratings where user_id = $1', [user.id]);
  const myRank = mine.rows[0]
    ? (await db.query<RatingRow>(`select rank from (${ranked}) board where user_id = $2`, [PLACEMENT_GAMES, user.id])).rows[0]?.rank ?? null
    : null;
  const since = await lastReset(db);

  return {
    you: mine.rows[0] ? { ...toRecord(mine.rows[0]), rank: myRank === null ? null : Number(myRank) } : null,
    players: top.rows.map((r) => ({ ...toRecord(r), rank: Number(r.rank), name: r.name, you: Number(r.user_id) === user.id })),
    placementGames: PLACEMENT_GAMES,
    tiers: TIERS,
    since: since?.toISOString() ?? null,
  };
}
