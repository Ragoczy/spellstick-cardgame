// Effect: shield {} (reaction, non-numeric)
import { describe, expect, it } from 'vitest';
import type { PlayerAbility } from '../../src/engine/cards';
import { makeConfig } from '../../src/engine/config';
import { shieldedValue } from '../../src/engine/score';
import { describeValue } from '../../src/text/describe';
import { LANE_COUNTS, boost, fwd, lastContest, mid, play, player, scenario, shield, uid } from '../helpers';

const plusTwo: PlayerAbility = { effect: 'bonus', params: { stat: 'defense', amount: 2 } };

describe('shielded values', () => {
  it('takes off 2, never below 0 (the rule since v0.17)', () => {
    const config = makeConfig();
    expect([0, 1, 2, 5, 6, 9].map((v) => shieldedValue(v, config))).toEqual([0, 0, 0, 3, 4, 7]);
  });

  it("counts half, rounded up, with 'half' (a simulation what-if)", () => {
    const config = makeConfig({ shieldEffect: 'half' });
    expect([0, 1, 2, 5, 6, 7, 8].map((v) => shieldedValue(v, config))).toEqual([0, 1, 1, 3, 3, 4, 4]);
  });

  it("counts as 0 with the old 'zero' rule", () => {
    expect(shieldedValue(8, makeConfig({ shieldEffect: 'zero' }))).toBe(0);
  });
});

describe.each(LANE_COUNTS)('shield (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  /** A passes to its forward (Speed `speed`), shielding the defender (Defense `defense`, +2 ability). */
  function shieldedPass(speed: number, defense: number, config = {}) {
    const s = scenario({
      lanes,
      config,
      A: { hand: [shield('Shield')], lineup: { forward: { [LAST]: player('A fwd', { speed }) } } },
      B: { lineup: { defense: { [LAST]: player('B def', { defense }, { ability: plusTwo }) } } },
    });
    return play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'Shield') });
  }

  it("takes 2 off the opposing player's value, worked out with abilities first", () => {
    const { state, events } = shieldedPass(7, 7);
    const contest = lastContest(events);
    // Defense 7 + Ability 2 = 9, − 2 for the Shield = 7. A's Speed 7 wins the tie (the receiver wins ties).
    expect(contest.defender).toMatchObject({ base: 7, total: 7, shielded: true, printed: 9 });
    expect(contest.defender.parts).toEqual([{ label: 'Ability', amount: 2 }, { label: 'Shield', amount: -2 }]);
    expect(describeValue(contest.defender)).toBe('Defense 7 + Ability 2 − Shield 2 = 7');
    expect(contest.winner).toBe('A');
    expect(state.ball).toEqual({ side: 'A', pos: fwd(LAST) });
  });

  it('never takes a value below 0', () => {
    const contest = lastContest(shieldedPass(1, 0, {}).events); // Defense 0 + Ability 2 = 2, − 2 = 0
    expect(contest.defender.total).toBe(0);
  });

  it('adds spells after the Shield, and leaves their own spell alone', () => {
    const s = scenario({
      lanes,
      A: { hand: [shield('Shield')], lineup: { forward: { [LAST]: player('A fwd', { speed: 4 }) } } },
      B: { hand: [boost('Boost', 2)], lineup: { defense: { [LAST]: player('B def', { defense: 4 }) } } },
    });
    const { events } = play(
      s,
      { type: 'pass', side: 'A', to: fwd(LAST) },
      { type: 'react', side: 'A', card: uid(s, 'A', 'Shield') },
      { type: 'react', side: 'B', card: uid(s, 'B', 'Boost') },
    );
    // Defense 4 − 2 = 2, + Boost 2 = 4.
    expect(lastContest(events).defender.total).toBe(4);
    expect(lastContest(events).winner).toBe('A'); // 4 vs 4, the receiver wins ties
  });

  it('when both sides shield, both lose 2 and the defender wins the tie', () => {
    const s = scenario({
      lanes, ball: { side: 'B', pos: mid(LAST) },
      A: { hand: [shield('A shield')], lineup: { midfield: { [LAST]: player('A mid', { defense: 6 }) } } },
      B: { hand: [shield('B shield')], lineup: { midfield: { [LAST]: player('B mid', { speed: 6 }) } } },
    });
    const { events } = play(
      s,
      { type: 'tackle', side: 'A' },
      { type: 'react', side: 'A', card: uid(s, 'A', 'A shield') },
      { type: 'react', side: 'B', card: uid(s, 'B', 'B shield') },
    );
    expect(lastContest(events).attacker.total).toBe(4);
    expect(lastContest(events).defender.total).toBe(4);
    expect(lastContest(events).winner).toBe('B');
  });

  it("with 'half', the value counts half, rounded up", () => {
    const contest = lastContest(shieldedPass(5, 7, { shieldEffect: 'half' }).events);
    // Defense 7 + Ability 2 = 9, halved and rounded up to 5.
    expect(contest.defender).toMatchObject({ total: 5, printed: 9 });
    expect(describeValue(contest.defender)).toBe('Defense 7 + Ability 2 − Shield 4 = 5');
  });

  it("with the old 'zero' rule, the stat counts as 0 and abilities are ignored (online matches before v0.17)", () => {
    const contest = lastContest(shieldedPass(1, 6, { shieldEffect: 'zero' }).events);
    expect(contest.defender).toMatchObject({ base: 0, total: 0, shielded: true, parts: [] });
    expect(describeValue(contest.defender)).toBe('Defense 0 (shielded)');
    expect(contest.winner).toBe('A');
  });
});
