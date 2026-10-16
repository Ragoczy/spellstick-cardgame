// Tournament sums: Swiss standings, Swiss pairings, and the top-cut bracket. Pure functions, no
// database, so they're easy to test. See docs/spellstick-multiplayer-design.md, "Tournaments".
//
// Scoring (decided 2026-10-12): win 3, draw 1, loss 0; a bye counts as a win. Tiebreakers, in
// order: opponents' match-win percentage (anyone under 33% counts as 33%), goal difference, then
// a random draw from the tournament's seed.

import { seedToState, shuffle } from '../src/engine/rng';

export const POINTS = { win: 3, draw: 1, loss: 0 } as const;
/** Opponents below this match-win percentage count as this much (stops one weak opponent sinking you). */
export const MATCH_WIN_FLOOR = 1 / 3;
/** Fewest players a tournament can start with. */
export const MIN_ENTRANTS = 4;

/**
 * How one pairing ended. A and B are the players' sides. double_loss: neither player made a move
 * before the round deadline, so both lose. Null: still being played.
 */
export type Outcome = 'A' | 'B' | 'draw' | 'double_loss' | 'bye';

export interface Pairing {
  round: number;
  /** User ids. b is null for a bye. */
  a: number;
  b: number | null;
  outcome: Outcome | null;
  goalsA: number;
  goalsB: number;
}

export interface Standing {
  userId: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  /** Byes count as wins above, and are also counted here. */
  byes: number;
  /** Opponents' match-win percentage, 0 to 1. */
  opponentsWin: number;
  goalDifference: number;
  dropped: boolean;
  /** 1 for the leader. Every player has a different rank (the random draw settles full ties). */
  rank: number;
}

/** Swiss rounds for this many players: about log2, rounded up. 64 players → 6 rounds. */
export function swissRounds(players: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, players))));
}

/**
 * How many players go through to the knockout: 8, or 4 under 32 players. Under 6 players there's
 * no knockout: the Swiss standings decide the champion (a top 4 of 4 or 5 would only replay Swiss).
 */
export function topCutSize(players: number): number {
  if (players >= 32) return 8;
  if (players >= 6) return 4;
  return 0;
}

/** Each player's place in a random order fixed by the tournament seed: the last tiebreaker. */
function randomOrder(userIds: number[], seed: number): Map<number, number> {
  const [order] = shuffle([...userIds].sort((x, y) => x - y), seedToState(seed));
  return new Map(order.map((id, i) => [id, i]));
}

/** Who did a player face (byes left out)? */
function opponentsOf(userId: number, pairings: Pairing[]): number[] {
  const result: number[] = [];
  for (const p of pairings) {
    if (p.b === null) continue;
    if (p.a === userId) result.push(p.b);
    else if (p.b === userId) result.push(p.a);
  }
  return result;
}

/**
 * The standings from finished Swiss pairings (pairings still being played are left out).
 * dropped: players who left; they keep their results and still count for their opponents.
 */
export function standings(userIds: number[], pairings: Pairing[], dropped: Set<number>, seed: number): Standing[] {
  const done = pairings.filter((p) => p.outcome !== null);
  const rows = new Map<number, Standing>();
  for (const id of userIds) {
    rows.set(id, { userId: id, points: 0, wins: 0, losses: 0, draws: 0, byes: 0, opponentsWin: 0, goalDifference: 0, dropped: dropped.has(id), rank: 0 });
  }
  const add = (id: number, result: 'win' | 'loss' | 'draw', goalDifference: number) => {
    const row = rows.get(id);
    if (!row) return;
    row.points += POINTS[result];
    if (result === 'win') row.wins += 1;
    else if (result === 'loss') row.losses += 1;
    else row.draws += 1;
    row.goalDifference += goalDifference;
  };
  for (const p of done) {
    if (p.outcome === 'bye') {
      add(p.a, 'win', 0);
      rows.get(p.a)!.byes += 1;
      continue;
    }
    if (p.b === null) continue;
    const diff = p.goalsA - p.goalsB;
    if (p.outcome === 'A') { add(p.a, 'win', diff); add(p.b, 'loss', -diff); }
    else if (p.outcome === 'B') { add(p.a, 'loss', diff); add(p.b, 'win', -diff); }
    else if (p.outcome === 'draw') { add(p.a, 'draw', diff); add(p.b, 'draw', -diff); }
    else { add(p.a, 'loss', 0); add(p.b, 'loss', 0); }
  }

  /** A player's own match-win percentage, never under the floor. */
  const matchWin = (id: number): number => {
    const row = rows.get(id);
    const played = row ? row.wins + row.losses + row.draws : 0;
    return played ? Math.max(MATCH_WIN_FLOOR, row!.points / (POINTS.win * played)) : MATCH_WIN_FLOOR;
  };
  for (const row of rows.values()) {
    const opponents = opponentsOf(row.userId, done);
    row.opponentsWin = opponents.length ? opponents.reduce((sum, id) => sum + matchWin(id), 0) / opponents.length : 0;
  }

  const random = randomOrder(userIds, seed);
  const sorted = [...rows.values()].sort((x, y) =>
    y.points - x.points
    // Rounded so two equal averages worked out in a different order still count as a tie.
    || Math.round(y.opponentsWin * 1e6) - Math.round(x.opponentsWin * 1e6)
    || y.goalDifference - x.goalDifference
    || random.get(x.userId)! - random.get(y.userId)!);
  sorted.forEach((row, i) => { row.rank = i + 1; });
  return sorted;
}

