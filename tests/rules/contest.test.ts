// RULES.md "Contests": reveal, attacker's reaction, defender's reaction, resolve, ties.
import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/reducer';
import { LANE_COUNTS, boost, eventsOfType, fwd, lastContest, play, player, scenario, uid } from '../helpers';

describe.each(LANE_COUNTS)('contests (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('reveals both players before anyone plays a spell', () => {
    const s = scenario({ lanes, A: { hand: [boost('A boost')] } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'A' });
    expect(eventsOfType(events, 'revealed')).toHaveLength(2);
  });

  it('asks the attacker first, then the defender, who can see the attacker\'s spell', () => {
    const s = scenario({ lanes, A: { hand: [boost('A boost')] }, B: { hand: [boost('B boost')] } });
    let { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'A', role: 'attacker' });
    ({ state } = play(state, { type: 'react', side: 'A', card: uid(s, 'A', 'A boost') }));
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'B', role: 'defender' });
    if (state.pending.kind !== 'reaction') throw new Error();
    expect(state.pending.contest.attacker.spell?.uid).toBe(uid(s, 'A', 'A boost'));
  });

  it('allows only one reaction spell per side', () => {
    const s = scenario({ lanes, A: { hand: [boost('A1'), boost('A2')] }, B: { hand: [boost('B1')] } });
    let { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    ({ state } = play(state, { type: 'react', side: 'A', card: uid(s, 'A', 'A1') }));
    expect(() => applyAction(state, { type: 'react', side: 'A', card: uid(s, 'A', 'A2') })).toThrow();
  });

  it('skips a side that has no reaction spells', () => {
    const s = scenario({ lanes, B: { hand: [boost('B boost')] } });
    const { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'B', role: 'defender' });
  });

  it('casts a reaction spell with the player in the contest', () => {
    const s = scenario({ lanes, A: { hand: [boost('A boost')] } });
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'A boost') });
    expect(eventsOfType(events, 'spellCast')[0]?.caster).toEqual(fwd(LAST));
  });

  it('applies abilities and spells, and the attacker wins only with a higher value', () => {
    const s = scenario({
      lanes,
      A: { hand: [boost('A boost')], lineup: { forward: { [LAST]: player('A fwd', { speed: 3 }) } } },
      B: { hand: [boost('B boost')], lineup: { defense: { [LAST]: player('B def', { defense: 3 }) } } },
    });
    const { events } = play(
      s,
      { type: 'pass', side: 'A', to: fwd(LAST) },
      { type: 'react', side: 'A', card: uid(s, 'A', 'A boost') },
      { type: 'react', side: 'B', card: uid(s, 'B', 'B boost') },
    );
    const contest = lastContest(events);
    expect(contest.attacker.total).toBe(5);
    expect(contest.defender.total).toBe(5);
    expect(contest.winner).toBe('B');
    expect(contest.attacker.parts).toEqual([{ label: 'A boost', amount: 2 }]);
  });
});
