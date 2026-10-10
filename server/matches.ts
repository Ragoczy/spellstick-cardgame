// Online matches: challenges, moves, and what each player is allowed to see.
//
// The server is the referee. A match's game state is never stored: it is rebuilt from the
// setup and the list of moves with the rules engine (about 40 ms for a whole game). Every move
// must be one of the engine's legal actions for that player. Players only ever get their own
// view of the game (viewFor and eventsFor), so the other side's face-down cards never leave
// the server.

import { randomInt } from 'node:crypto';
import type pg from 'pg';
import { prototypeCards } from '../src/data/prototype';
import {
  applyAction, createGame, eventsFor, legalActions, makeConfig, otherSide, viewFor,
  type Action, type GameEvent, type GameSetup, type GameState, type Side,
} from '../src/engine';
import type { MatchDetail, MatchStatus, MatchSummary, MoveEvents, PlayerListing } from '../src/shared/matchApi';
import type { User } from './users';

export type { MatchDetail, MatchStatus, MatchSummary, MoveEvents, PlayerListing };

/** Most matches a player can have going at once (challenges included), so nobody gets flooded. */
export const MAX_OPEN_MATCHES = 20;
/** Field sizes a challenge can use: the base game and the center-lane add-on. */
export const LANE_CHOICES = [2, 3];

/** A problem to report to the player, with the HTTP status to send. */
export class MatchError extends Error {
  constructor(readonly status: number, message: string, readonly code?: 'stale') {
    super(message);
  }
}

interface MatchRow {
  id: string;
  player_a: string;
  player_b: string;
  a_name: string | null;
  b_name: string | null;
  setup: GameSetup;
  status: MatchStatus;
  waiting_on: string | null;
  waiting_since: Date;
  move_count: number;
  winner: string | null;
  end_reason: 'played' | 'resigned' | null;
  created_at: Date;
}

const MATCH_COLUMNS = `m.id, m.player_a, m.player_b, ua.display_name as a_name, ub.display_name as b_name, m.setup,
  m.status, m.waiting_on, m.waiting_since, m.move_count, m.winner, m.end_reason, m.created_at`;
const MATCH_FROM = 'matches m join users ua on ua.id = m.player_a join users ub on ub.id = m.player_b';

// ---- Rebuilding a game ----

/** Replays the moves. events[0] is the start of the game; events[n] came from move n. */
export function rebuild(setup: GameSetup, moves: Action[]): { state: GameState; events: GameEvent[][] } {
  let { state, events } = createGame(setup);
  const all = [events];
  for (const move of moves) {
    ({ state, events } = applyAction(state, move));
    all.push(events);
  }
  return { state, events: all };
}

/** JSON with object keys sorted, so two actions can be compared however their keys were ordered. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Finds the legal action the player sent. Anything that isn't exactly one of the engine's
 * legal actions is refused, so a hand-made request can't do anything the game screen couldn't.
 * The order of cards in a regroup doesn't matter.
 */
export function findLegal(legal: Action[], sent: unknown): Action | null {
  if (!sent || typeof sent !== 'object') return null;
  const key = (a: unknown) => {
    const action = a as { type?: unknown; discard?: unknown };
    if (action.type === 'regroup' && Array.isArray(action.discard)) return stableJson({ ...action, discard: [...action.discard].sort() });
    return stableJson(a);
  };
  const wanted = key(sent);
  return legal.find((a) => key(a) === wanted) ?? null;
}

// ---- Reading matches ----

function sideOf(row: MatchRow, user: User): Side | null {
  if (Number(row.player_a) === user.id) return 'A';
  if (Number(row.player_b) === user.id) return 'B';
  return null;
}

function playerOn(row: MatchRow, side: Side): number {
  return Number(side === 'A' ? row.player_a : row.player_b);
}

function toSummary(row: MatchRow, side: Side, userId: number): MatchSummary {
  const them = otherSide(side);
  const theirName = them === 'A' ? row.a_name : row.b_name;
  let result: MatchSummary['result'] = null;
  if (row.status === 'finished') {
    const outcome = row.winner === null ? 'draw' : Number(row.winner) === userId ? 'won' : 'lost';
    result = { outcome, reason: row.end_reason ?? 'played' };
  }
  return {
    id: Number(row.id),
    status: row.status,
    side,
    opponent: { id: playerOn(row, them), name: theirName ?? 'Unnamed player' },
    youChallenged: side === 'A',
    lanes: row.setup.config?.lanes ?? 2,
    team: row.setup.teams![side],
    opponentTeam: row.setup.teams![them],
    yourMove: row.waiting_on !== null && Number(row.waiting_on) === userId,
    moveCount: row.move_count,
    waitingSince: row.waiting_since.toISOString(),
    result,
    createdAt: row.created_at.toISOString(),
  };
}

