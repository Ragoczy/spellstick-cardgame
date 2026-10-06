// Effect: shield {} (reaction, non-numeric)
import { describe, expect, it } from 'vitest';
import type { PlayerAbility } from '../../src/engine/cards';
import { LANE_COUNTS, boost, fwd, lastContest, mid, play, player, scenario, shield, uid } from '../helpers';

const plusTwo: PlayerAbility = { effect: 'bonus', params: { stat: 'defense', amount: 2 } };

describe.each(LANE_COUNTS)('shield (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it("makes the opposing player's stat count as 0 and ignores their abilities", () => {
    const s = scenario({
      lanes,
      A: { hand: [shield('Shield')], lineup: { forward: { [LAST]: player('A fwd', { speed: 1 }) } } },
      B: { lineup: { defense: { [LAST]: player('B def', { defense: 6 }, { ability: plusTwo }) } } },
    });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'Shield') });
    const contest = lastContest(events);
    expect(contest.defender).toMatchObject({ base: 0, total: 0, shielded: true, parts: [] });
    expect(contest.winner).toBe('A');
    expect(state.ball).toEqual({ side: 'A', pos: fwd(LAST) });
  });

  it("doesn't cancel the opposing player's own spell", () => {
    const s = scenario({ lanes, A: { hand: [shield('Shield')] }, B: { hand: [boost('Boost', 2)] } });
    const { events } = play(
      s,
      { type: 'pass', side: 'A', to: fwd(LAST) },
      { type: 'react', side: 'A', card: uid(s, 'A', 'Shield') },
      { type: 'react', side: 'B', card: uid(s, 'B', 'Boost') },
    );
    expect(lastContest(events).defender.total).toBe(2);
    expect(lastContest(events).winner).toBe('A'); // 3 vs 2
  });

  it('when both sides shield, both stats are 0 and the defender wins the tie', () => {
    const s = scenario({ lanes, ball: { side: 'B', pos: mid(LAST) }, A: { hand: [shield('A shield')] }, B: { hand: [shield('B shield')] } });
    const { events } = play(
      s,
      { type: 'tackle', side: 'A' },
      { type: 'react', side: 'A', card: uid(s, 'A', 'A shield') },
      { type: 'react', side: 'B', card: uid(s, 'B', 'B shield') },
    );
    expect(lastContest(events).attacker.total).toBe(0);
    expect(lastContest(events).defender.total).toBe(0);
    expect(lastContest(events).winner).toBe('B');
  });
});
