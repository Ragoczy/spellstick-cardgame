// Tournaments (online phase 3): Swiss rounds, then a knockout, run entirely by the server. See
// docs/spellstick-multiplayer-design.md, "Tournaments" and "Special award cards".
//
// An admin sets one up and starts it once players have entered. Each round's matches start
// straight away. A pairing's result comes from its match, never from a player. When every match
// in the round is over, or the round deadline passes (the score at that moment decides any match
// still going), the next round is paired. The sums (standings, pairings, the bracket) are in
// swiss.ts.
//
// When the tournament ends, everyone who took part gets an award copy of the event's featured
// card: the champion's is numbered 1 of 1 and can't be traded; knockout players get a foil.

import { randomInt } from 'node:crypto';
import type pg from 'pg';
import { prototypeCards } from '../src/data/prototype';
import { makeConfig, type Side } from '../src/engine';
import { POOL_TEAM } from '../src/engine/cards';
import type { Pace } from '../src/shared/matchApi';
import type {
  PairingOutcome, PairingRow, Placing, StandingRow, TournamentDetail, TournamentFormat, TournamentStatus, TournamentSummary,
} from '../src/shared/tournamentApi';
import type { CardEdition } from '../src/shared/collectionApi';
import { giveAwardCard, teamForMatch } from './collection';
import {
  createTournamentMatch, endAtDeadline, inTransaction, resignIfActive, TIME_BANKS, tournamentResult, type ClockNotice,
} from './matches';
import { bracketSeeds, knockoutWinner, MIN_ENTRANTS, pairRound, standings, swissRounds, topCutSize, type Pairing } from './swiss';
import type { User } from './users';

export { MIN_ENTRANTS };

/** A problem to report to the player, with the HTTP status to send. */
export class TournamentError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const TOURNAMENT_NAME_MIN = 3;
export const TOURNAMENT_NAME_MAX = 60;
export const TOP_PRIZE_MAX = 200;
/** Most players one tournament can take. */
export const MAX_ENTRANTS = 256;
/** Longest round an admin can set: two weeks. */
export const MAX_ROUND_HOURS = 336;

/**
 * Shortest round for a pace: both players' whole time banks, so a match where both players use
 * all their time still ends before the deadline. 72 hours for async, 1 hour for live.
 */
export function minRoundHours(pace: Pace): number {
  return Math.ceil((2 * TIME_BANKS[pace]) / 3_600_000);
}

// ---- Reading ----

interface TournamentRow {
  id: string;
  name: string;
  format: TournamentFormat;
  lanes: number;
  pace: Pace;
  round_hours: number;
  top_prize: string | null;
  prize_sent_at: Date | null;
  award_card: string | null;
  status: TournamentStatus;
  seed: number;
  swiss_rounds: number | null;
  top_cut: number | null;
  round: number;
  round_ends_at: Date | null;
  champion_id: string | null;
  champion_name: string | null;
  created_at: Date;
  entrants: number;
  you_entered: boolean;
  /** True when the round deadline has passed. */
  overdue: boolean;
}

const nameOf = (u: string) => `coalesce(${u}.display_name, 'Deleted player')`;

const TOURNAMENT_SELECT = `
  select t.id, t.name, t.format, t.lanes, t.pace, t.round_hours, t.top_prize, t.prize_sent_at, t.award_card, t.status,
    t.seed, t.swiss_rounds, t.top_cut, t.round, t.round_ends_at, t.champion_id, t.created_at,
    case when t.champion_id is null then null else ${nameOf('uc')} end as champion_name,
    (select count(*)::int from tournament_entries e where e.tournament_id = t.id) as entrants,
    exists (select 1 from tournament_entries e where e.tournament_id = t.id and e.user_id = $1 and e.dropped_at is null) as you_entered,
    coalesce(t.round_ends_at <= now(), false) as overdue
  from tournaments t left join users uc on uc.id = t.champion_id`;

function toSummary(row: TournamentRow): TournamentSummary {
  return {
    id: Number(row.id),
    name: row.name,
    status: row.status,
    format: row.format,
    lanes: row.lanes,
    pace: row.pace,
    roundHours: row.round_hours,
    topPrize: row.top_prize,
    awardCard: row.award_card,
    entrants: row.entrants,
    swissRounds: row.swiss_rounds,
    knockoutSize: row.top_cut,
    round: row.round,
    roundEndsAt: row.round_ends_at?.toISOString() ?? null,
    champion: row.champion_name,
    youEntered: row.you_entered,
    createdAt: row.created_at.toISOString(),
  };
}

