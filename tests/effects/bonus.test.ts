// Effect: bonus { stat, amount, when?, row? }
import { describe, expect, it } from 'vitest';
import type { PlayerAbility } from '../../src/engine/cards';
import { LANE_COUNTS, dfn, fwd, goalie, lastContest, mid, play, player, scenario } from '../helpers';

const bonus = (params: Extract<PlayerAbility, { effect: 'bonus' }>['params']): PlayerAbility => ({ effect: 'bonus', params });

describe.each(LANE_COUNTS)('bonus (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('adds to the stat when used for the named purpose (+2 Defense when intercepting)', () => {
    const s = scenario({
      lanes,
      B: { lineup: { defense: { [LAST]: player('B def', { defense: 3 }, { ability: bonus({ stat: 'defense', amount: 2, when: 'intercept' }) }) } } },
    });
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(lastContest(events).defender.total).toBe(5);
    expect(lastContest(events).defender.parts).toEqual([{ label: 'Ability', amount: 2 }]);
  });

  it('does not apply when the stat is used for something else (tackling)', () => {
    const s = scenario({
      lanes,
      active: 'B',
      ball: { side: 'A', pos: fwd(LAST) },
      B: { lineup: { defense: { [LAST]: player('B def', { defense: 3 }, { ability: bonus({ stat: 'defense', amount: 2, when: 'intercept' }) }) } } },
    });
    const { events } = play(s, { type: 'tackle', side: 'B' });
    expect(lastContest(events).attacker.total).toBe(3);
  });

  it('applies only while in the named row (+1 Shot while playing forward)', () => {
    const ability = bonus({ stat: 'shot', amount: 1, row: 'forward' });
    const atForward = scenario({
      lanes,
      ball: { side: 'A', pos: fwd(LAST) },
      A: { lineup: { forward: { [LAST]: player('A fwd', { shot: 4 }, { ability }) } } },
      B: { goalie: goalie('B goalie', 4) },
    });
    expect(lastContest(play(atForward, { type: 'shoot', side: 'A' }).events).attacker.total).toBe(5);

    const speedInForward = bonus({ stat: 'speed', amount: 1, row: 'forward' });
    const atMid = scenario({ lanes, A: { lineup: { midfield: { [LAST]: player('A mid', { speed: 3 }, { ability: speedInForward }) } } } });
    expect(lastContest(play(atMid, { type: 'pass', side: 'A', to: mid(LAST) }).events).attacker.total).toBe(3);
  });

  it('needs every listed condition to hold', () => {
    const ability = bonus({ stat: 'speed', amount: 2, when: 'receive', row: 'defense' });
    const s = scenario({
      lanes,
      A: { lineup: { defense: { [LAST]: player('A def', { speed: 3 }, { ability }) }, forward: { [LAST]: player('A fwd', { speed: 3 }, { ability }) } } },
    });
    expect(lastContest(play(s, { type: 'pass', side: 'A', to: dfn(LAST) }).events).attacker.total).toBe(5);
    expect(lastContest(play(s, { type: 'pass', side: 'A', to: fwd(LAST) }).events).attacker.total).toBe(3);
  });

  it('works on the Faceoff stat (+2 Faceoff)', () => {
    const s = scenario({
      lanes,
      ball: null,
      A: { lineup: { midfield: { [LAST]: player('A mid', { faceoff: 3 }, { ability: bonus({ stat: 'faceoff', amount: 2, when: 'faceoff' }) }) } } },
    });
    s.pending = { kind: 'faceoffLane', side: 'B' };
    const { events } = play(s, { type: 'faceoffLane', side: 'B', lane: LAST });
    expect(lastContest(events).defender.total).toBe(5);
    expect(lastContest(events).winner).toBe('A');
  });
});
