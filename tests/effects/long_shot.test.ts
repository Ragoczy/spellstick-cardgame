// Effect: long_shot { penalty } (action, numeric: affinity changes the penalty)
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { LANE_COUNTS, GOAL_POS, actionSpell, fwd, goalie, lastContest, mid, play, player, scenario, uid } from '../helpers';

const longShot = (element: string | null = 'fire') => actionSpell('Long shot', { effect: 'long_shot', params: { penalty: 2 } }, element);

describe.each(LANE_COUNTS)('long_shot (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  function shootWith(casterAffinity: string, shot = 6, save = 3) {
    const s = scenario({
      lanes,
      ball: { side: 'A', pos: mid(LAST) },
      A: { hand: [longShot()], lineup: { midfield: { [LAST]: player('A mid', { shot }, { affinities: [casterAffinity] }) } } },
      B: { goalie: goalie('B goalie', save) },
    });
    return play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Long shot'), caster: mid(LAST), target: { kind: 'none' } });
  }

  it('lets a midfielder holding the ball shoot, with Shot reduced by the penalty', () => {
    const { state, events } = shootWith('earth');
    const contest = lastContest(events);
    expect(contest.kind).toBe('shot');
    expect(contest.attacker.total).toBe(4);
    expect(contest.attacker.parts).toEqual([{ label: 'Long shot', amount: -2 }]);
    expect(state.score.A).toBe(1);
  });

  it('has a smaller penalty on a match and a bigger one when opposed', () => {
    expect(lastContest(shootWith('fire').events).attacker.total).toBe(5);
    expect(lastContest(shootWith('water').events).attacker.total).toBe(3);
  });

  it('never takes the Shot below 0', () => {
    expect(lastContest(shootWith('water', 1).events).attacker.total).toBe(0);
  });

  it('can be cast by a different player than the shooter, using the caster\'s affinity', () => {
    const s = scenario({
      lanes,
      ball: { side: 'A', pos: mid(LAST) },
      A: { hand: [longShot()], lineup: { midfield: { [LAST]: player('A mid', { shot: 5 }) } } },
      B: { goalie: goalie('B goalie', 3) },
    });
    s.cards[s.teams.A.goalie!.uid] = goalie('Fire keeper', 4, { affinities: ['fire'] });
    const { events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Long shot'), caster: GOAL_POS, target: { kind: 'none' } });
    expect(lastContest(events).attacker.total).toBe(4);
  });

  it('needs a midfielder holding the ball', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: fwd(0) }, A: { hand: [longShot()] } });
    expect(() => applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Long shot'), caster: fwd(0), target: { kind: 'none' } }))
      .toThrow(IllegalActionError);
  });
});
