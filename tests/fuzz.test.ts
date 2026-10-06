// Plays many complete games with random legal moves and checks that nothing impossible ever
// happens and every game ends. (Milestone 2 does the same at scale with a real AI.)
import { describe, expect, it } from 'vitest';
import { randomAgent } from '../src/ai/random';
import { runGame } from '../src/ai/runGame';
import { AREAS, SIDES } from '../src/engine/field';
import type { GameState } from '../src/engine/state';
import { prototypeCards } from '../src/data/prototype';
import { LANE_COUNTS } from './helpers';

const GAMES_PER_LANE_COUNT = 60;

function checkInvariants(s: GameState) {
  for (const side of SIDES) {
    const team = s.teams[side];
    const onField = [team.goalie, ...AREAS.flatMap((a) => team.lineup[a])].filter((slot) => slot !== null).map((slot) => slot.uid);
    const all = [...team.deck, ...team.hand, ...team.discard, ...onField];
    // Every card is in exactly one place, and no cards appear or vanish.
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(40);
    expect(all.every((uid) => uid.startsWith(side))).toBe(true);
    // Goalies only in goal; field players only on the field.
    if (team.goalie) expect(s.cards[team.goalie.uid]!.kind).toBe('goalie');
    for (const area of AREAS) {
      for (const slot of team.lineup[area]) if (slot) expect(s.cards[slot.uid]!.kind).toBe('field');
    }
    expect(s.score[side]).toBeLessThanOrEqual(s.config.goalsToWin);
  }
  // Once play starts, every spot is filled and the ball (if any) is held by a real player.
  if (s.turn > 0) {
    for (const side of SIDES) {
      for (const area of AREAS) expect(s.teams[side].lineup[area].every((slot) => slot !== null)).toBe(true);
    }
  }
  if (s.ball) {
    const { side, pos } = s.ball;
    const slot = pos.area === 'goal' ? s.teams[side].goalie : s.teams[side].lineup[pos.area][pos.lane];
    expect(slot).toBeTruthy();
  }
  if (s.result) expect(s.pending.kind).toBe('gameOver');
}

describe.each(LANE_COUNTS)('random games (%i lanes)', (lanes) => {
  it(`plays ${GAMES_PER_LANE_COUNT} games with no crashes, no impossible states, and no endless games`, () => {
    for (let seed = 1; seed <= GAMES_PER_LANE_COUNT; seed++) {
      const record = runGame(
        { seed, cardSet: prototypeCards, config: { lanes } },
        { A: randomAgent(seed * 2), B: randomAgent(seed * 2 + 1) },
        { onStep: (state) => checkInvariants(state) },
      );
      expect(record.final.result).not.toBeNull();
      expect(record.final.result!.reason).not.toBe('turn_cap');
    }
  }, 120_000);
});
