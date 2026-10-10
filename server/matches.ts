// Online matches: challenges, moves, time banks, and what each player is allowed to see.
//
// The server is the referee. A match's game state is never stored: it is rebuilt from the
// setup and the list of moves with the rules engine (about 40 ms for a whole game). Every move
// must be one of the engine's legal actions for that player. Players only ever get their own
// view of the game (viewFor and eventsFor), so the other side's face-down cards never leave
// the server.
//
// Time banks (docs/spellstick-multiplayer-design.md, "Time banks"): each player has one bank per
// match, used up only while the match waits on them. When it runs out, the computer makes the
// rest of their decisions, or, if they never made a move at all, they forfeit.

import { randomInt } from 'node:crypto';
import type pg from 'pg';
import { heuristicAgent } from '../src/ai/heuristic';
import { prototypeCards } from '../src/data/prototype';
import {
  applyAction, createGame, eventsFor, legalActions, makeConfig, otherSide, viewFor,
  type Action, type GameEvent, type GameSetup, type GameState, type Side,
} from '../src/engine';
import type { MatchChange, MatchDetail, MatchStatus, MatchSummary, MoveEvents, Pace, PlayerListing } from '../src/shared/matchApi';
import type { User } from './users';

export type { MatchDetail, MatchStatus, MatchSummary, MoveEvents, Pace, PlayerListing };

/** Most matches a player can have going at once (challenges included), so nobody gets flooded. */
export const MAX_OPEN_MATCHES = 20;
/** Field sizes a challenge can use: the base game and the center-lane add-on. */
export const LANE_CHOICES = [2, 3];
/** Each player's time bank. Starting values from the design; tune after the beta. */
export const TIME_BANKS: Record<Pace, number> = {
  live: 25 * 60_000,
  async: 36 * 60 * 60_000,
};

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
  end_reason: 'played' | 'resigned' | 'forfeit' | null;
  created_at: Date;
  pace: Pace | null;
  bank_a_ms: string | null;
  bank_b_ms: string | null;
  autopilot_a: boolean;
  autopilot_b: boolean;
  /** Milliseconds since waiting_since, by the database's clock. */
  waited_ms: string;
  /** True when the waiting player's bank has run out. */
  overdue: boolean;
}

/** A player who unlinked their Discord account (migration 004) shows up as "Deleted player". */
const nameOf = (u: string) => `coalesce(${u}.display_name, case when ${u}.unlinked_at is not null then 'Deleted player' end)`;
const MATCH_COLUMNS = `m.id, m.player_a, m.player_b, ${nameOf('ua')} as a_name, ${nameOf('ub')} as b_name, m.setup,
  m.status, m.waiting_on, m.waiting_since, m.move_count, m.winner, m.end_reason, m.created_at,
  m.pace, m.bank_a_ms, m.bank_b_ms, m.autopilot_a, m.autopilot_b,
  floor(extract(epoch from (now() - m.waiting_since)) * 1000)::bigint as waited_ms,
  coalesce(m.waiting_due <= now(), false) as overdue`;
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

/** The side the match is waiting on, if any. */
function waitingSide(row: MatchRow): Side | null {
  if (row.waiting_on === null) return null;
  return Number(row.waiting_on) === Number(row.player_a) ? 'A' : 'B';
}

function autopilotOf(row: MatchRow): Record<Side, boolean> {
  return { A: row.autopilot_a, B: row.autopilot_b };
}

/** Each bank as it was at waiting_since (null for untimed matches). */
function storedBanks(row: MatchRow): Record<Side, number> | null {
  if (row.bank_a_ms === null || row.bank_b_ms === null) return null;
  return { A: Number(row.bank_a_ms), B: Number(row.bank_b_ms) };
}

/** Each bank right now: the waiting player has also used the time since waiting_since. */
function banksNow(row: MatchRow): Record<Side, number> | null {
  const banks = storedBanks(row);
  if (!banks) return null;
  const waiting = row.status === 'active' ? waitingSide(row) : null;
  if (waiting) banks[waiting] = Math.max(0, banks[waiting] - Number(row.waited_ms));
  return banks;
}

