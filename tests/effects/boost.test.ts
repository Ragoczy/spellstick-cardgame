// Effect: boost { amount } (reaction, numeric)
import { describe, expect, it } from 'vitest';
import { LANE_COUNTS, boost, fwd, lastContest, play, scenario, uid } from '../helpers';

describe.each(LANE_COUNTS)('boost (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it("adds its amount to your side's value in the contest", () => {
    const s = scenario({ lanes, A: { hand: [boost('Boost', 2)] } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'Boost') });
    expect(lastContest(events).attacker.total).toBe(5);
    expect(state.ball).toEqual({ side: 'A', pos: fwd(LAST) });
    expect(state.teams.A.discard).toContain(uid(s, 'A', 'Boost'));
  });

  it('works for the defending side too', () => {
    const s = scenario({ lanes, B: { hand: [boost('Boost', 2)] } });
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'B', card: uid(s, 'B', 'Boost') });
    expect(lastContest(events).defender.total).toBe(5);
  });
});
