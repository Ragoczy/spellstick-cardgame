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
      }
    }
    if (s.score[side] > s.config.goalsToWin) problems.push(`${side}: score above the goal target`);
  }

  if (s.ball) {
    const { side, pos } = s.ball;
    const slot = pos.area === 'goal' ? s.teams[side].goalie : s.teams[side].lineup[pos.area][pos.lane];
    // A carried-off ball carrier's spot is briefly empty while their substitute comes on.
    const subComing = s.forcedSub && s.forcedSub.side === side && s.forcedSub.pos.area === pos.area &&
      (pos.area === 'goal' || (s.forcedSub.pos.area !== 'goal' && s.forcedSub.pos.lane === pos.lane));
    if (!slot && !subComing) problems.push('the ball is held by an empty spot');
  }

  // Injuries: every injury card is either in the injury deck or on exactly one player who is in
  // a team's hand or on the field (never in a deck or discard pile).
  const attached = Object.values(s.injuries);
  const allInjuryCards = [...s.injuryDeck, ...attached];
  if (new Set(allInjuryCards).size !== allInjuryCards.length) problems.push('an injury card is in two places');
  if (allInjuryCards.length !== Object.keys(s.injuryCards).length) problems.push('an injury card went missing');
  for (const uid of Object.keys(s.injuries)) {
    const side = uid.startsWith('A') ? 'A' : 'B';
    const team = s.teams[side];
    const onField = [team.goalie, ...AREAS.flatMap((a) => team.lineup[a])].some((slot) => slot?.uid === uid);
    if (!onField && !team.hand.includes(uid)) problems.push(`injured card ${uid} is not on the field or in hand`);
  }
  if (s.result && s.pending.kind !== 'gameOver') problems.push('game has a result but is still waiting for a move');
  if (!s.result && s.pending.kind === 'gameOver') problems.push('game is over without a result');
  return problems;
}
