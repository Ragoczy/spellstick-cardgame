// Plain-language descriptions of game events, for logs now and the game screen later.
// Presentation only: no rules here.

import type { StatName } from '../engine/cards';
import type { Breakdown, GameEvent } from '../engine/events';
import { posLabel, type Side } from '../engine/field';
import type { EndReason } from '../engine/state';

const STAT_LABEL: Record<StatName, string> = {
  speed: 'Speed', shot: 'Shot', defense: 'Defense', faceoff: 'Faceoff', save: 'Save',
};

const END_REASON: Record<EndReason, string> = {
  goals: 'reached the goal target',
  time: 'more goals at full time',
  shootout: 'won the penalty shootout',
  draw: 'the shootout ran out of shooters',
  turn_cap: 'turn limit reached — this is a bug',
};

const CONTEST_LABEL = { faceoff: 'Faceoff', pass: 'Pass', tackle: 'Tackle', shot: 'Shot', penalty: 'Penalty', hit: 'Hit' } as const;

/** "Speed 5 + Fire Boost 3 = 8", or "Defense 0 (shielded)". */
export function describeValue(b: Breakdown): string {
  if (!b.card) return 'empty spot 0';
  let text = `${b.baseLabel ?? STAT_LABEL[b.stat]} ${b.base}${b.shielded ? ' (shielded)' : ''}`;
  for (const part of b.parts) text += ` ${part.amount < 0 ? '−' : '+'} ${part.label} ${Math.abs(part.amount)}`;
  if (b.parts.length > 0) text += ` = ${b.total}`;
  return text;
}

export function describeEvent(e: GameEvent, names: Record<Side, string>): string | null {
  switch (e.type) {
    case 'gameStarted':
      return `${names[e.firstSide]} will take the first turn.`;
    case 'goalieChosen':
      return `${names[e.side]} puts a goalie in goal, face down.`;
    case 'drew':
      if (e.reason === 'turn') return null;
      return `${names[e.side]} draws ${e.count} card${e.count === 1 ? '' : 's'}${e.reason === 'setup' ? '' : ` (${e.reason})`}.`;
    case 'placed':
      return null;
    case 'faceoffStarted':
      return `Faceoff in lane ${e.lane + 1}, chosen by ${names[e.chooser]}.`;
    case 'turnStarted':
      return `— Turn ${e.turn}: ${names[e.side]} —`;
    case 'deckOut':
      return `${names[e.side]} has no cards left to draw. ${names[e.finalTurnFor]} takes the last turn after this one, then it's full time.`;
    case 'revealed':
      return `${names[e.side]} reveals ${e.card.def.name} (${posLabel(e.pos)}).`;
    case 'contestStarted':
      return null;
    case 'spellCast': {
      const how = e.fizzled ? 'but it fails (opposed affinity)' : e.affinity === 'match' ? '(affinity match)' : e.affinity === 'opposed' ? '(opposed affinity)' : '';
      return `${names[e.side]} casts ${e.card.def.name} from ${posLabel(e.caster)} ${how}`.trim() + '.';
    }
    case 'contestResolved': {
      const winner = e.winnerRole === 'attacker' ? e.attacker : e.defender;
      const loser = e.winnerRole === 'attacker' ? e.defender : e.attacker;
      const verb = winner.total === loser.total ? 'ties' : 'beats';
      const tie = winner.total === loser.total ? ` Ties go to ${names[winner.side]}.` : '';
      return `${CONTEST_LABEL[e.kind]}: ${names[winner.side]}'s ${describeValue(winner)} ${verb} ${names[loser.side]}'s ${describeValue(loser)}.${tie}`;
    }
    case 'ballMoved':
      return `${names[e.side]} has the ball (${posLabel(e.pos)}).`;
    case 'goal':
      return `GOAL for ${names[e.side]}! Score: ${names.A} ${e.score.A}, ${names.B} ${e.score.B}.`;
    case 'substituted':
      return `${names[e.side]} substitutes at ${posLabel(e.pos)}. ${e.removed.def.name} goes to the discard pile.`;
    case 'swapped':
      return `${names[e.side]} swaps two face-down players (${posLabel(e.a)} and ${posLabel(e.b)}).`;
    case 'scried':
      return `${names[e.side]} looks at the face-down card at ${posLabel(e.target)}.`;
    case 'discarded':
      return `${names[e.side]} discards ${e.cards.map((c) => c.def.name).join(', ')}.`;
    case 'shootoutStarted':
      return `Full time, and it's a tie: penalty shootout! ${names[e.first]} shoots first.`;
    case 'penalty':
      return `${e.scored ? 'Penalty scored' : 'Penalty saved'}. Shootout: ${names.A} ${e.goals.A}, ${names.B} ${e.goals.B}.`;
    case 'injured':
      if (e.carriedOff) return `${e.cause}! ${names[e.side]}'s ${e.card.def.name} was already hurt and is carried off.`;
      return `${e.cause}! ${names[e.side]}'s ${e.card.def.name} is injured${e.injury ? `: ${e.injury.name}` : ' (no injury cards left)'}.`;
    case 'forcedSub':
      return `${names[e.side]} brings on a substitute at ${posLabel(e.pos)}${e.toHand ? `; ${e.toHand.def.name} goes to hand` : ''}.`;
    case 'slotEmptied':
      return `${names[e.side]} has nobody to replace them: ${posLabel(e.pos)} is empty.`;
    case 'mended':
      return `${names[e.side]} mends ${e.card.def.name} (${e.injury.name}).`;
    case 'gameOver':
      return `Game over: ${e.result.winner === null ? 'a draw' : `${names[e.result.winner]} wins`} (${END_REASON[e.result.reason]}).`;
  }
}
