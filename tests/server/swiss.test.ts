// Tournament sums: Swiss standings, pairings, and the knockout bracket (server/swiss.ts). No
// database needed.

import { describe, expect, it } from 'vitest';
import {
  bracketSeeds, knockoutWinner, MATCH_WIN_FLOOR, pairRound, standings, swissRounds, topCutSize, type Pairing,
} from '../../server/swiss';

const pairing = (round: number, a: number, b: number | null, outcome: Pairing['outcome'], goalsA = 0, goalsB = 0): Pairing =>
  ({ round, a, b, outcome, goalsA, goalsB });

describe('tournament size', () => {
  it('plays about log2 Swiss rounds', () => {
    expect(swissRounds(4)).toBe(2);
    expect(swissRounds(5)).toBe(3);
    expect(swissRounds(64)).toBe(6);
    expect(swissRounds(128)).toBe(7);
  });

  it('cuts to 8 from 32 players, 4 below that, and none under 6', () => {
    expect(topCutSize(40)).toBe(8);
    expect(topCutSize(32)).toBe(8);
    expect(topCutSize(31)).toBe(4);
    expect(topCutSize(6)).toBe(4);
    expect(topCutSize(5)).toBe(0);
  });
});

describe('standings', () => {
  it('scores win 3, draw 1, loss 0, and a bye as a win', () => {
    const table = standings([1, 2, 3, 4, 5], [
      pairing(1, 1, 2, 'A', 2, 1),
      pairing(1, 3, 4, 'draw', 1, 1),
      pairing(1, 5, null, 'bye'),
    ], new Set(), 7);
    const of = (id: number) => table.find((s) => s.userId === id)!;
    expect(of(1)).toMatchObject({ points: 3, wins: 1, goalDifference: 1 });
    expect(of(2)).toMatchObject({ points: 0, losses: 1, goalDifference: -1 });
    expect(of(3)).toMatchObject({ points: 1, draws: 1 });
    expect(of(5)).toMatchObject({ points: 3, wins: 1, byes: 1, goalDifference: 0 });
  });

  it('a double loss is a loss for both players', () => {
    const table = standings([1, 2], [pairing(1, 1, 2, 'double_loss')], new Set(), 1);
    expect(table.every((s) => s.points === 0 && s.losses === 1)).toBe(true);
  });

  it('leaves out matches still being played', () => {
    const table = standings([1, 2], [pairing(1, 1, 2, null)], new Set(), 1);
    expect(table.every((s) => s.points === 0 && s.wins + s.losses + s.draws === 0)).toBe(true);
  });

  it('breaks ties on opponents\' match-win percentage, with a 33% floor', () => {
    // 1 and 3 both have 3 points. 1 beat 2, who then won; 3 beat 4, who then lost.
    const table = standings([1, 2, 3, 4, 5, 6], [
      pairing(1, 1, 2, 'A'), pairing(1, 3, 4, 'A'), pairing(1, 5, 6, 'A'),
      pairing(2, 2, 6, 'A'), pairing(2, 4, 5, 'B'), pairing(2, 1, 3, 'draw'),
    ], new Set(), 3);
    const of = (id: number) => table.find((s) => s.userId === id)!;
    // 4 lost both: 0%, counted as 33%.
    expect(of(3).opponentsWin).toBeCloseTo((MATCH_WIN_FLOOR + 4 / 6) / 2, 6);
    expect(of(1).opponentsWin).toBeGreaterThan(of(3).opponentsWin);
    expect(of(1).rank).toBeLessThan(of(3).rank);
  });

  it('then on goal difference, then a random draw fixed by the seed', () => {
    const results = [pairing(1, 1, 2, 'A', 3, 0), pairing(1, 3, 4, 'A', 1, 0)];
    const table = standings([1, 2, 3, 4], results, new Set(), 9);
    // 1 and 3 have the same points and the same opponents' record; 1 won by more.
    expect(table[0]!.userId).toBe(1);
    expect(table[1]!.userId).toBe(3);
    // Full ties: the same seed always gives the same order.
    const tied = () => standings([1, 2, 3, 4], [], new Set(), 9).map((s) => s.userId);
    expect(tied()).toEqual(tied());
  });

  it('keeps dropped players in the table, marked', () => {
    const table = standings([1, 2], [pairing(1, 1, 2, 'B')], new Set([1]), 1);
    expect(table.find((s) => s.userId === 1)!.dropped).toBe(true);
  });
});

