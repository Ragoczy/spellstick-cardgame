// The name lists (data/names.json) and the named player cards made by scripts/generate-players.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYER_ROLES, POOL_TEAM, type PlayerCardDef } from '../src/engine/cards';
import { FIELD_STAT_MAX, FIELD_TYPES, GOALIE_BASE_SAVE, SAVE_MAX } from '../src/data/playerTypes';
import { prototypeCards } from '../src/data/prototype';

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

  it('gives each player 1 to 4 bonus points, mostly +1 (40/30/20/10)', () => {
    const count = (n: number) => players.filter((p) => p.bonusPoints === n).length;
    expect([count(1), count(2), count(3), count(4)]).toEqual([40, 30, 20, 10]);
  });

  it("adds exactly the bonus points to the type's base stats, within the card limits", () => {
    for (const p of players) {
      if (p.kind === 'goalie') {
        expect(p.save).toBe(Math.min(SAVE_MAX, GOALIE_BASE_SAVE + p.bonusPoints!));
        continue;
      }
      const type = FIELD_TYPES[p.role as keyof typeof FIELD_TYPES];
      const stats = { speed: p.speed, shot: p.shot, defense: p.defense, faceoff: p.faceoff };
      let added = 0;
      for (const [stat, value] of Object.entries(stats)) {
        const base = type.base[stat as keyof typeof stats];
        expect(value).toBeGreaterThanOrEqual(base);
        expect(value).toBeLessThanOrEqual(FIELD_STAT_MAX);
        added += value - base;
      }
      expect(added, p.id).toBe(p.bonusPoints);
    }
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
