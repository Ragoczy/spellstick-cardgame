// The Warlock magic data (data/warlock-resonants.json), the useful specializations
// (data/useful-magic.json), and how players get their Resonants (docs/MAGIC.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIBRARY_TEAM, POOL_TEAM, SPELL_TIERS, familyOf, type PlayerCardDef, type SpellCardDef } from '../src/engine/cards';
import { randomInt, seedToState } from '../src/engine/rng';
import { prototypeCards } from '../src/data/prototype';
import { depthWeights, drawAffinity, drawResonants, isWholeFamily, usefulSpecs, type ResonantData, type Roll } from '../scripts/resonant-draw';

const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const magic = readJson('../data/warlock-resonants.json') as {
  resonants: ResonantData[]; specializations: { id: string; familyId: string }[]; magicFamilies: { id: string }[];
};
const useful = new Set((readJson('../data/useful-magic.json') as { specializations: { id: string }[] }).specializations.map((s) => s.id));
const familyIds = new Set(magic.magicFamilies.map((f) => f.id));
const specIds = new Set(magic.specializations.map((s) => s.id));
const resonants = new Map(magic.resonants.map((r) => [r.id, r]));
const usefulResonants = magic.resonants.filter((r) => usefulSpecs(r, useful).length > 0);
const pool = prototypeCards.cards.filter((c): c is PlayerCardDef => c.team === POOL_TEAM && c.kind !== 'spell');

function seededRoll(seed: number): Roll {
  let rng = seedToState(seed);
  return (max) => {
    let value: number;
    [value, rng] = randomInt(rng, max);
    return value;
  };
}

describe('magic data', () => {
  it('only lists useful specializations that exist', () => {
    for (const id of useful) expect(specIds, id).toContain(id);
  });

  it('gives the card set every family a useful specialization belongs to', () => {
    expect([...prototypeCards.families].sort()).toEqual([...new Set([...useful].map(familyOf))].sort());
  });

  it('only uses real families and specializations on cards', () => {
    for (const card of prototypeCards.cards) {
      const ids = card.kind === 'spell' ? (card.magic ? [card.magic] : []) : card.kind === 'physical' ? [card.affinity] : card.resonants.map((r) => r.affinity);
      for (const id of ids) expect(id.includes('.') ? specIds.has(id) : familyIds.has(id), `${card.id}: ${id}`).toBe(true);
    }
  });

  it('gives pool players only useful Resonants, with Affinities those Resonants grant', () => {
    for (const card of pool) {
      for (const r of card.resonants) {
        const data = resonants.get(r.id ?? '');
        expect(data, `${card.id}: ${r.id}`).toBeDefined();
        expect(r.name).toBe(data!.name);
        const specs = usefulSpecs(data!, useful);
        expect(specs.length, `${card.id}: ${r.name}`).toBeGreaterThan(0);
        // A whole family the Resonant has a useful specialization in, or exactly one of those specializations.
        const ok = r.affinity.includes('.') ? specs.includes(r.affinity) && !isWholeFamily(r.affinity) : specs.some((s) => familyOf(s) === r.affinity);
        expect(ok, `${card.id}: ${r.name} (${r.affinity})`).toBe(true);
      }
      expect(new Set(card.resonants.map((r) => r.id)).size).toBe(card.resonants.length);
    }
  });
});

describe('the spell library', () => {
  const library = prototypeCards.cards.filter((c): c is SpellCardDef => c.kind === 'spell' && c.team === LIBRARY_TEAM);
  // A family's own specialization (fire.fire) is written as the family ("fire").
  const asMagic = (spec: string) => (isWholeFamily(spec) ? familyOf(spec) : spec);

  it('has a spell for every useful specialization', () => {
    const covered = new Set(library.map((c) => c.magic));
    for (const spec of useful) expect(covered.has(asMagic(spec)), spec).toBe(true);
  });

  it('only has spells of useful magic, with an effect that magic can power', () => {
    const effectsOf = new Map((readJson('../data/useful-magic.json') as { specializations: { id: string; effects: string[] }[] })
      .specializations.map((s) => [asMagic(s.id), s.effects]));
    for (const spell of library) {
      if (spell.magic === null) continue; // neutral
      expect(effectsOf.get(spell.magic), `${spell.name}: ${spell.magic}`).toContain(spell.ability.effect);
    }
  });

  it('gives every library spell a power tier', () => {
    for (const spell of library) expect(SPELL_TIERS, spell.name).toContain(spell.tier);
  });

  it('gives every team 16 library spells', () => {
    for (const team of prototypeCards.teams) {
      expect(team.spells).toHaveLength(16);
      expect(prototypeCards.cards.filter((c) => c.team === team.id && c.kind === 'spell')).toEqual([]); // no spells of its own
    }
  });
});

describe('drawing Resonants', () => {
  it('gives the root 50% and halves the share at each deeper level', () => {
    const two = depthWeights([0, 1, 2]);
    expect(two.get(0)).toBeCloseTo(0.5);
    expect(two.get(1)).toBeCloseTo(1 / 3);
    expect(two.get(2)).toBeCloseTo(1 / 6);
    const three = depthWeights([0, 1, 2, 3]);
    expect(three.get(1)! / three.get(2)!).toBeCloseTo(2);
    expect(three.get(2)! / three.get(3)!).toBeCloseTo(2);
    expect(depthWeights([1, 2]).get(1)).toBeCloseTo(2 / 3); // a root with no useful magic of its own
  });

  it('lands on a root about half the time where the root is useful', () => {
    const roll = seededRoll(1);
    const usefulRoots = new Set(usefulResonants.filter((r) => r.depth === 0).map((r) => r.id));
    let inUsefulTree = 0;
    let roots = 0;
    for (let i = 0; i < 6000; i++) {
      const [r] = drawResonants(roll, 1, usefulResonants, useful);
      const data = resonants.get(r!.id)!;
      if (!usefulRoots.has(data.rootId)) continue;
      inUsefulTree += 1;
      if (data.depth === 0) roots += 1;
    }
    expect(roots / inUsefulTree).toBeGreaterThan(0.47);
    expect(roots / inUsefulTree).toBeLessThan(0.53);
  });

  it('makes the Affinity the whole family about half the time when a narrower specialization is on offer', () => {
    const roll = seededRoll(2);
    const fury = resonants.get('emo.fury')!; // fire, body.strength, weather.storm
    const narrow = usefulSpecs(fury, useful).filter((s) => !isWholeFamily(s));
    let whole = 0;
    let tries = 0;
    for (let i = 0; i < 6000; i++) {
      const a = drawAffinity(roll, fury, useful);
      if (!narrow.some((s) => familyOf(s) === familyOf(a))) continue; // that family had nothing narrower
      tries += 1;
      if (!a.includes('.')) whole += 1;
    }
    expect(tries).toBeGreaterThan(1000);
    expect(whole / tries).toBeGreaterThan(0.47);
    expect(whole / tries).toBeLessThan(0.53);
  });
});
