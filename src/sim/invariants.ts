// Checks that a game state is possible under the rules. Used by the simulator and the tests to
// catch "illegal states": lost or duplicated cards, empty spots, a ball held by nobody.

import { AREAS, SIDES } from '../engine/field';
import type { GameState } from '../engine/state';

/** Returns a list of problems (empty if the state is fine). */
export function findProblems(s: GameState): string[] {
  const problems: string[] = [];
  const deckSize = (side: string) => Object.keys(s.cards).filter((uid) => uid.startsWith(side)).length;

  for (const side of SIDES) {
    const team = s.teams[side];
    const onField = [team.goalie, ...AREAS.flatMap((a) => team.lineup[a])].filter((slot) => slot !== null).map((slot) => slot.uid);
    const all = [...team.deck, ...team.hand, ...team.discard, ...onField];
    if (new Set(all).size !== all.length) problems.push(`${side}: a card is in two places at once`);
    if (all.length !== deckSize(side)) problems.push(`${side}: has ${all.length} cards, expected ${deckSize(side)}`);
    if (!all.every((uid) => uid.startsWith(side))) problems.push(`${side}: holds the other team's card`);
    if (team.goalie && s.cards[team.goalie.uid]?.kind !== 'goalie') problems.push(`${side}: a non-goalie is in goal`);
    for (const area of AREAS) {
      for (const slot of team.lineup[area]) {
        if (slot && s.cards[slot.uid]?.kind !== 'field') problems.push(`${side}: a non-field card is in ${area}`);
        if (!slot && s.turn > 0) problems.push(`${side}: empty spot in ${area} during play`);
      }
    }
    if (s.score[side] > s.config.goalsToWin) problems.push(`${side}: score above the goal target`);
  }

  if (s.ball) {
    const { side, pos } = s.ball;
    const slot = pos.area === 'goal' ? s.teams[side].goalie : s.teams[side].lineup[pos.area][pos.lane];
    if (!slot) problems.push('the ball is held by an empty spot');
  }
  if (s.result && s.pending.kind !== 'gameOver') problems.push('game has a result but is still waiting for a move');
  if (!s.result && s.pending.kind === 'gameOver') problems.push('game is over without a result');
  return problems;
}
