// The simulation tooling for v0.17 (PLAN.md, Phase 0): interval math, per-game tallies, the
// prepare hook, and the Constructed roster pairs used for pricing.
import { describe, expect, it } from 'vitest';
import { heuristicAgent } from '../src/ai/heuristic';
import { runGame } from '../src/ai/runGame';
import { prototypeCards } from '../src/data/prototype';
import { createGame, deckProblems, makeConfig } from '../src/engine';
import type { PlayerCardDef } from '../src/engine/cards';
import { insideRange, meanInterval, pairedRatioDifference, ratioInterval } from '../src/sim/confidence';
import { costGapPairs, defenseVsStrikerPairs } from '../src/sim/rosters';
import { simulate } from '../src/sim/simulate';
import { winChance } from '../src/sim/stats';
import { matchSeeds, measure, shieldExampleChance, TARGETS, verdict } from '../src/sim/targets';

const config = makeConfig();

describe('confidence intervals', () => {
  it('gives the mean with ±1.96 standard errors', () => {
    // Values 0 and 2, 50 of each: mean 1, sample sd ≈ 1.005, standard error ≈ 0.1005.
    const values = [...Array<number>(50).fill(0), ...Array<number>(50).fill(2)];
    const interval = meanInterval(values);
    expect(interval.value).toBe(1);
    expect(interval.high - interval.value).toBeCloseTo(1.96 * Math.sqrt(100 / 99) / 10, 6);
  });

  it('treats a per-game average as a share with every bottom 1', () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6];
    expect(ratioInterval(values, values.map(() => 1))).toEqual(meanInterval(values));
  });

  it('gives a share as the sum of tops over the sum of bottoms', () => {
    expect(ratioInterval([1, 0, 2], [2, 1, 2]).value).toBeCloseTo(3 / 5);
  });

  it('finds no change between identical runs', () => {
    const run = { tops: [1, 2, 3, 4], bottoms: [1, 1, 1, 1] };
    expect(pairedRatioDifference(run, run)).toMatchObject({ value: 0, low: 0, high: 0 });
  });

  it('measures a steady change exactly when every seed moves the same', () => {
    const before = { tops: [1, 2, 3, 4], bottoms: [1, 1, 1, 1] };
    const after = { tops: [2, 3, 4, 5], bottoms: [1, 1, 1, 1] };
    expect(pairedRatioDifference(before, after)).toMatchObject({ value: 1, low: 1, high: 1 });
  });

  it('checks an interval against a target range', () => {
    expect(insideRange({ value: 40, low: 38, high: 42, n: 10 }, 30, 50)).toBe(true);
    expect(insideRange({ value: 49, low: 47, high: 51, n: 10 }, 30, 50)).toBe(false);
  });
});

describe('contest chances', () => {
  it('matches the shot table in PLAN.md (ties go to the goalie)', () => {
    expect(winChance(5, 6, 6)).toBeCloseTo(10 / 36);
    expect(winChance(5, 5, 6)).toBeCloseTo(15 / 36);
    expect(winChance(6, 5, 6)).toBeCloseTo(21 / 36);
    expect(winChance(5, 0, 6)).toBeCloseTo(35 / 36);
  });

  it("works out an unanswered Shield with the engine's own scoring (PLAN.md's Shot 5 vs Save 6 table)", () => {
    expect(shieldExampleChance(makeConfig({ shieldEffect: 'zero' }))).toBeCloseTo(35 / 36);
    expect(shieldExampleChance(makeConfig({ shieldEffect: 'half' }))).toBeCloseTo(26 / 36);
    expect(shieldExampleChance(makeConfig({ shieldEffect: 'minus', shieldAmount: 3 }))).toBeCloseTo(26 / 36);
    expect(shieldExampleChance(makeConfig({ shieldEffect: 'minus', shieldAmount: 2 }))).toBeCloseTo(21 / 36);
  });
});

describe('per-game tallies', () => {
  const result = simulate({ games: 20, seed: 7, config, cardSet: prototypeCards });
  const tallies = result.stats.tallies;

  it('keeps one tally per game, matching the totals', () => {
    expect(result.crashes).toEqual([]);
    expect(tallies).toHaveLength(20);
    expect(tallies.reduce((sum, t) => sum + t.goals, 0)).toBe(result.stats.goals);
    expect(tallies.reduce((sum, t) => sum + t.shots, 0)).toBe(result.stats.shots);
    expect(tallies.reduce((sum, t) => sum + t.carriedOff, 0)).toBe(result.stats.carriedOff);
    // SimStats counts injury cards and carry-offs; the tallies also count Shaken and knocked out.
    const injuries = Object.values(result.stats.injuries).flatMap((bySource) => Object.values(bySource)).reduce((a, b) => a + b, 0);
    expect(tallies.reduce((sum, t) => sum + t.injured + t.carriedOff, 0)).toBe(injuries);
  });

  it('splits every hurt into exactly one result', () => {
    for (const t of tallies) expect(t.shaken + t.injured + t.knockedOut + t.carriedOff).toBe(t.hurts);
  });

  it('counts shots at a goalie for the Shield measure', () => {
    for (const t of tallies) {
      expect(t.shieldShots).toBeLessThanOrEqual(t.shots);
      expect(t.shieldChanceSum).toBeLessThanOrEqual(t.shieldShots);
    }
  });

  it('plays exactly the seeds asked for, so runs can be split and paired', () => {
    const part = simulate({ games: 2, seed: 7, seeds: [700_003, 700_011], config, cardSet: prototypeCards });
    expect(part.stats.tallies.map((t) => t.seed)).toEqual([700_003, 700_011]);
    expect(part.stats.tallies[0]).toEqual(tallies[3]);
  });

  it('pairs two runs by seed', () => {
    const [b, a] = matchSeeds(tallies, [...tallies].reverse().slice(5));
    expect(b.map((t) => t.seed)).toEqual(a.map((t) => t.seed));
    expect(b).toHaveLength(15);
  });

  it('judges targets by the whole interval', () => {
    const turns = TARGETS.find((m) => m.label === 'Turns per game')!;
    expect(verdict(turns, { value: 40, low: 38, high: 42, n: 1 })).toBe('met');
    expect(verdict(turns, { value: 50, low: 48, high: 52, n: 1 })).toBe('borderline');
    expect(verdict(turns, { value: 60, low: 58, high: 62, n: 1 })).toBe('missed');
    expect(measure(turns, tallies).value).toBeCloseTo(tallies.reduce((s, t) => s + t.turns, 0) / 20);
  });
});