/** The match row, only if this player is in it. Others get "not found", so match ids reveal nothing. */
async function loadRow(db: pg.Pool | pg.PoolClient, matchId: number, user: User, lock = false): Promise<{ row: MatchRow; side: Side }> {
  if (!Number.isSafeInteger(matchId) || matchId < 1) throw new MatchError(404, 'No such match.');
  const { rows } = await db.query<MatchRow>(
    `select ${MATCH_COLUMNS} from ${MATCH_FROM} where m.id = $1 ${lock ? 'for update of m' : ''}`,
    [matchId],
  );
  const row = rows[0];
  const side = row ? sideOf(row, user) : null;
  if (!row || !side) throw new MatchError(404, 'No such match.');
  return { row, side };
}

async function loadMoves(db: pg.Pool | pg.PoolClient, matchId: number): Promise<Action[]> {
  const { rows } = await db.query<{ move: Action }>('select move from match_events where match_id = $1 order by seq', [matchId]);
  return rows.map((r) => r.move);
}

/** What a player may see. since: send only events after this move (-1 for all of them). */
function detail(row: MatchRow, side: Side, userId: number, game: { state: GameState; events: GameEvent[][] } | null, since: number): MatchDetail {
  const match = toSummary(row, side, userId);
  if (!game) return { match, game: null };
  const events: MoveEvents[] = [];
  for (let seq = Math.max(0, since + 1); seq < game.events.length; seq++) {
    events.push({ seq, events: eventsFor(game.events[seq]!, side) });
  }
  return {
    match,
    game: {
      view: viewFor(game.state, side),
      // A match that ended by resigning still has a game in progress underneath: nobody can move.
      legal: row.status === 'active' ? legalActions(game.state, side) : [],
      events,
    },
  };
}

export async function getMatch(db: pg.Pool, user: User, matchId: number, since = -1): Promise<MatchDetail> {
  const { row, side } = await loadRow(db, matchId, user);
  if (row.status === 'challenged' || row.status === 'declined') return detail(row, side, user.id, null, since);
  return detail(row, side, user.id, rebuild(row.setup, await loadMoves(db, matchId)), since);
}

/** The player's matches: ones waiting on them first, then the rest, newest first. */
export async function listMatches(db: pg.Pool, user: User): Promise<MatchSummary[]> {
  const { rows } = await db.query<MatchRow>(
    `select ${MATCH_COLUMNS} from ${MATCH_FROM}
     where m.player_a = $1 or m.player_b = $1
     order by (m.waiting_on = $1) desc nulls last, (m.status in ('challenged', 'active')) desc, m.waiting_since desc
     limit 100`,
    [user.id],
  );
  return rows.map((row) => toSummary(row, sideOf(row, user)!, user.id));
}

/** Other players to challenge: names starting with the search text, or recently seen players. */
export async function findPlayers(db: pg.Pool, user: User, search: string): Promise<PlayerListing[]> {
  const text = search.trim();
  const { rows } = await db.query<{ id: string; display_name: string }>(
    text
      ? `select id, display_name from users
         where display_name is not null and id <> $1 and starts_with(lower(display_name), lower($2))
         order by lower(display_name) limit 20`
      : `select id, display_name from users
         where display_name is not null and id <> $1
         order by last_seen_at desc limit 20`,
    text ? [user.id, text] : [user.id],
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.display_name }));
}

// ---- Changing matches ----