async function loadTournament(db: pg.Pool | pg.PoolClient, id: number, userId: number, lock = false): Promise<TournamentRow> {
  if (!Number.isSafeInteger(id) || id < 1) throw new TournamentError(404, 'No such tournament.');
  const { rows } = await db.query<TournamentRow>(`${TOURNAMENT_SELECT} where t.id = $2 ${lock ? 'for update of t' : ''}`, [userId, id]);
  if (!rows[0]) throw new TournamentError(404, 'No such tournament.');
  return rows[0];
}

/** Tournaments open for entry or under way first, then finished ones, newest first. */
export async function listTournaments(db: pg.Pool, user: User): Promise<TournamentSummary[]> {
  const { rows } = await db.query<TournamentRow>(
    `${TOURNAMENT_SELECT}
     order by (t.status in ('registration', 'swiss', 'knockout')) desc, t.created_at desc
     limit 50`,
    [user.id],
  );
  return rows.map(toSummary);
}

interface EntryRow {
  user_id: string;
  name: string;
  team_id: string | null;
  team_name: string | null;
  deck: string[] | null;
  dropped_at: Date | null;
  drop_reason: 'withdrew' | 'no_shows' | 'left' | null;
  missed_rounds: number;
  knockout_seed: number | null;
  placing: Placing | null;
}

async function loadEntries(db: pg.Pool | pg.PoolClient, tournamentId: number): Promise<EntryRow[]> {
  const { rows } = await db.query<EntryRow>(
    `select e.user_id, ${nameOf('u')} as name, e.team_id, e.team_name, e.deck, e.dropped_at, e.drop_reason, e.missed_rounds, e.knockout_seed, e.final_place as placing
     from tournament_entries e join users u on u.id = e.user_id
     where e.tournament_id = $1 order by e.entered_at, e.user_id`,
    [tournamentId],
  );
  return rows;
}

interface PairingDbRow {
  id: string;
  round: number;
  stage: 'swiss' | 'knockout';
  slot: number;
  player_a: string;
  player_b: string | null;
  match_id: string | null;
  outcome: PairingOutcome | null;
  goals_a: number;
  goals_b: number;
  end_reason: 'played' | 'resigned' | 'forfeit' | 'deadline' | null;
}

async function loadPairings(db: pg.Pool | pg.PoolClient, tournamentId: number, round?: number): Promise<PairingDbRow[]> {
  const { rows } = await db.query<PairingDbRow>(
    `select p.id, p.round, p.stage, p.slot, p.player_a, p.player_b, p.match_id, p.outcome, p.goals_a, p.goals_b,
       case when m.status = 'finished' then m.end_reason end as end_reason
     from tournament_pairings p left join matches m on m.id = p.match_id
     where p.tournament_id = $1 and ($2::smallint is null or p.round = $2)
     order by p.round, p.slot`,
    [tournamentId, round ?? null],
  );
  return rows;
}

function toPairing(p: PairingDbRow): Pairing {
  return {
    round: p.round, a: Number(p.player_a), b: p.player_b === null ? null : Number(p.player_b),
    outcome: p.outcome, goalsA: p.goals_a, goalsB: p.goals_b,
  };
}

/** The Swiss standings, best first. */
function swissTable(t: TournamentRow, entries: EntryRow[], pairings: PairingDbRow[]) {
  const dropped = new Set(entries.filter((e) => e.dropped_at).map((e) => Number(e.user_id)));
  return standings(
    entries.map((e) => Number(e.user_id)),
    pairings.filter((p) => p.stage === 'swiss').map(toPairing),
    dropped,
    t.seed,
  );
}

