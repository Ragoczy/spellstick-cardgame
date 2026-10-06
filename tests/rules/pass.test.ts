// RULES.md "Pass".
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { LANE_COUNTS, GOAL_POS, dfn, eventsOfType, fwd, lastContest, mid, play, player, scenario } from '../helpers';

describe.each(LANE_COUNTS)('pass (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it("compares the receiver's Speed with the opposing player's Defense; the receiver wins with a higher value", () => {
    const s = scenario({
      lanes,
      A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 5 }) } } },
      B: { lineup: { defense: { [LAST]: player('B def', { defense: 4 }) } } },
    });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    const contest = lastContest(events);
    expect(contest.kind).toBe('pass');
    expect(contest.attacker).toMatchObject({ side: 'A', stat: 'speed', total: 5 });
    expect(contest.defender).toMatchObject({ side: 'B', stat: 'defense', total: 4 });
    expect(state.ball).toEqual({ side: 'A', pos: fwd(LAST) });
  });

  it('is caught on a tie', () => {
    const s = scenario({ lanes }); // fillers: Speed 3 vs Defense 3
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(lastContest(events).winner).toBe('A');
    expect(state.ball).toEqual({ side: 'A', pos: fwd(LAST) });
  });

  it("is intercepted when the receiver's value is lower, and the intercepting player holds the ball", () => {
    const s = scenario({ lanes, A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 2 }) } } } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(lastContest(events).winner).toBe('B');
    expect(state.ball).toEqual({ side: 'B', pos: dfn(LAST) });
  });

  it('reveals the receiver and the opposing player, but not the passer', () => {
    const s = scenario({ lanes });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.teams.A.lineup.forward[LAST]!.revealed).toBe(true);
    expect(state.teams.B.lineup.defense[LAST]!.revealed).toBe(true);
    expect(state.teams.A.lineup.midfield[0]!.revealed).toBe(false);
    expect(eventsOfType(events, 'revealed')).toHaveLength(2);
  });

  it('can go sideways, one row forward, or back, but not two rows forward', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: dfn(0) } });
    expect(() => applyAction(s, { type: 'pass', side: 'A', to: dfn(LAST) })).not.toThrow();
    expect(() => applyAction(s, { type: 'pass', side: 'A', to: mid(LAST) })).not.toThrow();
    expect(() => applyAction(s, { type: 'pass', side: 'A', to: fwd(0) })).toThrow(IllegalActionError);
    const fromForward = scenario({ lanes, ball: { side: 'A', pos: fwd(0) } });
    expect(() => applyAction(fromForward, { type: 'pass', side: 'A', to: dfn(LAST) })).not.toThrow();
  });

  it('can never go back to the goalie', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: dfn(0) } });
    expect(() => applyAction(s, { type: 'pass', side: 'A', to: GOAL_POS as never })).toThrow(IllegalActionError);
  });

  it('lets a goalie holding the ball pass to any of its defenders', () => {
    const s = scenario({
      lanes,
      ball: { side: 'A', pos: GOAL_POS },
      A: { lineup: { defense: { [LAST]: player('A def', { speed: 6 }) } } },
    });
    const { state } = play(s, { type: 'pass', side: 'A', to: dfn(LAST) });
    expect(state.ball).toEqual({ side: 'A', pos: dfn(LAST) });
    expect(() => applyAction(s, { type: 'pass', side: 'A', to: mid(0) })).toThrow(IllegalActionError);
  });

  it('needs your team to have the ball', () => {
    const s = scenario({ lanes, ball: { side: 'B', pos: mid(0) } });
    expect(() => applyAction(s, { type: 'pass', side: 'A', to: fwd(0) })).toThrow(IllegalActionError);
  });

  it('works the same way for Team B passing toward row 1', () => {
    const s = scenario({
      lanes,
      active: 'B',
      B: { lineup: { forward: { [LAST]: player('B fwd', { speed: 6 }) } } },
    });
    const { state } = play(s, { type: 'pass', side: 'B', to: fwd(LAST) });
    expect(state.ball).toEqual({ side: 'B', pos: fwd(LAST) });
    expect(state.teams.A.lineup.defense[LAST]!.revealed).toBe(true);
  });
});
