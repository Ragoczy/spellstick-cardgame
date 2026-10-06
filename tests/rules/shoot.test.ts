// RULES.md "Shoot" and "Scoring".
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { LANE_COUNTS, GOAL_POS, eventsOfType, fwd, goalie, lastContest, mid, play, player, scenario } from '../helpers';

describe.each(LANE_COUNTS)('shoot (%i lanes)', (lanes) => {
  const LAST = lanes - 1;
  const shooter = (shot: number) => ({ lineup: { forward: { [LAST]: player('A fwd', { shot }) } } });

  it("scores when the forward's Shot beats the goalie's Save", () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: fwd(LAST) }, A: shooter(5), B: { goalie: goalie('B goalie', 4) } });
    const { state, events } = play(s, { type: 'shoot', side: 'A' });
    const contest = lastContest(events);
    expect(contest.kind).toBe('shot');
    expect(contest.attacker).toMatchObject({ stat: 'shot', total: 5 });
    expect(contest.defender).toMatchObject({ stat: 'save', total: 4 });
    expect(state.score).toEqual({ A: 1, B: 0 });
    expect(eventsOfType(events, 'goal')).toHaveLength(1);
  });

  it('reveals the opposing goalie', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: fwd(LAST) } });
    const { state } = play(s, { type: 'shoot', side: 'A' });
    expect(state.teams.B.goalie!.revealed).toBe(true);
  });

  it('is saved on a tie, and the goalie holds the ball', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: fwd(LAST) }, A: shooter(4), B: { goalie: goalie('B goalie', 4) } });
    const { state } = play(s, { type: 'shoot', side: 'A' });
    expect(state.score).toEqual({ A: 0, B: 0 });
    expect(state.ball).toEqual({ side: 'B', pos: GOAL_POS });
  });

  it('can only be taken by a forward holding the ball', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: mid(0) } });
    expect(() => applyAction(s, { type: 'shoot', side: 'A' })).toThrow(IllegalActionError);
    const theirBall = scenario({ lanes, ball: { side: 'B', pos: fwd(0) } });
    expect(() => applyAction(theirBall, { type: 'shoot', side: 'A' })).toThrow(IllegalActionError);
  });

  it('after a goal, players stay where they are and the team scored on chooses the faceoff lane', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: fwd(LAST) }, A: shooter(6) });
    const { state } = play(s, { type: 'shoot', side: 'A' });
    expect(state.ball).toBeNull();
    expect(state.pending).toEqual({ kind: 'faceoffLane', side: 'B' });
    const positions = (st: typeof s) =>
      (['A', 'B'] as const).map((side) => Object.values(st.teams[side].lineup).flat().map((slot) => slot!.uid));
    expect(positions(state)).toEqual(positions(s));
    expect(state.teams.A.lineup.forward[LAST]!.revealed).toBe(true);
  });
});
