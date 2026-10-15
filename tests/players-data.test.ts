// The name lists (data/names.json) and the named player cards made by scripts/generate-players.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYER_ROLES, POOL_TEAM, type PlayerCardDef } from '../src/engine/cards';
import { FIELD_STAT_MAX, FIELD_TYPES, GOALIE_SAVE_MAX, GOALIE_SAVE_MIN } from '../src/data/playerTypes';
import { playerCost, type PlayerValues } from '../src/data/pricing';
import { prototypeCards } from '../src/data/prototype';
import { DEFAULT_CONFIG } from '../src/engine/config';

const names = JSON.parse(readFileSync(new URL('../data/names.json', import.meta.url), 'utf8')) as {
  givenNames: string[];
  surnames: string[];
  compoundSurnames: [string, string][];
};
const players = prototypeCards.cards.filter((c): c is PlayerCardDef => c.team === POOL_TEAM && c.kind !== 'spell');
const allSurnames = [...names.surnames, ...names.compoundSurnames.map(([a, b]) => `${a}-${b}`)];

describe('name lists', () => {
  it('has 100 different given names, 30 surnames, and 10 compound surnames made from them', () => {
    expect(new Set(names.givenNames).size).toBe(100);
    expect(new Set(names.surnames).size).toBe(30);
    expect(names.compoundSurnames).toHaveLength(10);
    for (const [a, b] of names.compoundSurnames) {
      expect(names.surnames).toContain(a);
      expect(names.surnames).toContain(b);
      expect(a).not.toBe(b);
    }
    expect(new Set(allSurnames).size).toBe(40);
  });

  it('uses single words, so a full name splits cleanly into given name and surname', () => {
    for (const name of [...names.givenNames, ...names.surnames]) expect(name).toMatch(/^[A-Z][a-z]+$/);
  });
});

describe('named players', () => {
  it('has 100 players, split about evenly across the 7 types', () => {
    expect(players).toHaveLength(100);
    for (const role of PLAYER_ROLES) {
      const count = players.filter((p) => p.role === role).length;
      expect(count).toBeGreaterThanOrEqual(14);
      expect(count).toBeLessThanOrEqual(15);
    }
  });

  it('names every player from the lists, each given name once', () => {
    const given = players.map((p) => p.name.split(' ')[0]!);
    expect(new Set(given).size).toBe(100);
    for (const p of players) {
      const [first, last, ...rest] = p.name.split(' ');
      expect(rest).toEqual([]);
      expect(names.givenNames).toContain(first);
      expect(allSurnames).toContain(last);
    }
  });

  it("gives each field player 1 to 4 points over their type's base stats, mostly 1, within the card limits", () => {
    const added = [0, 0, 0, 0, 0];
    for (const p of players) {
      if (p.kind === 'goalie') {
        expect([GOALIE_SAVE_MIN, GOALIE_SAVE_MAX]).toContain(p.save);
        continue;
      }
      const type = FIELD_TYPES[p.role as keyof typeof FIELD_TYPES];
      const stats = { speed: p.speed, shot: p.shot, defense: p.defense, faceoff: p.faceoff };
      let points = 0;
      for (const [stat, value] of Object.entries(stats)) {
        const base = type.base[stat as keyof typeof stats];
        expect(value).toBeGreaterThanOrEqual(base);
        expect(value).toBeLessThanOrEqual(FIELD_STAT_MAX);
        points += value - base;
      }
      expect(points, p.id).toBeGreaterThanOrEqual(1);
      expect(points, p.id).toBeLessThanOrEqual(4);
      added[points]! += 1;
    }
    // The generator's 40/30/20/10 mix over all 100 players, less the goalies' share.
    expect(added).toEqual([0, 35, 25, 18, 8]);
  });

  it("puts most bonus points into each type's main stat", () => {
    for (const [role, type] of Object.entries(FIELD_TYPES)) {
      if (role === 'allrounder') continue;
      const main = Object.entries(type.weights).sort((a, b) => b[1] - a[1])[0]![0] as 'speed' | 'shot' | 'defense' | 'faceoff';
      const ofType = players.filter((p) => p.role === role && p.kind === 'field');
      const gains = Object.keys(type.base).map((stat) => {
        const s = stat as typeof main;
        return [s, ofType.reduce((sum, p) => sum + ((p as unknown as Record<string, number>)[s]! - type.base[s]), 0)] as const;
      });
      const best = gains.sort((a, b) => b[1] - a[1])[0]![0];
      expect(best, role).toBe(main);
    }
  });
});

describe('player costs (v0.17)', () => {
  const values = JSON.parse(readFileSync(new URL('../data/player-values.json', import.meta.url), 'utf8')) as PlayerValues;
  const average = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;

  it('gives every player the cost the measured values make (npm run price-players)', () => {
    for (const p of players) expect(p.cost, p.id).toBe(playerCost(p, values));
  });

  it('makes the average player cost about 10, and no player free', () => {
    expect(players.every((p) => (p.cost ?? 0) >= 1)).toBe(true);
    expect(average(players.filter((p) => p.kind === 'field').map((p) => p.cost!))).toBeCloseTo(10, 0);
    expect(average(players.filter((p) => p.kind === 'goalie').map((p) => p.cost!))).toBeCloseTo(10, 0);
  });

  it('sets the team cap at the cost of an average team', () => {
    const field = average(players.filter((p) => p.kind === 'field').map((p) => p.cost!));
    const goalies = average(players.filter((p) => p.kind === 'goalie').map((p) => p.cost!));
    expect(DEFAULT_CONFIG.rosterCap).toBe(Math.round(DEFAULT_CONFIG.deckFieldPlayers * field + DEFAULT_CONFIG.deckGoalies * goalies));
  });

  it('charges more for a better card of the same kind', () => {
    for (const p of players) {
      if (p.kind !== 'goalie') continue;
      const better = { ...p, save: p.save + 1 };
      expect(playerCost(better, values)).toBeGreaterThanOrEqual(p.cost!);
    }
  });
});
