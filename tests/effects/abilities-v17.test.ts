// Player abilities from v0.17 (RULES.md "Effect vocabulary"): hits_harder (Heavy hands),
// hard_to_hurt (Sturdy), and Quick but fragile (a bonus to evade, with lower Toughness).
//
// The severity roll is read from the 'hurt' event, which shows it with every modifier added.
import { describe, expect, it } from 'vitest';
import type { PlayerAbility } from '../../src/engine/cards';
import type { GameConfig } from '../../src/engine/config';
import { LANE_COUNTS, actionSpell, eventsOfType, fwd, lastContest, mid, play, player, scenario, uid } from '../helpers';

const heavy: PlayerAbility = { effect: 'hits_harder', params: { amount: 1 } };
const sturdy: PlayerAbility = { effect: 'hard_to_hurt', params: { amount: 1 } };
const quick: PlayerAbility = { effect: 'bonus', params: { stat: 'speed', amount: 2, when: 'evade' } };
const hit = () => actionSpell('Flambé', { effect: 'hit', params: { strength: 9 } });
/** Rolls are the same in every run here, so the severity roll with and without the ability can be compared. */
const CONFIG: Partial<GameConfig> = {};

describe.each(LANE_COUNTS)('v0.17 player abilities (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  /** A's forward hits B's defender; either may have an ability. */
  function hitWith(attacker?: PlayerAbility, target?: PlayerAbility) {
    const s = scenario({
      lanes, config: CONFIG,
      A: { hand: [hit()], lineup: { forward: { [LAST]: player('A fwd', {}, { affinities: ['earth', 'fire'], ...(attacker ? { ability: attacker } : {}) }) } } },
      B: { lineup: { defense: { [LAST]: player('B def', { defense: 0 }, target ? { ability: target } : {}) } } },
    });
    const { events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: fwd(LAST), target: { kind: 'hit' } });
    return eventsOfType(events, 'hurt')[0]!.roll!;
  }

  it('Heavy hands: anyone this player hurts rolls 1 higher for severity', () => {
    expect(hitWith(heavy)).toBe(hitWith() + 1);
  });

  it('Sturdy: this player rolls 1 lower for severity when hurt', () => {
    expect(hitWith(undefined, sturdy)).toBe(hitWith() - 1);
  });

  it('the two cancel out', () => {
    expect(hitWith(heavy, sturdy)).toBe(hitWith());
  });

  it('Quick but fragile: +2 Speed when evading a tackle', () => {
    const s = scenario({
      lanes, active: 'B', ball: { side: 'A', pos: mid(LAST) },
      A: { lineup: { midfield: { [LAST]: player('A mid', { speed: 3 }, { ability: quick }) } } },
      B: { lineup: { midfield: { [LAST]: player('B mid', { defense: 4 }) } } },
    });
    const { events } = play(s, { type: 'tackle', side: 'B' });
    expect(lastContest(events).defender.parts).toEqual([{ label: 'Ability', amount: 2 }]);
    expect(lastContest(events).winner).toBe('A');
  });
});