/** Most steps the pairing search takes before giving up on avoiding every rematch. */
const SEARCH_LIMIT = 200_000;

/**
 * Pairs the next Swiss round. ranked: the players still in, best first (from standings(); for the
 * first round, any order: it's shuffled). Nobody meets the same opponent twice if that can be
 * avoided. With an odd number, the lowest-ranked player who hasn't had a bye gets one. Players
 * near each other in the standings meet; who plays side A is random.
 */
export function pairRound(ranked: number[], previous: Pairing[], seed: number, round: number): { a: number; b: number | null }[] {
  let rng = seedToState(seed * 31 + round);
  let order = ranked;
  if (round === 1) [order, rng] = shuffle(ranked, rng);

  const result: { a: number; b: number | null }[] = [];
  let players = [...order];
  if (players.length % 2 === 1) {
    const hadBye = new Set(previous.filter((p) => p.b === null).map((p) => p.a));
    const byeTo = [...players].reverse().find((id) => !hadBye.has(id)) ?? players[players.length - 1]!;
    players = players.filter((id) => id !== byeTo);
    result.push({ a: byeTo, b: null });
  }

  const met = new Set<string>();
  for (const p of previous) if (p.b !== null) met.add(pairKey(p.a, p.b));

  let steps = 0;
  const search = (left: number[]): [number, number][] | null => {
    if (!left.length) return [];
    const [first, ...rest] = left;
    for (const other of rest) {
      if (++steps > SEARCH_LIMIT) return null;
      if (met.has(pairKey(first!, other))) continue;
      const after = search(rest.filter((id) => id !== other));
      if (after) return [[first!, other], ...after];
    }
    return null;
  };
  // In a very small event everyone may have met already: then pair in standings order.
  const pairs = search(players) ?? inOrder(players);

  for (const [x, y] of pairs) {
    let coin: number[];
    [coin, rng] = shuffle([0, 1], rng);
    result.push(coin[0] === 0 ? { a: x, b: y } : { a: y, b: x });
  }
  // Byes go last, so table 1 is the top match.
  return [...result.filter((p) => p.b !== null), ...result.filter((p) => p.b === null)];
}

function inOrder(players: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < players.length; i += 2) pairs.push([players[i]!, players[i + 1]!]);
  return pairs;
}

function pairKey(x: number, y: number): string {
  return x < y ? `${x}-${y}` : `${y}-${x}`;
}

/**
 * The first knockout round as seed numbers (1 = best), so the top two seeds can only meet in the
 * final: for 8, 1v8, 4v5, 2v7, 3v6.
 */
export function bracketSeeds(size: number): [number, number][] {
  let order = [1];
  while (order.length < size) {
    const total = order.length * 2 + 1;
    order = order.flatMap((s) => [s, total - s]);
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i]!, order[i + 1]!]);
  return pairs;
}

/**
 * Who goes through from a knockout match. A knockout game played to the end always has a winner
 * (a tie goes to a penalty shootout). If the round deadline settles it as a tie, or neither player
 * moved, the higher seed goes through.
 */
export function knockoutWinner(p: { a: number; b: number; outcome: Outcome }, seedOf: (userId: number) => number): number {
  if (p.outcome === 'A') return p.a;
  if (p.outcome === 'B') return p.b;
  return seedOf(p.a) <= seedOf(p.b) ? p.a : p.b;
}
