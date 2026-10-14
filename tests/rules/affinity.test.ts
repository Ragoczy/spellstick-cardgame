// RULES.md "Affinity".
import { describe, expect, it } from 'vitest';
import { adjustAmount, adjustPenalty, affinityFor } from '../../src/engine/affinity';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { LANE_COUNTS, OPPOSED, boost, eventsOfType, fwd, lastContest, play, player, scenario, shield, uid } from '../helpers';

const caster = (...affinities: string[]) => player('caster', {}, { affinities });

describe('affinity', () => {
  it("is a match when any of the caster's Resonants has the spell's family", () => {
    expect(affinityFor(caster('fire'), 'fire', OPPOSED)).toBe('match');
    expect(affinityFor(caster('air', 'fire'), 'fire', OPPOSED)).toBe('match');
  });

  it('is opposed when no Resonant matches and one is in an opposed family (the test pairs: fire–water, earth–air)', () => {
    expect(affinityFor(caster('water'), 'fire', OPPOSED)).toBe('opposed');
    expect(affinityFor(caster('fire'), 'water', OPPOSED)).toBe('opposed');
    expect(affinityFor(caster('air', 'earth'), 'air', OPPOSED)).toBe('match'); // a match beats an opposed Resonant
  });

  it("is a specialist when a Resonant's Affinity is exactly the spell's specialization", () => {
    expect(affinityFor(caster('illusion.glamour'), 'illusion.glamour', OPPOSED)).toBe('specialist');
    expect(affinityFor(caster('fire', 'illusion.glamour'), 'illusion.glamour', OPPOSED)).toBe('specialist');
  });

  it("is a match when an Affinity is anywhere in the spell's family", () => {
    expect(affinityFor(caster('illusion'), 'illusion.glamour', OPPOSED)).toBe('match'); // whole family, specialist spell
    expect(affinityFor(caster('illusion.mirrors'), 'illusion.glamour', OPPOSED)).toBe('match'); // another specialization
    expect(affinityFor(caster('illusion.glamour'), 'illusion', OPPOSED)).toBe('match'); // family spell
  });

  it('is neutral for any other pairing, and for neutral spells', () => {
    expect(affinityFor(caster('earth'), 'fire', OPPOSED)).toBe('neutral');
    expect(affinityFor(caster('water'), null, OPPOSED)).toBe('neutral');
  });

  it('makes numeric effects 1 stronger on a match and 1 weaker when opposed, never below 0', () => {
    expect(adjustAmount(2, 'match', DEFAULT_CONFIG)).toBe(3);
    expect(adjustAmount(2, 'neutral', DEFAULT_CONFIG)).toBe(2);
    expect(adjustAmount(2, 'opposed', DEFAULT_CONFIG)).toBe(1);
    expect(adjustAmount(0, 'opposed', DEFAULT_CONFIG)).toBe(0);
  });

  it('makes numeric effects 2 stronger for a specialist', () => {
    expect(adjustAmount(2, 'specialist', DEFAULT_CONFIG)).toBe(4);
    expect(adjustPenalty(2, 'specialist', DEFAULT_CONFIG)).toBe(0);
  });

  it('turns a penalty the other way: a match shrinks it, opposed grows it', () => {
    expect(adjustPenalty(2, 'match', DEFAULT_CONFIG)).toBe(1);
    expect(adjustPenalty(2, 'opposed', DEFAULT_CONFIG)).toBe(3);
    expect(adjustPenalty(0, 'match', DEFAULT_CONFIG)).toBe(0);
  });
});

describe.each(LANE_COUNTS)('affinity in play (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it.each([
    ['fire', 'match', 3],
    ['earth', 'neutral', 2],
    ['water', 'opposed', 1],
    ['fire.explosion', 'match', 3],
  ] as const)('a fire boost cast by a %s player is a %s: +%i', (affinity, expected, amount) => {
    const s = scenario({
      lanes,
      A: { hand: [boost('Fire boost', 2, 'fire')], lineup: { forward: { [LAST]: player('A fwd', { speed: 3 }, { affinities: [affinity] }) } } },
    });
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'Fire boost') });
    expect(eventsOfType(events, 'spellCast')[0]?.affinity).toBe(expected);
    expect(lastContest(events).attacker.total).toBe(3 + amount);
  });

  it.each([
    ['illusion.glamour', 'specialist', 4],
    ['illusion', 'match', 3],
    ['illusion.mirrors', 'match', 3],
  ] as const)('a glamour boost cast by a %s player is a %s: +%i', (affinity, expected, amount) => {
    const s = scenario({
      lanes,
      A: { hand: [boost('Glamour boost', 2, 'illusion.glamour')], lineup: { forward: { [LAST]: player('A fwd', { speed: 3 }, { affinities: [affinity] }) } } },
    });
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'Glamour boost') });
    expect(eventsOfType(events, 'spellCast')[0]?.affinity).toBe(expected);
    expect(lastContest(events).attacker.total).toBe(3 + amount);
  });

  it('makes a non-numeric spell fail when opposed, but the card is still discarded', () => {
    const s = scenario({
      lanes,
      B: { hand: [shield('Water shield', 'water')], lineup: { defense: { [LAST]: player('B def', { defense: 2 }, { affinities: ['fire'] }) } } },
      A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 3 }) } } },
    });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'B', card: uid(s, 'B', 'Water shield') });
    expect(eventsOfType(events, 'spellCast')[0]).toMatchObject({ affinity: 'opposed', fizzled: true });
    expect(lastContest(events).attacker).toMatchObject({ total: 3, shielded: false });
    expect(state.teams.B.discard).toContain(uid(s, 'B', 'Water shield'));
  });

  it("doesn't change player abilities", () => {
    const ability = { effect: 'bonus', params: { stat: 'speed', amount: 2, when: 'receive' } } as const;
    const s = scenario({
      lanes,
      A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 3 }, { affinities: ['fire'], ability }) } } },
    });
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(lastContest(events).attacker.total).toBe(5);
  });
});
