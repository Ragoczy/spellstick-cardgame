// Plain-language play-by-play from the person's point of view:
// "Your Speed 5 beats their Defense 3. You catch it."

import { NUMERIC_EFFECTS, otherSide, type Breakdown, type EndReason, type GameEvent, type Side } from '../engine';
import { describeValue } from '../text/describe';
import { capitalize, injuryEffect, laneName, posName } from './labels';

export type Tone = 'turn' | 'good' | 'bad' | 'goal' | 'info';

export interface Line {
  text: string;
  tone: Tone;
}

const END_REASON: Record<EndReason, string> = {
  goals: 'first to 3 goals',
  time: 'more goals at full time',
  shootout: 'in the penalty shootout',
  draw: 'nobody could win the shootout',
  turn_cap: 'the game hit its turn limit',
};

export function describeForPlayer(e: GameEvent, me: Side, lanes: number): Line | null {
  const them = otherSide(me);
  const isMe = (side: Side) => side === me;
  const who = (side: Side) => (isMe(side) ? 'You' : 'The computer');
  const whose = (side: Side) => (isMe(side) ? 'your' : 'their');
  /** Verb that agrees with "You" / "The computer": verb(side, 'pass', 'passes'). */
  const verb = (side: Side, mine: string, theirs: string) => (isMe(side) ? mine : theirs);
  const at = (side: Side, pos: Parameters<typeof posName>[0]) => `${whose(side)} ${posName(pos, lanes)}`;
  const info = (text: string): Line => ({ text, tone: 'info' });

  switch (e.type) {
    case 'gameStarted':
      return info(`${who(e.firstSide)} will take the first turn. The other team chooses the lane for the opening faceoff.`);
    case 'goalieChosen':
      return isMe(e.side) && e.secret ? info(`You put ${e.secret.card.def.name} in goal, face down.`) : null;
    case 'drew': {
      if (e.reason === 'turn') {
        return isMe(e.side) ? null : info(`The computer draws a ${e.pile === 'players' ? 'player' : 'spell'}.`);
      }
      if (!isMe(e.side)) return e.reason === 'setup' ? null : info(`The computer draws ${e.count} card${e.count === 1 ? '' : 's'}.`);
      const names = e.secret?.cards.map((c) => c.def.name).join(', ');
      return info(`You draw ${e.count} card${e.count === 1 ? '' : 's'}${names ? `: ${names}` : ''}.`);
    }
    case 'placed':
      return null;
    case 'faceoffStarted':
      return info(`Faceoff in the ${laneName(e.lane, lanes)} lane.`);
    case 'turnStarted':
      return { text: isMe(e.side) ? `Your turn (turn ${e.turn}).` : `The computer's turn (turn ${e.turn}).`, tone: 'turn' };
    case 'deckOut':
      return info(
        `${isMe(e.side) ? 'Your' : "The computer's"} deck is empty. ` +
        `${isMe(e.finalTurnFor) ? 'You take' : 'The computer takes'} the last turn, then it's full time.`,
      );
    case 'revealed':
      return info(`${capitalize(at(e.side, e.pos))} is revealed: ${e.card.def.name}.`);
    case 'contestStarted': {
      const a = e.attacker;
      const rolls = a.roll || e.defender.roll
        ? ` Rolls: ${isMe(a.side) ? 'you' : 'the computer'} ${a.roll ?? '–'}, ${isMe(e.defender.side) ? 'you' : 'the computer'} ${e.defender.roll ?? '–'}.`
        : '';
      switch (e.kind) {
        case 'pass': return info(`${who(a.side)} ${verb(a.side, 'pass', 'passes')} to ${at(a.side, a.pos)}.${rolls}`);
        case 'tackle': return info(`${who(a.side)} ${verb(a.side, 'try', 'tries')} to tackle ${at(e.defender.side, e.defender.pos)}.${rolls}`);
        case 'shot': return info(`${who(a.side)} ${verb(a.side, 'shoot', 'shoots')} with ${at(a.side, a.pos)}!${rolls}`);
        case 'penalty': return info(`${who(a.side)} ${verb(a.side, 'take', 'takes')} a penalty with ${at(a.side, a.pos)}.${rolls}`);
        case 'hit': return info(`${capitalize(at(a.side, a.pos))} goes after ${at(e.defender.side, e.defender.pos)}!${rolls}`);
        case 'faceoff': return rolls ? info(rolls.trim()) : null;
      }
      return null;
    }
    case 'spellCast': {
      const numeric = NUMERIC_EFFECTS.has(e.card.def.kind === 'spell' ? e.card.def.ability.effect : '');
      const note = e.fizzled
        ? ' Opposed affinity: it fails.'
        : e.affinity === 'match' ? (numeric ? ' Affinity match: +1.' : ' Affinity match.')
        : e.affinity === 'opposed' ? ' Opposed affinity: −1.' : '';
      return info(`${who(e.side)} ${verb(e.side, 'cast', 'casts')} ${e.card.def.name} with ${at(e.side, e.caster)}.${note}`);
    }
    case 'contestResolved': {
      const mine = e.attacker.side === me ? e.attacker : e.defender;
      const theirs = e.attacker.side === me ? e.defender : e.attacker;
      const iWon = e.winner === me;
      const tie = mine.total === theirs.total;
      const compare = (b: Breakdown, owner: string) => `${owner} ${describeValue(b)}`;
      const sentence = tie
        ? `${capitalize(compare(mine, 'your'))} ties ${compare(theirs, 'their')}.`
        : iWon
          ? `${capitalize(compare(mine, 'your'))} beats ${compare(theirs, 'their')}.`
          : `${capitalize(compare(theirs, 'their'))} beats ${compare(mine, 'your')}.`;
      const attacker = e.attacker.side;
      const defender = e.defender.side;
      const attackerWon = e.winnerRole === 'attacker';
      let outcome = '';
      switch (e.kind) {
        case 'pass':
          outcome = attackerWon ? `${who(attacker)} ${verb(attacker, 'catch', 'catches')} it.` : `Intercepted by ${at(defender, e.defender.pos)}.`;
          break;
        case 'tackle':
          outcome = attackerWon ? `${who(attacker)} ${verb(attacker, 'take', 'takes')} the ball.` : `${who(defender)} ${verb(defender, 'keep', 'keeps')} the ball.`;
          break;
        case 'shot':
          outcome = attackerWon ? "It's in!" : `Saved by ${whose(defender)} goalie.`;
          break;
        case 'faceoff':
          outcome = `${who(e.winner)} ${verb(e.winner, 'win', 'wins')} the faceoff.`;
          break;
        case 'penalty':
          outcome = attackerWon ? 'Scored!' : 'Saved!';
          break;
        case 'hit':
          outcome = attackerWon ? 'It lands!' : `${who(defender)} ${verb(defender, 'shrug', 'shrugs')} it off.`;
          break;
      }
      const tieNote = tie ? ` Ties go to ${isMe(e.winner) ? 'you' : 'the computer'}.` : '';
      return { text: `${sentence}${tieNote} ${outcome}`, tone: iWon ? 'good' : 'bad' };
    }
    case 'ballMoved':
      return null;
    case 'goal':
      return { text: `GOAL! ${who(e.side)} ${verb(e.side, 'score', 'scores')}. You ${e.score[me]}, the computer ${e.score[them]}.`, tone: 'goal' };
    case 'substituted':
      return info(`${who(e.side)} ${verb(e.side, 'substitute', 'substitutes')} ${at(e.side, e.pos)}. ${e.removed.def.name} goes to the discard pile.`);
    case 'swapped':
      return info(`${who(e.side)} ${verb(e.side, 'swap', 'swaps')} two face-down players: ${at(e.side, e.a)} and ${posName(e.b, lanes)}.`);
    case 'scried':
      if (isMe(e.side)) {
        return info(`You look at ${at(them, e.target)}: ${e.secret?.card.def.name ?? 'a card'}. It stays face down.`);
      }
      return info(`The computer looks at ${at(me, e.target)}.`);
    case 'discarded':
      if (e.fromPile) {
        const pile = e.fromPile === 'players' ? 'Players' : 'Spells';
        return info(`${isMe(e.side) ? 'Your hand is full, so the top card of your' : "The computer's hand is full, so the top card of its"} ${pile} pile goes to the discard pile: ${e.cards.map((c) => c.def.name).join(', ')}.`);
      }
      return info(`${who(e.side)} ${verb(e.side, 'discard', 'discards')} ${e.cards.map((c) => c.def.name).join(', ')}.`);
    case 'injured': {
      const where = capitalize(at(e.side, e.pos));
      if (e.carriedOff) {
        return { text: `${e.cause}! ${where} (${e.card.def.name}) was already hurt and is carried off.`, tone: isMe(e.side) ? 'bad' : 'good' };
      }
      const hurt = e.injury
        ? `${where} has ${e.injury.name.toLowerCase()}: ${injuryEffect(e.injury, e.card.def)}.`
        : `${where} is hurt, but the injury deck is empty, so there's no injury card.`;
      return { text: `${e.cause}! ${hurt}`, tone: isMe(e.side) ? 'bad' : 'good' };
    }
    case 'forcedSub':
      if (e.toHand) {
        return info(`${who(e.side)} ${verb(e.side, 'bring', 'brings')} on a substitute for ${at(e.side, e.pos)}, face down. ` +
          `${e.toHand.def.name} goes to ${whose(e.side)} hand to recover.`);
      }
      return info(`${who(e.side)} ${verb(e.side, 'fill', 'fills')} ${at(e.side, e.pos)} spot with a new player, face down.`);
    case 'slotEmptied':
      return { text: `Nobody can replace ${at(e.side, e.pos)}: the spot is empty and counts as 0 until it's filled.`, tone: isMe(e.side) ? 'bad' : 'good' };
    case 'mended':
      return info(`${who(e.side)} ${verb(e.side, 'mend', 'mends')} ${e.card.def.name}: no more ${e.injury.name.toLowerCase()}.`);
    case 'diceRolled': {
      const left = e.left[e.caller];
      const myRoll = isMe(e.attacker) ? e.attackerRoll : e.defenderRoll;
      const theirRoll = isMe(e.attacker) ? e.defenderRoll : e.attackerRoll;
      return { text: `🎲 ${who(e.caller)} ${verb(e.caller, 'call', 'calls')} for dice (${left} roll${left === 1 ? '' : 's'} left). ` +
        `You roll ${myRoll ?? '–'}, the computer rolls ${theirRoll ?? '–'}.`, tone: 'turn' };
    }
    case 'shootoutStarted':
      return { text: `Full time, and it's a tie: penalty shootout! ${who(e.first)} ${verb(e.first, 'shoot', 'shoots')} first.`, tone: 'goal' };
    case 'penalty':
      return info(`Shootout: you ${e.goals[me]}, the computer ${e.goals[them]}.`);
    case 'gameOver': {
      const { winner, reason } = e.result;
      const headline = winner === null ? "It's a draw" : isMe(winner) ? 'You win' : 'The computer wins';
      return { text: `${headline} (${END_REASON[reason]}).`, tone: 'goal' };
    }
  }
}
