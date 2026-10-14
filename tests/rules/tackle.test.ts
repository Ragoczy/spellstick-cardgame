// RULES.md "Tackle".
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { LANE_COUNTS, GOAL_POS, dfn, fwd, lastContest, mid, play, player, scenario } from '../helpers';

describe.each(LANE_COUNTS)('tackle (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it("compares your Defense with the holder's Speed; you take the ball with a higher value", () => {
    const s = scenario({
      lanes,
      ball: { side: 'B', pos: dfn(LAST) },
      A: { lineup: { forward: { [LAST]: player('A fwd', { defense: 5 }) } } },
      B: { lineup: { defense: { [LAST]: player('B def', { speed: 4 }) } } },
    });
    const { state, events } = play(s, { type: 'tackle', side: 'A' });
    const contest = lastContest(events);
    expect(contest.kind).toBe('tackle');
    expect(contest.attacker).toMatchObject({ side: 'A', stat: 'defense', total: 5 });
    expect(contest.defender).toMatchObject({ side: 'B', stat: 'speed', total: 4 });
    expect(state.ball).toEqual({ side: 'A', pos: fwd(LAST) });
  });

  it('changes nothing if it fails, and ties go to the holder', () => {
    const s = scenario({ lanes, ball: { side: 'B', pos: mid(LAST) } });
    const { state, events } = play(s, { type: 'tackle', side: 'A' });
    expect(lastContest(events).winner).toBe('B');
    expect(state.ball).toEqual({ side: 'B', pos: mid(LAST) });
  });

  it('reveals both players', () => {
    const s = scenario({ lanes, ball: { side: 'B', pos: mid(LAST) } });
    const { state } = play(s, { type: 'tackle', side: 'A' });
    expect(state.teams.A.lineup.midfield[LAST]!.revealed).toBe(true);
    expect(state.teams.B.lineup.midfield[LAST]!.revealed).toBe(true);
  });

  it("can't be made against a goalie, or when your own team has the ball", () => {
    const goalieBall = scenario({ lanes, ball: { side: 'B', pos: GOAL_POS } });
    expect(() => applyAction(goalieBall, { type: 'tackle', side: 'A' })).toThrow("Goalies can't be tackled.");
    const ownBall = scenario({ lanes, ball: { side: 'A', pos: mid(0) } });
    expect(() => applyAction(ownBall, { type: 'tackle', side: 'A' })).toThrow(IllegalActionError);
  });

  // Catch and shoot (v0.16).
  it("can't be made on a forward who just caught a pass, until that team's next turn", () => {
    const s = scenario({ lanes, A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 6 }) } } } });
    let { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.ballProtected).toBe(true);
    expect(() => applyAction(state, { type: 'tackle', side: 'B' })).toThrow("can't be tackled");
    // B's turn ends, and protection ends when A's next turn starts.
    ({ state } = play(state, { type: 'regroup', side: 'B', discard: [] }));
    expect(state.pending).toMatchObject({ side: 'A' });
    expect(state.ballProtected).toBe(false);
  });

  it('can still be made on a midfielder or defender who just caught a pass, or a forward who won a tackle', () => {
    const s = scenario({ lanes, A: { lineup: { midfield: { [LAST]: player('A mid', { speed: 6 }) } } } });
    expect(play(s, { type: 'pass', side: 'A', to: mid(LAST) }).state.ballProtected).toBe(false);
    const won = scenario({ lanes, ball: { side: 'B', pos: dfn(LAST) }, A: { lineup: { forward: { [LAST]: player('A fwd', { defense: 6 }) } } } });
    const after = play(won, { type: 'tackle', side: 'A' }).state;
    expect(after.ball).toEqual({ side: 'A', pos: fwd(LAST) });
    expect(after.ballProtected).toBe(false);
  });

  it("didn't protect anyone before v0.16 (online matches started under the old rule)", () => {
    const s = scenario({ lanes, config: { protectCatch: 'off' }, A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 6 }) } } } });
    const { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.ballProtected).toBe(false);
    expect(() => applyAction(state, { type: 'tackle', side: 'B' })).not.toThrow();
  });
});