/** Runs work inside a transaction. */
async function inTransaction<T>(db: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

async function openMatchCount(db: pg.Pool | pg.PoolClient, userId: number): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from matches where (player_a = $1 or player_b = $1) and status in ('challenged', 'active')`,
    [userId],
  );
  return rows[0]!.n;
}

function needsName(user: User): void {
  if (!user.displayName) throw new MatchError(400, 'Pick a team or manager name first.');
}

/**
 * Challenges another player. The challenger picks the field size and their team; the other
 * player gets the other team. (Drafts replace team picks in a later step.)
 */
export async function createChallenge(
  db: pg.Pool, user: User, input: { opponentId: unknown; lanes: unknown; team: unknown },
): Promise<MatchSummary> {
  needsName(user);
  const opponentId = Number(input.opponentId);
  if (opponentId === user.id) throw new MatchError(400, "You can't challenge yourself.");
  if (!LANE_CHOICES.includes(input.lanes as number)) throw new MatchError(400, 'Choose two or three lanes.');
  const cardSet = prototypeCards;
  const team = cardSet.teams.find((t) => t.id === input.team);
  if (!team) throw new MatchError(400, 'Choose one of the teams.');
  const otherTeam = cardSet.teams.find((t) => t.id !== team.id) ?? team;

  const { rows } = await db.query<{ display_name: string | null }>('select display_name from users where id = $1', [
    Number.isSafeInteger(opponentId) ? opponentId : 0,
  ]);
  if (!rows[0]?.display_name) throw new MatchError(404, 'No player by that name.');
  if ((await openMatchCount(db, user.id)) >= MAX_OPEN_MATCHES) {
    throw new MatchError(409, `You have ${MAX_OPEN_MATCHES} matches going already. Finish or decline some first.`);
  }
  if ((await openMatchCount(db, opponentId)) >= MAX_OPEN_MATCHES) {
    throw new MatchError(409, `${rows[0].display_name} has too many matches going right now. Try again later.`);
  }

  // The whole setup is saved, rules settings included, so later changes to the defaults never
  // change a match already under way.
  const setup: GameSetup = {
    seed: randomInt(1, 1_000_000_000),
    cardSet,
    teams: { A: team.id, B: otherTeam.id },
    config: makeConfig({ lanes: input.lanes as number }),
  };
  createGame(setup); // throws now, not later, if the setup is broken

  const inserted = await db.query<{ id: string }>(
    `insert into matches (player_a, player_b, setup, waiting_on) values ($1, $2, $3, $2) returning id`,
    [user.id, opponentId, JSON.stringify(setup)],
  );
  const { row, side } = await loadRow(db, Number(inserted.rows[0]!.id), user);
  return toSummary(row, side, user.id);
}

export async function acceptChallenge(db: pg.Pool, user: User, matchId: number): Promise<MatchDetail> {
  needsName(user);
  await inTransaction(db, async (client) => {
    const { row, side } = await loadRow(client, matchId, user, true);
    if (row.status !== 'challenged') throw new MatchError(409, 'This challenge is no longer open.');
    if (side !== 'B') throw new MatchError(409, 'Only the player you challenged can accept.');
    const { state } = createGame(row.setup);
    const first = state.pending.kind === 'gameOver' ? null : playerOn(row, state.pending.side);
    await client.query(
      `update matches set status = 'active', started_at = now(), waiting_on = $2, waiting_since = now() where id = $1`,
      [matchId, first],
    );
  });
  return getMatch(db, user, matchId);
}

/** Turns down a challenge, or (for the challenger) withdraws it. */
export async function declineChallenge(db: pg.Pool, user: User, matchId: number): Promise<MatchSummary> {
  await inTransaction(db, async (client) => {
    const { row } = await loadRow(client, matchId, user, true);
    if (row.status !== 'challenged') throw new MatchError(409, 'This challenge is no longer open.');
    await client.query(`update matches set status = 'declined', waiting_on = null, finished_at = now() where id = $1`, [matchId]);
  });
  const { row, side } = await loadRow(db, matchId, user);
  return toSummary(row, side, user.id);
}

export async function resign(db: pg.Pool, user: User, matchId: number): Promise<MatchSummary> {
  await inTransaction(db, async (client) => {
    const { row, side } = await loadRow(client, matchId, user, true);
    if (row.status !== 'active') throw new MatchError(409, 'This match is not in progress.');
    await client.query(
      `update matches set status = 'finished', waiting_on = null, winner = $2, end_reason = 'resigned', finished_at = now() where id = $1`,
      [matchId, playerOn(row, otherSide(side))],
    );
  });
  const { row, side } = await loadRow(db, matchId, user);
  return toSummary(row, side, user.id);
}

/**
 * Makes one move. seen is the match's move count when the player chose it; if the match has
 * moved on since (a double click, or another tab), the move is refused and the player should
 * reload. Returns the player's updated view and the events from their move.
 */
export async function makeMove(db: pg.Pool, user: User, matchId: number, sent: unknown, seen: unknown): Promise<MatchDetail> {
  return inTransaction(db, async (client) => {
    // Locking the match row means two moves in the same match are handled one at a time.
    const { row, side } = await loadRow(client, matchId, user, true);
    if (row.status === 'challenged') throw new MatchError(409, "This match hasn't started yet.");
    if (row.status !== 'active') throw new MatchError(409, 'This match is over.');
    if (seen !== row.move_count) throw new MatchError(409, 'The match has moved on. Reload to see the latest.', 'stale');

    const game = rebuild(row.setup, await loadMoves(client, matchId));
    const legal = legalActions(game.state, side);
    if (!legal.length) throw new MatchError(409, "It isn't your decision right now.");
    const move = findLegal(legal, sent);
    if (!move) throw new MatchError(400, "That move isn't allowed right now.");

    const result = applyAction(game.state, move);
    game.state = result.state;
    game.events.push(result.events);
    const seq = row.move_count + 1;
    await client.query('insert into match_events (match_id, seq, player_id, move) values ($1, $2, $3, $4)', [
      matchId, seq, user.id, JSON.stringify(move),
    ]);

    const pending = game.state.pending;
    const over = game.state.result;
    await client.query(
      `update matches set move_count = $2, waiting_on = $3,
         -- The clock for "waiting since" restarts only when the decision passes to the other player.
         waiting_since = case when waiting_on is distinct from $3 then now() else waiting_since end,
         status = $4, winner = $5, end_reason = $6, finished_at = case when $4 = 'finished' then now() end
       where id = $1`,
      [
        matchId,
        seq,
        pending.kind === 'gameOver' ? null : playerOn(row, pending.side),
        over ? 'finished' : 'active',
        over?.winner ? playerOn(row, over.winner) : null,
        over ? 'played' : null,
      ],
    );
    const after = await loadRow(client, matchId, user);
    return detail(after.row, side, user.id, game, row.move_count);
  });
}