export async function getTournament(db: pg.Pool, user: User, id: number): Promise<TournamentDetail> {
  const t = await loadTournament(db, id, user.id);
  const entries = await loadEntries(db, Number(t.id));
  const pairings = await loadPairings(db, Number(t.id));
  const entryOf = new Map(entries.map((e) => [Number(e.user_id), e]));
  const mine = entryOf.get(user.id);

  const table: StandingRow[] = t.status === 'registration' ? [] : swissTable(t, entries, pairings).map((s) => {
    const e = entryOf.get(s.userId)!;
    return {
      rank: s.rank, name: e.name, teamName: e.team_name, points: s.points, wins: s.wins, losses: s.losses, draws: s.draws,
      opponentsWin: Math.round(s.opponentsWin * 1000) / 10, goalDifference: s.goalDifference, dropped: s.dropped, you: s.userId === user.id,
    };
  });

  const person = (userId: number) => {
    const e = entryOf.get(userId);
    return { name: e?.name ?? 'Deleted player', you: userId === user.id, seed: e?.knockout_seed ?? null };
  };
  const rows: PairingRow[] = pairings.map((p) => {
    const a = Number(p.player_a);
    const b = p.player_b === null ? null : Number(p.player_b);
    return {
      round: p.round, stage: p.stage, slot: p.slot, a: person(a), b: b === null ? null : person(b),
      outcome: p.outcome, goalsA: p.goals_a, goalsB: p.goals_b, ended: p.outcome ? p.end_reason : null,
      matchId: p.match_id && (a === user.id || b === user.id) ? Number(p.match_id) : null,
    };
  });
  const current = pairings.find((p) => p.round === t.round && p.outcome === null && p.match_id
    && (Number(p.player_a) === user.id || Number(p.player_b) === user.id));

  return {
    tournament: toSummary(t),
    standings: table,
    pairings: rows,
    entrants: entries.map((e) => ({ name: e.name, teamName: e.team_name, you: Number(e.user_id) === user.id })),
    you: {
      entered: Boolean(mine),
      dropped: Boolean(mine?.dropped_at),
      placing: mine?.placing ?? null,
      currentMatchId: current ? Number(current.match_id) : null,
    },
    prizeSentAt: user.role === 'admin' ? t.prize_sent_at?.toISOString() ?? null : null,
  };
}

// ---- Setting up (admins) ----

