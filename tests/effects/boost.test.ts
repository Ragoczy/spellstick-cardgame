// Effect: boost { amount, when? } (reaction, numeric)
import { describe, expect, it } from 'vitest';
import { legalActions } from '../../src/engine/legal';
import { validateAction } from '../../src/engine/validate';
import type { StatUse } from '../../src/engine/cards';
import { LANE_COUNTS, boost, fwd, lastContest, play, reaction, scenario, uid } from '../helpers';

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

// Effect: boost { amount, when } — only for one use of a stat, such as receiving a pass.
describe.each(LANE_COUNTS)('boost with "when" (%i lanes)', (lanes) => {
  const LAST = lanes - 1;
  const onlyWhen = (name: string, when: StatUse) => reaction(name, { effect: 'boost', params: { amount: 3, when } });

  it('adds its amount when the stat is used that way', () => {
    const s = scenario({ lanes, A: { hand: [onlyWhen('Burst of Speed', 'receive')] } });
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'Burst of Speed') });
    expect(lastContest(events).attacker.total).toBe(6);
  });

  it('works for the defending side when its use matches', () => {
    const s = scenario({ lanes, B: { hand: [onlyWhen('Quicken', 'intercept')] } });
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'B', card: uid(s, 'B', 'Quicken') });
    expect(lastContest(events).defender.total).toBe(6);
  });

  it("can't be played in a contest that uses the stat another way", () => {
    const s = scenario({ lanes, A: { hand: [onlyWhen('Pinpoint', 'shoot'), boost('Boost', 2)] } });
    const { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending.kind).toBe('reaction');
    const cards = legalActions(state, 'A').flatMap((a) => (a.type === 'react' && a.card ? [a.card] : []));
    expect(cards).toEqual([uid(s, 'A', 'Boost')]);
    expect(validateAction(state, { type: 'react', side: 'A', card: uid(s, 'A', 'Pinpoint') })).toMatch(/doesn't work in this contest/);
  });

  it("doesn't stop the game to ask when no reaction fits", () => {
    const s = scenario({ lanes, B: { hand: [onlyWhen('Burst of Speed', 'receive')] } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending.kind).not.toBe('reaction');
    expect(lastContest(events).defender.total).toBe(3);
    expect(state.teams.B.hand).toContain(uid(s, 'B', 'Burst of Speed'));
  });
});
