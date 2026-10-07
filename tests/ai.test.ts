// The computer opponent's judgement in a few clear-cut situations.
import { describe, expect, it } from 'vitest';
import { explainChoice } from '../src/ai/heuristic';
import { legalActions } from '../src/engine/legal';
import { viewFor } from '../src/engine/view';
import { LANE_COUNTS, GOAL_POS, dfn, fwd, goalie, mid, player, scenario } from './helpers';

describe.each(LANE_COUNTS)('computer opponent (%i lanes)', (lanes) => {
  it('with two actions left, passes the ball forward to set up a shot instead of holding it in midfield', () => {
    const s = scenario({
      lanes,
      actionsLeft: 2,
      ball: { side: 'A', pos: mid(0) },
      A: { lineup: { forward: { 0: player('A striker', { speed: 5, shot: 5 }) } } },
      B: { lineup: { defense: { 0: player('B def', { defense: 3 }) } }, revealed: [dfn(0), GOAL_POS], goalie: goalie('B goalie', 3) },
    });
    const best = explainChoice(viewFor(s, 'A'), legalActions(s, 'A'), s.config)[0]!.action;
    expect(best).toEqual({ type: 'pass', side: 'A', to: fwd(0) });
  });

  it('values a pass to a forward more when it has a second action to shoot straight away', () => {
    // The defender tackles well, so a forward who has to wait a turn would likely lose the ball.
    const base = {
      lanes,
      ball: { side: 'A' as const, pos: mid(0) },
      A: { lineup: { forward: { 0: player('A striker', { speed: 4, shot: 6 }) } } },
      B: { lineup: { defense: { 0: player('B def', { defense: 4 }) } }, revealed: [dfn(0), GOAL_POS], goalie: goalie('B goalie', 2) },
    };
    const passScore = (actionsLeft: number) => {
      const s = scenario({ ...base, actionsLeft });
      return explainChoice(viewFor(s, 'A'), legalActions(s, 'A'), s.config)
        .find((r) => r.action.type === 'pass' && r.action.to.area === 'forward' && r.action.to.lane === 0)!.score;
    };
    expect(passScore(2)).toBeGreaterThan(passScore(1) + 0.1);
  });

  it('shoots with a forward that has a clear edge on the goalie', () => {
    const s = scenario({
      lanes,
      ball: { side: 'A', pos: fwd(0) },
      A: { lineup: { forward: { 0: player('A striker', { shot: 6 }) } } },
      B: { revealed: [GOAL_POS], goalie: goalie('B goalie', 2) },
    });
    const best = explainChoice(viewFor(s, 'A'), legalActions(s, 'A'), s.config)[0]!.action;
    expect(best.type).toBe('shoot');
  });
});
