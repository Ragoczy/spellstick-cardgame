// Tackle rules tried in v0.17 phase e: tackle risk (the rule) and tackle assist (a what-if, off).
import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../../src/engine/config';
import { LANE_COUNTS, eventsOfType, lastContest, mid, play, player, scenario } from '../helpers';

describe.each(LANE_COUNTS)('optional tackle rules (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  /** B holds the ball at its last-lane midfield; A's midfielder there tackles. */
  function tackle(config: Partial<GameConfig>, tackler: { defense: number }, holderSpeed: number, shakeNeighbor = false) {
    const s = scenario({
      lanes, config, ball: { side: 'B', pos: mid(LAST) },
      A: { lineup: { midfield: { [LAST]: player('A mid', tackler) } } },
      B: { lineup: { midfield: { [LAST]: player('B mid', { speed: holderSpeed, toughness: 10 }) } } },
    });
    if (shakeNeighbor) s.teams.A.lineup.midfield[LAST - 1]!.shakenUntil = 3;
    return play(s, { type: 'tackle', side: 'A' });
  }

  describe('tackle assist', () => {
    it('+1 to a tackle for each standing teammate one lane over in the same row', () => {
      const { events } = tackle({ tackleAssist: 1 }, { defense: 3 }, 3);
      // With 2 lanes there is one neighbor; with 3, the last lane has one too.
      expect(lastContest(events).attacker.parts).toEqual([{ label: 'Assist', amount: 1 }]);
      expect(lastContest(events).winner).toBe('A');
    });

    it("a Shaken teammate doesn't help", () => {
      const { events } = tackle({ tackleAssist: 1 }, { defense: 3 }, 3, true);
      expect(lastContest(events).attacker.parts).toEqual([]);
    });

    it('is off by default', () => {
      expect(lastContest(tackle({}, { defense: 3 }, 3).events).attacker.parts).toEqual([]);
    });
  });

  describe('tackle risk', () => {
    it('a tackler who loses by 3 or more is Shaken, with no Toughness roll', () => {
      const { state, events } = tackle({ tackleRiskMargin: 3 }, { defense: 1 }, 4);
      expect(lastContest(events).winner).toBe('B');
      expect(eventsOfType(events, 'knockedDown')).toHaveLength(0);
      expect(eventsOfType(events, 'hurt')).toEqual([expect.objectContaining({ side: 'A', result: 'shaken', source: 'tackle' })]);
      expect(state.teams.A.lineup.midfield[LAST]!.shakenUntil).toBeDefined();
    });

    it('losing by less is nothing', () => {
      const { events } = tackle({ tackleRiskMargin: 3 }, { defense: 2 }, 4);
      expect(eventsOfType(events, 'hurt')).toHaveLength(0);
    });

    it('is on by default, at 3', () => {
      expect(eventsOfType(tackle({}, { defense: 0 }, 6).events, 'hurt')).toEqual([expect.objectContaining({ side: 'A', result: 'shaken' })]);
    });

    it('can be switched off', () => {
      expect(eventsOfType(tackle({ tackleRiskMargin: 0 }, { defense: 0 }, 6).events, 'hurt')).toHaveLength(0);
    });
  });
});
