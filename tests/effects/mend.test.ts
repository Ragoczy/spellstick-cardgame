// Effect: mend {} (action, non-numeric)
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { LANE_COUNTS, actionSpell, eventsOfType, mid, play, player, scenario, uid } from '../helpers';

const mendSpell = (element: string | null = 'water') => actionSpell('Mend', { effect: 'mend', params: {} }, element);

/** Attaches the top injury card to a player, as if they had been hurt earlier. */
function injure(s: ReturnType<typeof scenario>, cardUid: string) {
  s.injuries[cardUid] = s.injuryDeck.pop()!;
}

describe.each(LANE_COUNTS)('mend (%i lanes)', (lanes) => {
  it('removes the injury from one of your players on the field, and the injury card goes back to the injury deck', () => {
    const s = scenario({ lanes, A: { hand: [mendSpell()], lineup: { midfield: { 0: player('Hurt') } } } });
    injure(s, uid(s, 'A', 'Hurt'));
    const deckBefore = s.injuryDeck.length;
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Mend'), caster: mid(0), target: { kind: 'mendField', pos: mid(0) } });
    expect(state.injuries[uid(s, 'A', 'Hurt')]).toBeUndefined();
    expect(state.injuryDeck).toHaveLength(deckBefore + 1);
    expect(eventsOfType(events, 'mended')[0]).toMatchObject({ side: 'A', injury: { name: 'Singed hair' } });
  });

  it('can mend a player in your hand', () => {
    const s = scenario({ lanes, A: { hand: [mendSpell(), player('Resting')] } });
    injure(s, uid(s, 'A', 'Resting'));
    const { state } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Mend'), caster: mid(0), target: { kind: 'mendHand', card: uid(s, 'A', 'Resting') } });
    expect(state.injuries[uid(s, 'A', 'Resting')]).toBeUndefined();
  });

  it('needs an injured player as its target', () => {
    const s = scenario({ lanes, A: { hand: [mendSpell(), player('Fine')] } });
    expect(() => applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Mend'), caster: mid(0), target: { kind: 'mendHand', card: uid(s, 'A', 'Fine') } }))
      .toThrow(IllegalActionError);
  });

  it('fails when the caster is opposed', () => {
    const s = scenario({ lanes, A: { hand: [mendSpell('water')], lineup: { midfield: { 0: player('Fire hurt', {}, { affinities: ['fire'] }) } } } });
    injure(s, uid(s, 'A', 'Fire hurt'));
    const { state } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Mend'), caster: mid(0), target: { kind: 'mendField', pos: mid(0) } });
    expect(state.injuries[uid(s, 'A', 'Fire hurt')]).toBeDefined();
  });
});
