// Effect: scry {} (action, non-numeric)
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { eventsFor, viewFor } from '../../src/engine/view';
import { LANE_COUNTS, GOAL_POS, actionSpell, dfn, eventsOfType, fwd, mid, play, player, scenario, uid } from '../helpers';

const scry = (element: string | null = null) => actionSpell('Scry', { effect: 'scry', params: {} }, element);

describe.each(LANE_COUNTS)('scry (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it("lets you look at one of your opponent's face-down cards without revealing it", () => {
    const s = scenario({ lanes, A: { hand: [scry()] }, B: { lineup: { defense: { [LAST]: player('Secret') } } } });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Scry'), caster: mid(0), target: { kind: 'opponent', pos: dfn(LAST) } });
    expect(state.teams.B.lineup.defense[LAST]!.revealed).toBe(false);
    const aView = viewFor(state, 'A').opponent.lineup.defense[LAST]!;
    expect(aView).toMatchObject({ state: 'faceDown', scried: true, card: { def: { name: 'Secret' } } });
    // The scrying player sees the card in the event; the opponent only sees that a scry happened.
    expect(eventsOfType(eventsFor(events, 'A'), 'scried')[0]?.secret?.card.def.name).toBe('Secret');
    expect(eventsOfType(eventsFor(events, 'B'), 'scried')[0]).toEqual({ type: 'scried', side: 'A', target: dfn(LAST) });
    // B knows their card has been seen.
    expect(viewFor(state, 'B').mine.lineup.defense[LAST]).toMatchObject({ state: 'faceDown', scried: true });
  });

  it('can look at the goalie', () => {
    const s = scenario({ lanes, A: { hand: [scry()] } });
    const { state } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Scry'), caster: mid(0), target: { kind: 'opponent', pos: GOAL_POS } });
    expect(viewFor(state, 'A').opponent.goalie.state).toBe('faceDown');
  });

  it("can't target a card that is already face up", () => {
    const s = scenario({ lanes, A: { hand: [scry()] }, B: { revealed: [dfn(LAST)] } });
    expect(() => applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Scry'), caster: mid(0), target: { kind: 'opponent', pos: dfn(LAST) } }))
      .toThrow(IllegalActionError);
  });

  it('fails when the caster is opposed', () => {
    const s = scenario({ lanes, A: { hand: [scry('water')], lineup: { forward: { 0: player('Fire caster', {}, { affinities: ['fire'] }) } } } });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Scry'), caster: fwd(0), target: { kind: 'opponent', pos: dfn(LAST) } });
    expect(eventsOfType(events, 'spellCast')[0]?.fizzled).toBe(true);
    expect(viewFor(state, 'A').opponent.lineup.defense[LAST]!.state).toBe('unknown');
  });
});
