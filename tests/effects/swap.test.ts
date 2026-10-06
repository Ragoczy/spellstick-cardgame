// Effect: swap {} (action, non-numeric)
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { viewFor } from '../../src/engine/view';
import { LANE_COUNTS, GOAL_POS, actionSpell, dfn, fwd, mid, play, player, scenario, uid } from '../helpers';

const swap = (element: string | null = null) => actionSpell('Swap', { effect: 'swap', params: {} }, element);

describe.each(LANE_COUNTS)('swap (%i lanes)', (lanes) => {
  const LAST = lanes - 1;
  const lineup = { defense: { 0: player('Def') }, forward: { [LAST]: player('Fwd') } };

  it('swaps two of your face-down players, who stay face down', () => {
    const s = scenario({ lanes, A: { hand: [swap()], lineup } });
    const { state } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Swap'), caster: GOAL_POS, target: { kind: 'swap', a: dfn(0), b: fwd(LAST) } });
    expect(state.teams.A.lineup.defense[0]).toMatchObject({ uid: uid(s, 'A', 'Fwd'), revealed: false });
    expect(state.teams.A.lineup.forward[LAST]).toMatchObject({ uid: uid(s, 'A', 'Def'), revealed: false });
  });

  it('leaves the ball in its slot with the new player', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: dfn(0) }, A: { hand: [swap()], lineup } });
    const { state } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Swap'), caster: GOAL_POS, target: { kind: 'swap', a: dfn(0), b: fwd(LAST) } });
    expect(state.ball).toEqual({ side: 'A', pos: dfn(0) });
    expect(state.teams.A.lineup.defense[0]!.uid).toBe(uid(s, 'A', 'Fwd'));
  });

  it('moves what the opponent learned by scrying along with the card', () => {
    const s = scenario({ lanes, A: { hand: [swap()], lineup } });
    s.teams.A.lineup.defense[0]!.scried = true;
    const { state } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Swap'), caster: GOAL_POS, target: { kind: 'swap', a: dfn(0), b: fwd(LAST) } });
    expect(viewFor(state, 'B').opponent.lineup.forward[LAST]).toMatchObject({ state: 'faceDown', card: { def: { name: 'Def' } } });
    expect(viewFor(state, 'B').opponent.lineup.defense[0]!.state).toBe('unknown');
  });

  it("can't move face-up players, or the caster (who is revealed by casting)", () => {
    const s = scenario({ lanes, A: { hand: [swap()], lineup, revealed: [mid(0)] } });
    const cast = (caster: typeof GOAL_POS, a: ReturnType<typeof dfn>, b: ReturnType<typeof dfn>) =>
      applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Swap'), caster, target: { kind: 'swap', a, b } });
    expect(() => cast(GOAL_POS, mid(0), dfn(0))).toThrow(IllegalActionError);
    expect(() => cast(dfn(0), dfn(0), fwd(LAST))).toThrow(IllegalActionError);
  });

  it('fails when the caster is opposed', () => {
    const s = scenario({ lanes, A: { hand: [swap('earth')], lineup: { ...lineup, midfield: { 0: player('Air caster', {}, { affinities: ['air'] }) } } } });
    const { state } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Swap'), caster: mid(0), target: { kind: 'swap', a: dfn(0), b: fwd(LAST) } });
    expect(state.teams.A.lineup.defense[0]!.uid).toBe(uid(s, 'A', 'Def'));
  });
});
