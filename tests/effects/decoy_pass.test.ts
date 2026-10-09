// Effect: decoy_pass {} (action, non-numeric) — Glamour Ball
import { describe, expect, it } from 'vitest';
import { legalActions } from '../../src/engine/legal';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { viewFor } from '../../src/engine/view';
import { LANE_COUNTS, GOAL_POS, actionSpell, dfn, eventsOfType, fwd, mid, play, player, scenario, uid } from '../helpers';

const glamourBall = (element: string | null = null) => actionSpell('Glamour Ball', { effect: 'decoy_pass', params: {} }, element);

describe.each(LANE_COUNTS)('decoy_pass (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it("is caught without a contest: the opponent's player in the decoy lane is revealed, and the receiver stays face down", () => {
    const s = scenario({
      lanes,
      ball: { side: 'A', pos: mid(0) },
      // A slow receiver against a great defender would normally be intercepted.
      A: { hand: [glamourBall()], lineup: { forward: { 0: player('A fwd', { speed: 0 }) } } },
      B: { lineup: { defense: { 0: player('B def', { defense: 6 }) } } },
    });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Glamour Ball'), caster: GOAL_POS, target: { kind: 'decoyPass', to: fwd(0), decoyLane: LAST } });
    expect(eventsOfType(events, 'contestStarted')).toHaveLength(0);
    expect(eventsOfType(events, 'decoyPass')[0]).toMatchObject({ side: 'A', to: fwd(0), decoy: dfn(LAST) });
    expect(state.ball).toEqual({ side: 'A', pos: fwd(0) });
    expect(state.teams.A.lineup.forward[0]!.revealed).toBe(false);
    expect(state.teams.B.lineup.defense[LAST]!.revealed).toBe(true);
    expect(state.teams.B.lineup.defense[0]!.revealed).toBe(false);
    // The opponent still can't see who caught it.
    expect(viewFor(state, 'B').opponent.lineup.forward[0]!.state).toBe('unknown');
  });

  it('still works if the decoy spot is empty: nobody is revealed', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: mid(0) }, A: { hand: [glamourBall()] } });
    s.teams.B.lineup.defense[LAST] = null;
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Glamour Ball'), caster: GOAL_POS, target: { kind: 'decoyPass', to: fwd(0), decoyLane: LAST } });
    expect(eventsOfType(events, 'revealed').filter((e) => e.side === 'B')).toHaveLength(0);
    expect(state.ball).toEqual({ side: 'A', pos: fwd(0) });
  });

  it('uses the normal pass targets, and the decoy must be another lane of that row', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: dfn(0) }, A: { hand: [glamourBall()] } });
    const cast = (to: ReturnType<typeof fwd>, decoyLane: number) =>
      applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Glamour Ball'), caster: GOAL_POS, target: { kind: 'decoyPass', to, decoyLane } });
    expect(() => cast(mid(0), LAST)).not.toThrow();
    expect(() => cast(mid(0), 0)).toThrow(IllegalActionError); // the receiver's own lane
    expect(() => cast(mid(0), lanes)).toThrow(IllegalActionError); // not a lane
    expect(() => cast(fwd(0), LAST)).toThrow(IllegalActionError); // two rows forward
  });

  it('offers one choice for each other lane of the receiver’s row', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: mid(0) }, A: { hand: [glamourBall()] } });
    const casts = legalActions(s, 'A').filter((a) => a.type === 'cast' && a.caster.area === 'goal');
    const toFwd0 = casts.filter((a) => a.type === 'cast' && a.target.kind === 'decoyPass' && a.target.to.area === 'forward' && a.target.to.lane === 0);
    expect(toFwd0).toHaveLength(lanes - 1);
  });

  it('needs your team to have the ball', () => {
    const s = scenario({ lanes, ball: { side: 'B', pos: mid(0) }, A: { hand: [glamourBall()] } });
    expect(() => applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Glamour Ball'), caster: GOAL_POS, target: { kind: 'decoyPass', to: fwd(0), decoyLane: LAST } }))
      .toThrow(IllegalActionError);
  });

  it('fails when the caster is opposed: no pass happens', () => {
    const s = scenario({
      lanes,
      ball: { side: 'A', pos: mid(0) },
      A: { hand: [glamourBall('air')], lineup: { midfield: { [LAST]: player('Earth caster', {}, { affinities: ['earth'] }) } } },
    });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Glamour Ball'), caster: mid(LAST), target: { kind: 'decoyPass', to: fwd(0), decoyLane: LAST } });
    expect(eventsOfType(events, 'decoyPass')).toHaveLength(0);
    expect(state.ball).toEqual({ side: 'A', pos: mid(0) });
  });
});