function toSummary(row: MatchRow, side: Side, userId: number): MatchSummary {
  const them = otherSide(side);
  const theirName = them === 'A' ? row.a_name : row.b_name;
  let result: MatchSummary['result'] = null;
  if (row.status === 'finished') {
    const outcome = row.winner === null ? 'draw' : Number(row.winner) === userId ? 'won' : 'lost';
    result = { outcome, reason: row.end_reason ?? 'played' };
  }
  const banks = banksNow(row);
  const waiting = row.status === 'active' ? waitingSide(row) : null;
  const autopilot = autopilotOf(row);
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
    pace: row.pace,
    clock: banks ? { you: banks[side], them: banks[them], running: waiting === null ? null : waiting === side ? 'you' : 'them' } : null,
    autopilot: { you: autopilot[side], them: autopilot[them] },
    result,
    createdAt: row.created_at.toISOString(),
  };
}

async function loadRowById(db: pg.Pool | pg.PoolClient, matchId: number, lock = false): Promise<MatchRow | null> {
  if (!Number.isSafeInteger(matchId) || matchId < 1) return null;
  const { rows } = await db.query<MatchRow>(
    `select ${MATCH_COLUMNS} from ${MATCH_FROM} where m.id = $1 ${lock ? 'for update of m' : ''}`,
    [matchId],
  );
  return rows[0] ?? null;
}

