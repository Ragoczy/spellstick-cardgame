// Effect: long_pass {} (action, non-numeric)
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { LANE_COUNTS, GOAL_POS, actionSpell, dfn, eventsOfType, fwd, lastContest, mid, play, player, scenario, uid } from '../helpers';

const longPass = (element: string | null = null) => actionSpell('Long pass', { effect: 'long_pass', params: {} }, element);

describe.each(LANE_COUNTS)('long_pass (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('lets the ball holder pass two rows forward, with a normal pass contest', () => {
    const s = scenario({
      lanes,
      ball: { side: 'A', pos: dfn(0) },
      A: { hand: [longPass()], lineup: { forward: { [LAST]: player('A fwd', { speed: 5 }) } } },
    });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Long pass'), caster: GOAL_POS, target: { kind: 'pass', to: fwd(LAST) } });
    expect(lastContest(events).kind).toBe('pass');
    expect(state.ball).toEqual({ side: 'A', pos: fwd(LAST) });
  });

  it('lets a goalie reach midfield', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: GOAL_POS }, A: { hand: [longPass()] } });
    expect(() => applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Long pass'), caster: GOAL_POS, target: { kind: 'pass', to: mid(LAST) } })).not.toThrow();
  });

  it('still allows the normal pass targets, but not three rows forward', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: GOAL_POS }, A: { hand: [longPass()] } });
    const cast = (to: ReturnType<typeof dfn>) =>
      applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Long pass'), caster: GOAL_POS, target: { kind: 'pass', to } });
    expect(() => cast(dfn(LAST))).not.toThrow();
    expect(() => cast(fwd(0))).toThrow(IllegalActionError);
  });

  it('needs your team to have the ball', () => {
    const s = scenario({ lanes, ball: { side: 'B', pos: mid(0) }, A: { hand: [longPass()] } });
    expect(() => applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Long pass'), caster: GOAL_POS, target: { kind: 'pass', to: fwd(0) } }))
      .toThrow(IllegalActionError);
  });

  it('fails when the caster is opposed: no pass happens', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: dfn(0) }, A: { hand: [longPass('air')], lineup: { midfield: { 0: player('Earth caster', {}, { affinities: ['earth'] }) } } } });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Long pass'), caster: mid(0), target: { kind: 'pass', to: fwd(LAST) } });
    expect(eventsOfType(events, 'contestStarted')).toHaveLength(0);
    expect(state.ball).toEqual({ side: 'A', pos: dfn(0) });
  });
});
