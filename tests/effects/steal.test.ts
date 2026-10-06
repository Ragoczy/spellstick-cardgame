// Effect: steal { amount } (action, numeric)
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { LANE_COUNTS, GOAL_POS, actionSpell, fwd, lastContest, mid, play, player, scenario, uid } from '../helpers';

const steal = (element: string | null = 'fire') => actionSpell('Steal', { effect: 'steal', params: { amount: 2 } }, element);

describe.each(LANE_COUNTS)('steal (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  function stealWith(casterAffinity: string) {
    const s = scenario({
      lanes,
      ball: { side: 'B', pos: mid(LAST) },
      A: { hand: [steal()], lineup: { midfield: { [LAST]: player('A mid', { defense: 3 }, { affinities: [casterAffinity] }) } } },
    });
    return play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Steal'), caster: mid(LAST), target: { kind: 'none' } });
  }

  it('makes a tackle with the amount added to your value', () => {
    const { state, events } = stealWith('earth');
    const contest = lastContest(events);
    expect(contest.kind).toBe('tackle');
    expect(contest.attacker.total).toBe(5);
    expect(state.ball).toEqual({ side: 'A', pos: mid(LAST) });
  });

  it('is stronger on a match and weaker when opposed', () => {
    expect(lastContest(stealWith('fire').events).attacker.total).toBe(6);
    expect(lastContest(stealWith('water').events).attacker.total).toBe(4);
  });

  it('needs a legal tackle: not against a goalie, not when you have the ball', () => {
    const goalieBall = scenario({ lanes, ball: { side: 'B', pos: GOAL_POS }, A: { hand: [steal()] } });
    expect(() => applyAction(goalieBall, { type: 'cast', side: 'A', card: uid(goalieBall, 'A', 'Steal'), caster: fwd(0), target: { kind: 'none' } }))
      .toThrow(IllegalActionError);
    const ownBall = scenario({ lanes, ball: { side: 'A', pos: mid(0) }, A: { hand: [steal()] } });
    expect(() => applyAction(ownBall, { type: 'cast', side: 'A', card: uid(ownBall, 'A', 'Steal'), caster: fwd(0), target: { kind: 'none' } }))
      .toThrow(IllegalActionError);
  });
});