describe('the prepare hook', () => {
  it("changes the new game before anyone acts, without touching the engine's setup", () => {
    let seenSpeed: number[] = [];
    const record = runGame(
      { seed: 3, cardSet: prototypeCards, config },
      { A: heuristicAgent(1, config), B: heuristicAgent(2, config) },
      {
        prepare: (state) => {
          for (const [uid, def] of Object.entries(state.cards)) {
            if (uid.startsWith('A') && def.kind === 'field') state.cards[uid] = { ...def, speed: 9 };
          }
        },
        onStart: (state) => {
          seenSpeed = Object.entries(state.cards).filter(([uid, d]) => uid.startsWith('A') && d.kind === 'field').map(([, d]) => (d.kind === 'field' ? d.speed : 0));
        },
      },
    );
    expect(seenSpeed.length).toBeGreaterThan(0);
    expect(seenSpeed.every((s) => s === 9)).toBe(true);
    expect(record.final.result).not.toBeNull();
    const unchanged = createGame({ seed: 3, cardSet: prototypeCards, config }).state;
    expect(Object.values(unchanged.cards).some((d) => d.kind === 'field' && d.speed !== 9)).toBe(true);
  });
});

describe('Constructed roster pairs', () => {
  // A stand-in cost until real costs are measured: the sum of the card's numbers.
  const cost = (c: PlayerCardDef) => (c.kind === 'goalie' ? 2 * c.save : c.speed + c.shot + c.defense + c.faceoff);
  const spells = prototypeCards.teams.find((t) => t.id === 'A')!.spells!;
  const roleOf = new Map(prototypeCards.cards.map((c) => [c.id, c.kind === 'field' || c.kind === 'goalie' ? c.role : c.kind]));
  const roles = (ids: string[]) => ids.map((id) => roleOf.get(id));

  it('builds legal Defense-heavy and Striker-heavy decks at equal cost', () => {
    const pairs = defenseVsStrikerPairs(prototypeCards, config, cost, spells, 3, 42);
    expect(pairs).toHaveLength(3);
    for (const p of pairs) {
      expect(deckProblems(prototypeCards, p.first, config)).toEqual([]);
      expect(deckProblems(prototypeCards, p.second, config)).toEqual([]);
      expect(Math.abs(p.firstCost - p.secondCost) / ((p.firstCost + p.secondCost) / 2)).toBeLessThanOrEqual(0.01);
      const first = roles(p.first);
      const second = roles(p.second);
      expect(first.filter((r) => r === 'stopper' || r === 'anchor')).toHaveLength(14);
      expect(second.filter((r) => r === 'striker' || r === 'runner')).toHaveLength(14);
      // The goalies and middle players are shared.
      expect(p.first.slice(0, 10)).toEqual(p.second.slice(0, 10));
      expect(first.slice(2, 10).every((r) => r === 'playmaker' || r === 'allrounder')).toBe(true);
    }
  });

  it('builds legal decks where one costs 10% (±1%) more', () => {
    const pairs = costGapPairs(prototypeCards, config, cost, spells, 3, 42);
    for (const p of pairs) {
      expect(deckProblems(prototypeCards, p.first, config)).toEqual([]);
      expect(deckProblems(prototypeCards, p.second, config)).toEqual([]);
      expect(p.secondCost / p.firstCost).toBeGreaterThanOrEqual(1.09);
      expect(p.secondCost / p.firstCost).toBeLessThanOrEqual(1.11);
    }
  });

  it('builds the same pairs from the same seed, and the decks play', () => {
    expect(costGapPairs(prototypeCards, config, cost, spells, 2, 9)).toEqual(costGapPairs(prototypeCards, config, cost, spells, 2, 9));
    const [pair] = defenseVsStrikerPairs(prototypeCards, config, cost, spells, 1, 9);
    const record = runGame(
      { seed: 1, cardSet: prototypeCards, config, decks: { A: pair!.first, B: pair!.second } },
      { A: heuristicAgent(1, config), B: heuristicAgent(2, config) },
    );
    expect(record.final.result).not.toBeNull();
  });
});
