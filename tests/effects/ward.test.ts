// Effect: ward {} (reaction, non-numeric, v0.17): if your player is hurt in this contest, they're only Shaken.
import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../../src/engine/config';
import { LANE_COUNTS, actionSpell, eventsOfType, fwd, lastContest, mid, physicalCard, play, player, reaction, scenario, uid } from '../helpers';

const ward = (magic: string | null = null) => reaction('Ward', { effect: 'ward', params: {} }, magic);
const hit = () => actionSpell('Flambé', { effect: 'hit', params: { strength: 6 } });
/** Every hurt would be a knockout without the Ward. */
const KNOCKED_OUT: Partial<GameConfig> = { severity: { shaken: 0, injured: 0 } };

describe.each(LANE_COUNTS)('ward (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('a landed hit only leaves the warded player Shaken', () => {
    const s = scenario({
      lanes, config: KNOCKED_OUT, A: { hand: [hit()] },
      B: { hand: [ward()], lineup: { defense: { [LAST]: player('B def', { defense: 0 }) } } },
    });
    const { state, events } = play(s,
      { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: fwd(LAST), target: { kind: 'hit' } },
      { type: 'react', side: 'B', card: uid(s, 'B', 'Ward') });
    expect(lastContest(events).winner).toBe('A');
    expect(eventsOfType(events, 'hurt')).toEqual([expect.objectContaining({ side: 'B', result: 'shaken' })]);
    expect(eventsOfType(events, 'hurt')[0]!.roll).toBeUndefined(); // no severity roll
    expect(state.teams.B.lineup.defense[LAST]!.shakenUntil).toBeDefined();
    expect(state.teams.B.knockedOut).toEqual([]);
  });

  it('works against a knockdown too: a failed Toughness roll means only Shaken', () => {
    const s = scenario({
      lanes, config: KNOCKED_OUT, active: 'B', ball: { side: 'A', pos: mid(LAST) },
      A: { hand: [ward()], lineup: { midfield: { [LAST]: player('A mid', { speed: 0, toughness: -10 }) } } },
      B: { lineup: { midfield: { [LAST]: player('B mid', { defense: 6 }) } } },
    });
    const { events } = play(s, { type: 'tackle', side: 'B' }, { type: 'react', side: 'A', card: uid(s, 'A', 'Ward') });
    expect(eventsOfType(events, 'knockedDown')[0]).toMatchObject({ hurt: true });
    expect(eventsOfType(events, 'hurt')).toEqual([expect.objectContaining({ side: 'A', result: 'shaken' })]);
  });

  it('works against a physical attack', () => {
    const s = scenario({
      lanes, config: { ...KNOCKED_OUT, physicalDraw: 'blind' }, active: 'B', ball: { side: 'A', pos: mid(LAST) },
      A: { hand: [ward()], lineup: { midfield: { [LAST]: player('A mid', { speed: 0, toughness: -10 }) } } },
      B: { physical: [physicalCard('Slash', { tier: 'brutal', toughness: -1, severity: 1 })], lineup: { midfield: { [LAST]: player('B mid', { speed: 6 }) } } },
    });
    const { events } = play(s, { type: 'attack', side: 'B', attacker: mid(LAST), target: mid(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'Ward') });
    expect(eventsOfType(events, 'hurt')).toEqual([expect.objectContaining({ side: 'A', result: 'shaken' })]);
  });

  it('does nothing to the contest itself, and nothing if the player isn\'t hurt', () => {
    const s = scenario({
      lanes, A: { hand: [hit()] },
      B: { hand: [ward()], lineup: { defense: { [LAST]: player('B def', { defense: 9 }) } } },
    });
    const { events } = play(s,
      { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: fwd(LAST), target: { kind: 'hit' } },
      { type: 'react', side: 'B', card: uid(s, 'B', 'Ward') });
    expect(lastContest(events).defender.parts).toEqual([]);
    expect(lastContest(events).winner).toBe('B');
    expect(eventsOfType(events, 'hurt')).toHaveLength(0);
  });

  it('fails when the caster is opposed', () => {
    const s = scenario({
      lanes, config: KNOCKED_OUT, A: { hand: [hit()] },
      B: { hand: [ward('water')], lineup: { defense: { [LAST]: player('B def', { defense: 0 }, { affinities: ['fire'] }) } } },
    });
    const { events } = play(s,
      { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: fwd(LAST), target: { kind: 'hit' } },
      { type: 'react', side: 'B', card: uid(s, 'B', 'Ward') });
    expect(eventsOfType(events, 'spellCast').find((e) => e.side === 'B')?.fizzled).toBe(true);
    expect(eventsOfType(events, 'hurt')[0]).toMatchObject({ result: 'knockedOut' });
  });
});