/** The match row, only if this player is in it. Others get "not found", so match ids reveal nothing. */
async function loadRow(db: pg.Pool | pg.PoolClient, matchId: number, user: User, lock = false): Promise<{ row: MatchRow; side: Side }> {
  const row = await loadRowById(db, matchId, lock);
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
      // A match that ended by resigning or forfeit still has a game in progress underneath: nobody can move.
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
export async function inTransaction<T>(db: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
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

/** A move to save: who it was for, and whether the computer made it for them. */
interface NewMove {
  action: Action;
  side: Side;
  byComputer: boolean;
}

/**
 * While the game waits on a player whose time ran out, the computer makes their decisions.
 * Stops when it's a person's decision again, or the game is over.
 */
function computerMoves(row: MatchRow, game: { state: GameState; events: GameEvent[][] }, autopilot: Record<Side, boolean>): NewMove[] {
  const moves: NewMove[] = [];
  // A game always ends (the engine has a turn limit), so this is only a safety net.
  for (let guard = 0; guard < 10_000; guard++) {
    const pending = game.state.pending;
    if (pending.kind === 'gameOver' || !autopilot[pending.side]) break;
    const agent = heuristicAgent(row.setup.seed + game.events.length, game.state.config);
    const action = agent.chooseAction(viewFor(game.state, pending.side), legalActions(game.state, pending.side));
    const result = applyAction(game.state, action);
    game.state = result.state;
    game.events.push(result.events);
    moves.push({ action, side: pending.side, byComputer: true });
  }
  return moves;
}

/**
 * Saves new moves and brings the match up to date: whose decision it is, both time banks, and
 * the result. The player the match was waiting on is charged for the time since waiting_since,
 * and the next player's clock starts now.
 */
async function saveProgress(
  client: pg.PoolClient, row: MatchRow, game: { state: GameState }, moves: NewMove[],
  changes: { autopilot?: Record<Side, boolean>; forfeitBy?: Side } = {},
): Promise<void> {
  let seq = row.move_count;
  for (const move of moves) {
    seq += 1;
    await client.query('insert into match_events (match_id, seq, player_id, move, by_computer) values ($1, $2, $3, $4, $5)', [
      row.id, seq, playerOn(row, move.side), JSON.stringify(move.action), move.byComputer,
    ]);
  }

  const banks = banksNow(row);
  const autopilot = changes.autopilot ?? autopilotOf(row);
  const pending = game.state.pending;
  const over = game.state.result;
  const finished = over !== null || changes.forfeitBy !== undefined;
  const next: Side | null = finished || pending.kind === 'gameOver' ? null : pending.side;
  // The next player's bank runs out this many milliseconds from now (never for the computer).
  const dueIn = banks && next && !autopilot[next] ? banks[next] : null;
  const winner = changes.forfeitBy ? playerOn(row, otherSide(changes.forfeitBy)) : over?.winner ? playerOn(row, over.winner) : null;

  await client.query(
    `update matches set move_count = $2, waiting_on = $3, waiting_since = now(),
       waiting_due = case when $4::bigint is null then null else now() + make_interval(secs => $4::bigint / 1000.0) end,
       bank_a_ms = $5, bank_b_ms = $6, autopilot_a = $7, autopilot_b = $8,
       status = $9, winner = $10, end_reason = $11, finished_at = case when $9 = 'finished' then now() end
     where id = $1`,
    [
      row.id, seq, next ? playerOn(row, next) : null, dueIn,
      banks?.A ?? null, banks?.B ?? null, autopilot.A, autopilot.B,
      finished ? 'finished' : 'active', winner,
      changes.forfeitBy ? 'forfeit' : over ? 'played' : null,
    ],
  );
}

/**
 * Challenges another player. The challenger picks the field size, the pace, and their team; the
 * other player gets the other team. (Drafts replace team picks in a later step.)
 */
export async function createChallenge(
  db: pg.Pool, user: User, input: { opponentId: unknown; lanes: unknown; team: unknown; pace?: unknown },
): Promise<MatchSummary> {
  needsName(user);
  const opponentId = Number(input.opponentId);
  if (opponentId === user.id) throw new MatchError(400, "You can't challenge yourself.");
  if (!LANE_CHOICES.includes(input.lanes as number)) throw new MatchError(400, 'Choose two or three lanes.');
  const pace = (input.pace ?? 'async') as Pace;
  if (!(pace in TIME_BANKS)) throw new MatchError(400, 'Choose live or at your own pace.');
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

  const bank = TIME_BANKS[pace];
  const inserted = await db.query<{ id: string }>(
    `insert into matches (player_a, player_b, setup, waiting_on, pace, bank_a_ms, bank_b_ms)
     values ($1, $2, $3, $2, $4, $5, $5) returning id`,
    [user.id, opponentId, JSON.stringify(setup), pace, bank],
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
    // Banks start now: nobody has been waiting on a game yet.
    const { state } = createGame(row.setup);
    await saveProgress(client, { ...row, status: 'active', waiting_on: null }, { state }, []);
    await client.query('update matches set started_at = now() where id = $1', [matchId]);
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

/** Ends a match in progress: this side gives up and the other side wins. */
async function resignRow(client: pg.PoolClient, row: MatchRow, side: Side): Promise<void> {
  const banks = banksNow(row);
  await client.query(
    `update matches set status = 'finished', waiting_on = null, waiting_due = null, bank_a_ms = $3, bank_b_ms = $4,
       winner = $2, end_reason = 'resigned', finished_at = now()
     where id = $1`,
    [row.id, playerOn(row, otherSide(side)), banks?.A ?? null, banks?.B ?? null],
  );
}

export async function resign(db: pg.Pool, user: User, matchId: number): Promise<MatchSummary> {
  await inTransaction(db, async (client) => {
    const { row, side } = await loadRow(client, matchId, user, true);
    if (row.status !== 'active') throw new MatchError(409, 'This match is not in progress.');
    await resignRow(client, row, side);
  });
  const { row, side } = await loadRow(db, matchId, user);
  return toSummary(row, side, user.id);
}

/**
 * A player is leaving for good (unlinking their Discord account): their matches in progress
 * count as resigned, so the opponent wins, and open challenges either way are turned down.
 * Finished matches stay as they are, for the other player's history. Call inside the unlink's
 * transaction. Returns the changes to tell the opponents about.
 */
export async function leaveAllMatches(client: pg.PoolClient, userId: number): Promise<ClockNotice[]> {
  const { rows } = await client.query<MatchRow>(
    `select ${MATCH_COLUMNS} from ${MATCH_FROM}
     where (m.player_a = $1 or m.player_b = $1) and m.status in ('challenged', 'active')
     order by m.id for update of m`,
    [userId],
  );
  const notices: ClockNotice[] = [];
  for (const row of rows) {
    const side: Side = Number(row.player_a) === userId ? 'A' : 'B';
    if (row.status === 'active') await resignRow(client, row, side);
    else await client.query(`update matches set status = 'declined', waiting_on = null, finished_at = now() where id = $1`, [row.id]);
    const after = (await loadRowById(client, Number(row.id)))!;
    notices.push({ playerIds: [playerOn(row, otherSide(side))], change: { matchId: Number(row.id), status: after.status, moveCount: after.move_count } });
  }
  return notices;
}

/**
 * Makes one move. seen is the match's move count when the player chose it; if the match has
 * moved on since (a double click, or another tab), the move is refused and the player should
 * reload. If the other player is out of time, the computer's moves for them follow straight
 * away. Returns the player's updated view and the events since their move.
 */
export async function makeMove(db: pg.Pool, user: User, matchId: number, sent: unknown, seen: unknown): Promise<MatchDetail> {
  return inTransaction(db, async (client) => {
    // Locking the match row means two moves in the same match are handled one at a time.
    const { row, side } = await loadRow(client, matchId, user, true);
    if (row.status === 'challenged') throw new MatchError(409, "This match hasn't started yet.");
    if (row.status !== 'active') throw new MatchError(409, 'This match is over.');
    if (seen !== row.move_count) throw new MatchError(409, 'The match has moved on. Reload to see the latest.', 'stale');
    if (row.overdue) throw new MatchError(409, 'Your time ran out. Reload to see the latest.', 'stale');

    const game = rebuild(row.setup, await loadMoves(client, matchId));
    const legal = autopilotOf(row)[side] ? [] : legalActions(game.state, side);
    if (!legal.length) throw new MatchError(409, "It isn't your decision right now.");
    const move = findLegal(legal, sent);
    if (!move) throw new MatchError(400, "That move isn't allowed right now.");

    const result = applyAction(game.state, move);
    game.state = result.state;
    game.events.push(result.events);
    const moves: NewMove[] = [{ action: move, side, byComputer: false }, ...computerMoves(row, game, autopilotOf(row))];
    await saveProgress(client, row, game, moves);

    const after = await loadRow(client, matchId, user);
    return detail(after.row, side, user.id, game, row.move_count);
  });
}

// ---- Running out of time ----

/** A match changed without either player asking (a bank ran out): who to tell, and what to say. */
export interface ClockNotice {
  playerIds: number[];
  change: MatchChange;
}

/**
 * Deals with every match whose waiting player has run out of time. Called every half minute
 * and before handling match requests, so a deadline is kept even if the server was asleep when
 * it passed. Returns the matches that changed.
 */
export async function settleOverdue(db: pg.Pool): Promise<ClockNotice[]> {
  const { rows } = await db.query<{ id: string }>(
    `select id from matches where status = 'active' and waiting_due <= now() order by waiting_due limit 50`,
  );
  const notices: ClockNotice[] = [];
  for (const { id } of rows) {
    const notice = await inTransaction(db, (client) => runOutOfTime(client, Number(id)));
    if (notice) notices.push(notice);
  }
  return notices;
}

async function runOutOfTime(client: pg.PoolClient, matchId: number): Promise<ClockNotice | null> {
  const row = await loadRowById(client, matchId, true);
  // Someone else may have dealt with it already.
  if (!row || row.status !== 'active' || !row.overdue) return null;
  const side = waitingSide(row)!;
  const game = rebuild(row.setup, await loadMoves(client, matchId));

  const { rows } = await client.query<{ n: number }>(
    'select count(*)::int as n from match_events where match_id = $1 and player_id = $2 and not by_computer',
    [matchId, playerOn(row, side)],
  );
  if (rows[0]!.n === 0) {
    // Never made a move: a no-show forfeits.
    await saveProgress(client, row, game, [], { forfeitBy: side });
  } else {
    const autopilot = { ...autopilotOf(row), [side]: true };
    await saveProgress(client, row, game, computerMoves(row, game, autopilot), { autopilot });
  }

  const after = (await loadRowById(client, matchId))!;
  return {
    playerIds: [Number(row.player_a), Number(row.player_b)],
    change: { matchId, status: after.status, moveCount: after.move_count },
  };
}