describe('Swiss pairings', () => {
  it('pairs everyone once, with a bye for the odd player out', () => {
    const round = pairRound([1, 2, 3, 4, 5], [], 11, 1);
    expect(round).toHaveLength(3);
    const seen = round.flatMap((p) => (p.b === null ? [p.a] : [p.a, p.b]));
    expect(new Set(seen).size).toBe(5);
    expect(round.filter((p) => p.b === null)).toHaveLength(1);
    // Byes are listed last.
    expect(round[2]!.b).toBeNull();
  });

  it('gives the bye to the lowest-ranked player who has not had one', () => {
    const previous = [pairing(1, 5, null, 'bye')];
    const round = pairRound([1, 2, 3, 4, 5], previous, 11, 2);
    expect(round.find((p) => p.b === null)!.a).toBe(4);
  });

  it('pairs neighbours in the standings and avoids rematches', () => {
    const previous = [pairing(1, 1, 2, 'A'), pairing(1, 3, 4, 'A')];
    const round = pairRound([1, 3, 2, 4], previous, 5, 2);
    const pairs = round.map((p) => [p.a, p.b].sort());
    expect(pairs).toContainEqual([1, 3]);
    expect(pairs).toContainEqual([2, 4]);
  });

  it('looks further down the standings rather than repeat a match', () => {
    // 1 has already met 2, so 1 plays 3 and 2 plays 4.
    const previous = [pairing(1, 1, 2, 'A'), pairing(1, 3, 4, 'B')];
    const round = pairRound([1, 2, 3, 4], previous, 5, 2);
    const pairs = round.map((p) => [p.a, p.b].sort());
    expect(pairs).toContainEqual([1, 3]);
    expect(pairs).toContainEqual([2, 4]);
  });

  it('allows a rematch only when everyone has met', () => {
    const previous = [pairing(1, 1, 2, 'A')];
    expect(pairRound([1, 2], previous, 5, 2)).toHaveLength(1);
  });

  it('is the same every time for the same seed', () => {
    const players = Array.from({ length: 16 }, (_, i) => i + 1);
    expect(pairRound(players, [], 42, 1)).toEqual(pairRound(players, [], 42, 1));
  });

  it('never repeats a match over a whole 64-player event', () => {
    const players = Array.from({ length: 64 }, (_, i) => i + 1);
    const all: Pairing[] = [];
    for (let round = 1; round <= swissRounds(players.length); round++) {
      const table = standings(players, all, new Set(), 3);
      for (const p of pairRound(table.map((s) => s.userId), all, 3, round)) {
        all.push(pairing(round, p.a, p.b, p.b === null ? 'bye' : (p.a + round) % 3 === 0 ? 'B' : 'A'));
      }
    }
    const keys = all.filter((p) => p.b !== null).map((p) => [p.a, p.b!].sort().join('-'));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the knockout', () => {
  it('seeds the bracket so the top two can only meet in the final', () => {
    expect(bracketSeeds(2)).toEqual([[1, 2]]);
    expect(bracketSeeds(4)).toEqual([[1, 4], [2, 3]]);
    expect(bracketSeeds(8)).toEqual([[1, 8], [4, 5], [2, 7], [3, 6]]);
  });

  it('sends the higher seed through when the deadline settles it as a tie', () => {
    const seeds = new Map([[10, 1], [20, 4]]);
    const seedOf = (id: number) => seeds.get(id)!;
    expect(knockoutWinner({ a: 20, b: 10, outcome: 'A' }, seedOf)).toBe(20);
    expect(knockoutWinner({ a: 20, b: 10, outcome: 'draw' }, seedOf)).toBe(10);
    expect(knockoutWinner({ a: 20, b: 10, outcome: 'double_loss' }, seedOf)).toBe(10);
  });
});