/** Tidies spacing, so "  Spring  Cup " becomes "Spring Cup". */
function tidy(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** True if the card id is a named player in the shared pool (award editions are player cards). */
export function isAwardableCard(cardId: string): boolean {
  return prototypeCards.cards.some((c) => c.id === cardId && c.team === POOL_TEAM && c.kind !== 'spell');
}

export async function createTournament(
  client: pg.PoolClient, admin: User,
  input: { name?: unknown; format?: unknown; lanes?: unknown; pace?: unknown; roundHours?: unknown; topPrize?: unknown; awardCard?: unknown },
): Promise<TournamentSummary> {
  const name = typeof input.name === 'string' ? tidy(input.name) : '';
  if (name.length < TOURNAMENT_NAME_MIN || name.length > TOURNAMENT_NAME_MAX) {
    throw new TournamentError(400, `Tournament names are ${TOURNAMENT_NAME_MIN} to ${TOURNAMENT_NAME_MAX} characters long.`);
  }
  if (input.format !== 'draft' && input.format !== 'constructed') throw new TournamentError(400, 'Choose draft or saved teams.');
  if (input.lanes !== 2 && input.lanes !== 3) throw new TournamentError(400, 'Choose two or three lanes.');
  if (input.pace !== 'async' && input.pace !== 'live') throw new TournamentError(400, 'Choose live or at your own pace.');
  const pace = input.pace;
  const hours = input.roundHours;
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < minRoundHours(pace) || hours > MAX_ROUND_HOURS) {
    throw new TournamentError(400, `Rounds at this pace last ${minRoundHours(pace)} to ${MAX_ROUND_HOURS} hours, so both players' time banks fit in a round.`);
  }
  const prize = typeof input.topPrize === 'string' ? tidy(input.topPrize) : '';
  if (prize.length > TOP_PRIZE_MAX) throw new TournamentError(400, `Keep the top prize under ${TOP_PRIZE_MAX} characters.`);
  const awardCard = typeof input.awardCard === 'string' && input.awardCard ? input.awardCard : null;
  if (awardCard !== null && !isAwardableCard(awardCard)) throw new TournamentError(400, 'Choose one of the named players for the award cards.');

  const { rows } = await client.query<{ id: string }>(
    `insert into tournaments (name, format, lanes, pace, round_hours, top_prize, award_card, seed, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [name, input.format, input.lanes, pace, hours, prize || null, awardCard, randomInt(1, 1_000_000_000), admin.id],
  );
  return toSummary(await loadTournament(client, Number(rows[0]!.id), admin.id));
}

/** Starts the tournament: works out the rounds and the knockout size, and pairs round 1. */
export async function startTournament(client: pg.PoolClient, admin: User, id: number): Promise<ClockNotice[]> {
  const t = await loadTournament(client, id, admin.id, true);
  if (t.status !== 'registration') throw new TournamentError(409, 'This tournament has already started.');
  if (t.entrants < MIN_ENTRANTS) throw new TournamentError(409, `A tournament needs at least ${MIN_ENTRANTS} players to start. It has ${t.entrants}.`);
  await client.query(
    `update tournaments set status = 'swiss', swiss_rounds = $2, top_cut = $3, started_at = now() where id = $1`,
    [t.id, swissRounds(t.entrants), topCutSize(t.entrants)],
  );
  return nextRound(client, await loadTournament(client, id, admin.id, true));
}

/**
 * Calls a tournament off. Matches already under way can still be played out, but they no longer
 * count, and nobody gets award cards.
 */
export async function cancelTournament(client: pg.PoolClient, admin: User, id: number): Promise<void> {
  const t = await loadTournament(client, id, admin.id, true);
  if (t.status === 'finished' || t.status === 'cancelled') throw new TournamentError(409, 'This tournament is already over.');
  await client.query(`update tournaments set status = 'cancelled', round_ends_at = null, finished_at = now() where id = $1`, [t.id]);
}

/** The top prize is on its way to the champion. */
export async function markPrizeSent(client: pg.PoolClient, admin: User, id: number): Promise<void> {
  const t = await loadTournament(client, id, admin.id, true);
  if (t.status !== 'finished' || !t.top_prize) throw new TournamentError(409, 'Only a finished tournament with a top prize has a prize to send.');
  await client.query('update tournaments set prize_sent_at = coalesce(prize_sent_at, now()) where id = $1', [t.id]);
}

// ---- Entering and leaving ----

/** Enters the player. A saved-team event takes a copy of their team now. */
export async function enterTournament(client: pg.PoolClient, user: User, id: number, teamId: unknown): Promise<void> {
  if (!user.displayName) throw new TournamentError(400, 'Pick a team or manager name first.');
  const t = await loadTournament(client, id, user.id, true);
  if (t.status !== 'registration') throw new TournamentError(409, 'Entries for this tournament have closed.');
  const { rows } = await client.query('select 1 from tournament_entries where tournament_id = $1 and user_id = $2', [t.id, user.id]);
  if (rows.length) throw new TournamentError(409, "You're already in this tournament.");
  if (t.entrants >= MAX_ENTRANTS) throw new TournamentError(409, 'This tournament is full.');
  let team: { id: number; name: string; deck: string[] } | null = null;
  if (t.format === 'constructed') {
    const found = await teamForMatch(client, user.id, teamId, makeConfig({ lanes: t.lanes }));
    if (!found.ok) throw new TournamentError(400, found.problem);
    team = found;
  }
  await client.query(
    'insert into tournament_entries (tournament_id, user_id, team_id, team_name, deck) values ($1, $2, $3, $4, $5)',
    [t.id, user.id, team?.id ?? null, team?.name ?? null, team ? JSON.stringify(team.deck) : null],
  );
}

/**
 * Before the start, takes the player out. Once it's under way, drops them: they play no more
 * rounds, and their match in progress counts as resigned. Their results stay in the standings.
 */
export async function leaveTournament(client: pg.PoolClient, user: User, id: number): Promise<ClockNotice[]> {
  const t = await loadTournament(client, id, user.id, true);
  return leaveOne(client, t, user.id, 'withdrew');
}

async function leaveOne(client: pg.PoolClient, t: TournamentRow, userId: number, reason: 'withdrew' | 'left'): Promise<ClockNotice[]> {
  if (t.status === 'registration') {
    const { rowCount } = await client.query('delete from tournament_entries where tournament_id = $1 and user_id = $2', [t.id, userId]);
    if (!rowCount) throw new TournamentError(409, "You're not in this tournament.");
    return [];
  }
  if (t.status !== 'swiss' && t.status !== 'knockout') throw new TournamentError(409, 'This tournament is over.');
  const { rowCount } = await client.query(
    'update tournament_entries set dropped_at = now(), drop_reason = $3 where tournament_id = $1 and user_id = $2 and dropped_at is null',
    [t.id, userId, reason],
  );
  if (!rowCount) throw new TournamentError(409, "You're not in this tournament.");
  const notices: ClockNotice[] = [];
  for (const p of await loadPairings(client, Number(t.id), t.round)) {
    if (p.match_id && p.outcome === null && (Number(p.player_a) === userId || Number(p.player_b) === userId)) {
      const notice = await resignIfActive(client, Number(p.match_id), userId);
      if (notice) notices.push(notice);
    }
  }
  return notices;
}

/** Unlinking: the player leaves every tournament they're in. Call inside the unlink's transaction. */
export async function leaveAllTournaments(client: pg.PoolClient, userId: number): Promise<ClockNotice[]> {
  const { rows } = await client.query<{ tournament_id: string }>(
    `select e.tournament_id from tournament_entries e join tournaments t on t.id = e.tournament_id
     where e.user_id = $1 and e.dropped_at is null and t.status in ('registration', 'swiss', 'knockout')
     order by e.tournament_id`,
    [userId],
  );
  const notices: ClockNotice[] = [];
  for (const { tournament_id } of rows) {
    const t = await loadTournament(client, Number(tournament_id), userId, true);
    notices.push(...await leaveOne(client, t, userId, 'left'));
  }
  return notices;
}

// ---- Running rounds ----

/**
 * Brings every tournament under way up to date: records finished matches, settles matches still
 * going at a passed deadline, and pairs the next round when one is complete. Safe to call at any
 * time and from two places at once (each tournament is locked while it's worked on). Returns the
 * matches that started or changed, so their players can be told.
 */
export async function advanceTournaments(db: pg.Pool): Promise<ClockNotice[]> {
  const { rows } = await db.query<{ id: string }>(`select id from tournaments where status in ('swiss', 'knockout') order by id`);
  const notices: ClockNotice[] = [];
  for (const { id } of rows) {
    notices.push(...await inTransaction(db, (client) => advanceOne(client, Number(id))));
  }
  return notices;
}

async function advanceOne(client: pg.PoolClient, id: number): Promise<ClockNotice[]> {
  const t = await loadTournament(client, id, 0, true);
  if (t.status !== 'swiss' && t.status !== 'knockout') return [];
  const notices: ClockNotice[] = [];
  const pairings = await loadPairings(client, id, t.round);
  for (const p of pairings) {
    if (p.outcome !== null || !p.match_id) continue;
    const matchId = Number(p.match_id);
    if (t.overdue) {
      const notice = await endAtDeadline(client, matchId);
      if (notice) notices.push(notice);
    }
    const result = await tournamentResult(client, matchId);
    if (!result) continue;
    p.outcome = result.outcome;
    await client.query('update tournament_pairings set outcome = $2, goals_a = $3, goals_b = $4 where id = $1', [
      p.id, result.outcome, result.goalsA, result.goalsB,
    ]);
    // A Swiss round where a player never moved counts against them; two such rounds drops them.
    if (t.status === 'swiss') {
      for (const side of ['A', 'B'] as Side[]) {
        if (result.moved[side]) continue;
        await client.query(
          `update tournament_entries set missed_rounds = missed_rounds + 1,
             dropped_at = case when missed_rounds + 1 >= 2 and dropped_at is null then now() else dropped_at end,
             drop_reason = case when missed_rounds + 1 >= 2 and dropped_at is null then 'no_shows' else drop_reason end
           where tournament_id = $1 and user_id = $2`,
          [id, side === 'A' ? p.player_a : p.player_b],
        );
      }
    }
  }
  if (pairings.some((p) => p.outcome === null)) return notices;
  notices.push(...await nextRound(client, t));
  return notices;
}

/** The current round is over (or the tournament is starting): pair the next one, or finish. */
async function nextRound(client: pg.PoolClient, t: TournamentRow): Promise<ClockNotice[]> {
  const id = Number(t.id);
  const entries = await loadEntries(client, id);
  const all = await loadPairings(client, id);

  if (t.status === 'swiss') {
    const table = swissTable(t, entries, all);
    const stillIn = table.filter((s) => !s.dropped).map((s) => s.userId);
    if (stillIn.length < 2) return finish(client, t, stillIn[0] ?? table[0]?.userId ?? null, entries);
    if (t.round < t.swiss_rounds!) {
      const round = t.round + 1;
      const swiss = all.filter((p) => p.stage === 'swiss').map(toPairing);
      const pairs = pairRound(stillIn, swiss, t.seed, round).map((p) => ({ a: p.a, b: p.b }));
      return playRound(client, t, entries, round, 'swiss', pairs);
    }
    // Swiss is over. A knockout needs at least two players; it shrinks if players have dropped.
    let size = t.top_cut ?? 0;
    while (size > stillIn.length) size /= 2;
    if (size < 2) return finish(client, t, stillIn[0]!, entries);
    const qualified = stillIn.slice(0, size);
    for (const [i, userId] of qualified.entries()) {
      await client.query('update tournament_entries set knockout_seed = $3 where tournament_id = $1 and user_id = $2', [id, userId, i + 1]);
    }
    await client.query(`update tournaments set status = 'knockout', top_cut = $2 where id = $1`, [id, size]);
    const bySeed = (seed: number) => qualified[seed - 1]!;
    const pairs = bracketSeeds(size).map(([x, y]) => ({ a: bySeed(x), b: bySeed(y) }));
    return playRound(client, { ...t, status: 'knockout', top_cut: size }, await loadEntries(client, id), t.round + 1, 'knockout', pairs);
  }

  // Knockout: the winners of slots 0 and 1 meet in slot 0 next, and so on.
  const seedOf = (userId: number) => entries.find((e) => Number(e.user_id) === userId)?.knockout_seed ?? 99;
  const last = all.filter((p) => p.round === t.round);
  const winners = last.map((p) => (p.player_b === null
    ? Number(p.player_a)
    : knockoutWinner({ a: Number(p.player_a), b: Number(p.player_b), outcome: p.outcome! }, seedOf)));
  if (winners.length === 1) return finish(client, t, winners[0]!, entries);
  const pairs: { a: number; b: number | null }[] = [];
  for (let i = 0; i + 1 < winners.length; i += 2) {
    // The higher seed is listed first.
    const [x, y] = [winners[i]!, winners[i + 1]!].sort((p, q) => seedOf(p) - seedOf(q));
    pairs.push({ a: x!, b: y! });
  }
  return playRound(client, t, entries, t.round + 1, 'knockout', pairs);
}

/**
 * Saves a round's pairings and starts its matches. A pair with no second player is a bye. In the
 * knockout, a player who has dropped gives their opponent a walkover (also saved as a bye).
 */
async function playRound(
  client: pg.PoolClient, t: TournamentRow, entries: EntryRow[], round: number, stage: 'swiss' | 'knockout',
  pairs: { a: number; b: number | null }[],
): Promise<ClockNotice[]> {
  const id = Number(t.id);
  const entryOf = new Map(entries.map((e) => [Number(e.user_id), e]));
  const notices: ClockNotice[] = [];
  for (const [slot, pair] of pairs.entries()) {
    let { a, b } = pair;
    if (stage === 'knockout' && b !== null) {
      const aOut = Boolean(entryOf.get(a)?.dropped_at);
      const bOut = Boolean(entryOf.get(b)?.dropped_at);
      if (bOut || aOut) {
        if (aOut && !bOut) a = b;
        b = null;
      }
    }
    if (b === null) {
      await client.query(
        `insert into tournament_pairings (tournament_id, round, stage, slot, player_a, outcome) values ($1, $2, $3, $4, $5, 'bye')`,
        [id, round, stage, slot, a],
      );
      continue;
    }
    // Who plays side A is random (by the tournament seed), as the draft's second player picks first.
    const [first, second] = sidesFor(t.seed, round, slot, a, b);
    const saved = t.format === 'constructed' ? {
      A: savedTeamOf(entryOf.get(first)!),
      B: savedTeamOf(entryOf.get(second)!),
    } : undefined;
    const matchId = await createTournamentMatch(client, {
      tournamentId: id, playerA: first, playerB: second, format: t.format, lanes: t.lanes, pace: t.pace, ...(saved ? { saved } : {}),
    });
    await client.query(
      'insert into tournament_pairings (tournament_id, round, stage, slot, player_a, player_b, match_id) values ($1, $2, $3, $4, $5, $6, $7)',
      [id, round, stage, slot, first, second, matchId],
    );
    notices.push({ playerIds: [first, second], change: { matchId, status: 'active', moveCount: 0 } });
  }
  await client.query(
    'update tournaments set round = $2, round_ends_at = now() + make_interval(hours => $3) where id = $1',
    [id, round, t.round_hours],
  );
  // A round of nothing but byes (possible only in a knockout full of walkovers) moves on at once.
  if (!notices.length) return [...notices, ...await nextRound(client, await loadTournament(client, id, 0, true))];
  return notices;
}

function sidesFor(seed: number, round: number, slot: number, a: number, b: number): [number, number] {
  // A small, fixed hash: the same tournament always gives the same sides.
  const coin = ((seed ^ (round * 7919) ^ (slot * 104_729)) >>> 0) % 2;
  return coin === 0 ? [a, b] : [b, a];
}

function savedTeamOf(e: EntryRow): { deck: string[]; name: string; teamId: number | null } {
  return { deck: e.deck ?? [], name: e.team_name ?? 'Saved team', teamId: e.team_id === null ? null : Number(e.team_id) };
}

// ---- Finishing ----

/**
 * The tournament is over: records each player's placing and gives out the award cards.
 * champion: the knockout winner, or the Swiss leader when there was no knockout.
 */
async function finish(client: pg.PoolClient, t: TournamentRow, champion: number | null, entries: EntryRow[]): Promise<ClockNotice[]> {
  const id = Number(t.id);
  const all = await loadPairings(client, id);
  const final = t.status === 'knockout' ? all.filter((p) => p.round === t.round && p.player_b !== null)[0] : undefined;
  const finalist = final ? [Number(final.player_a), Number(final.player_b)].find((u) => u !== champion) ?? null : null;

  // Taking part means making at least one move in one of the event's matches.
  const { rows } = await client.query<{ player_id: string }>(
    `select distinct e.player_id from match_events e join matches m on m.id = e.match_id
     where m.tournament_id = $1 and not e.by_computer`,
    [id],
  );
  const movers = new Set(rows.map((r) => Number(r.player_id)));

  const placings = new Map<number, Placing>();
  for (const e of entries) {
    const userId = Number(e.user_id);
    if (userId === champion) placings.set(userId, 'champion');
    else if (userId === finalist) placings.set(userId, 'finalist');
    else if (e.knockout_seed !== null) placings.set(userId, 'knockout');
    else if (movers.has(userId)) placings.set(userId, 'played');
  }
  for (const [userId, placing] of placings) {
    await client.query('update tournament_entries set final_place = $3 where tournament_id = $1 and user_id = $2', [id, userId, placing]);
  }

  if (t.award_card) {
    for (const e of entries) {
      const userId = Number(e.user_id);
      const placing = placings.get(userId);
      // Nothing for players who never moved, or who unlinked their account.
      if (!placing || e.drop_reason === 'left') continue;
      await giveAwardCard(client, userId, t.award_card, awardEdition(t, placing));
    }
  }

  await client.query(
    `update tournaments set status = 'finished', champion_id = $2, round_ends_at = null, finished_at = now() where id = $1`,
    [id, champion],
  );
  return [];
}

/** What an award card says, by placing. Everyone gets one card: the best they earned. */
export function awardEdition(t: { id: string | number; name: string; top_cut: number | null }, placing: Placing, when = new Date()): CardEdition {
  const tournamentId = Number(t.id);
  if (placing === 'champion') return { kind: 'champion', label: `${t.name} Champion, 1 of 1`, tradeable: false, tournamentId };
  if (placing === 'finalist') return { kind: 'knockout', label: `${t.name} Finalist`, tradeable: true, foil: true, tournamentId };
  if (placing === 'knockout') return { kind: 'knockout', label: `${t.name} Top ${t.top_cut ?? ''}`.trim(), tradeable: true, foil: true, tournamentId };
  const month = when.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { kind: 'played', label: `${t.name}, ${month}`, tradeable: true, tournamentId };
}
