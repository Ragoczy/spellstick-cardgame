// Checks whether an action is legal right now. Returns a plain-language reason if not, or null
// if it's fine. legalActions() uses this too, so there is one source of truth for legality.

import type { Action } from './actions';
import { defOf, isActionSpell, isReactionSpell, slotAt } from './board';
import { otherSide, passTargets, samePos, type FieldPos, type Pos, type Side } from './field';
import type { GameState } from './state';

function validField(s: GameState, pos: FieldPos): boolean {
  return Number.isInteger(pos.lane) && pos.lane >= 0 && pos.lane < s.config.lanes &&
    (pos.area === 'defense' || pos.area === 'midfield' || pos.area === 'forward');
}

function validPos(s: GameState, pos: Pos): boolean {
  return pos.area === 'goal' || validField(s, pos);
}

function inHand(s: GameState, side: Side, uid: string): boolean {
  return s.teams[side].hand.includes(uid);
}

function holds(s: GameState, side: Side): boolean {
  return s.ball !== null && s.ball.side === side;
}

function canPass(s: GameState, side: Side, to: FieldPos, longPass: boolean): string | null {
  if (!holds(s, side)) return 'Your team needs the ball to pass.';
  if (!validField(s, to)) return 'That is not a spot on the field.';
  const targets = passTargets(s.ball!.pos, s.config.lanes, longPass);
  if (!targets.some((t) => samePos(t, to))) return "You can't pass there.";
  return null;
}

function canShoot(s: GameState, side: Side, from: 'forward' | 'midfield'): string | null {
  if (!holds(s, side)) return 'Your team needs the ball to shoot.';
  if (s.ball!.pos.area !== from) return from === 'forward' ? 'Only a forward holding the ball can shoot.' : 'A long shot needs a midfielder holding the ball.';
  return null;
}

function canTackle(s: GameState, side: Side): string | null {
  if (s.ball === null || s.ball.side !== otherSide(side)) return 'You can only tackle when the other team has the ball.';
  if (s.ball.pos.area === 'goal') return "Goalies can't be tackled.";
  if (s.ballProtected) return "That player just caught a pass and can't be tackled until their next turn.";
  return null;
}

export function validateAction(s: GameState, action: Action): string | null {
  const p = s.pending;
  if (p.kind === 'gameOver') return 'The game is over.';
  if (action.side !== p.side) return "It isn't your decision right now.";
  const side = action.side;
  const team = s.teams[side];

  switch (action.type) {
    case 'chooseGoalie': {
      if (p.kind !== 'chooseGoalie') return "It isn't time to choose a goalie.";
      if (!inHand(s, side, action.card) || defOf(s, action.card).kind !== 'goalie') return 'Choose one of your goalies.';
      return null;
    }

    case 'place': {
      if (p.kind !== 'placeLineup') return "It isn't time to place your lineup.";
      if (!inHand(s, side, action.card) || defOf(s, action.card).kind !== 'field') return 'Place a field player from your hand.';
      if (!validField(s, action.pos)) return 'That is not a spot on the field.';
      if (slotAt(s, side, action.pos)) return 'That spot is already filled.';
      return null;
    }

    case 'faceoffLane': {
      if (p.kind !== 'faceoffLane') return "It isn't time for a faceoff.";
      if (!Number.isInteger(action.lane) || action.lane < 0 || action.lane >= s.config.lanes) return 'Choose a lane on the field.';
      return null;
    }

    case 'react': {
      if (p.kind !== 'reaction') return 'There is no contest to react to.';
      if (action.card === null) return null;
      if (!inHand(s, side, action.card) || !isReactionSpell(defOf(s, action.card))) return 'Play a reaction spell from your hand.';
      return null;
    }

    case 'shootoutPick': {
      if (p.kind !== 'shootoutPick') return "It isn't time for a penalty.";
      if (!validField(s, action.pos)) return 'Choose one of your field players.';
      const slot = slotAt(s, side, action.pos);
      if (!slot) return 'Choose one of your field players.';
      if (s.shootout?.shooters.includes(slot.uid)) return 'Each player can only take one penalty.';
      return null;
    }

    case 'discard': {
      if (p.kind !== 'discard') return "It isn't the discard step.";
      if (!inHand(s, side, action.card)) return 'Discard a card from your hand.';
      return null;
    }

    default:
      break;
  }

  // Everything below is a turn action.
  if (p.kind !== 'action') return "It isn't time to take an action.";

  switch (action.type) {
    case 'pass':
      return canPass(s, side, action.to, false);

    case 'shoot':
      return canShoot(s, side, 'forward');

    case 'tackle':
      return canTackle(s, side);

    case 'substitute': {
      if (!validPos(s, action.pos) || !slotAt(s, side, action.pos)) return 'Choose one of your players to replace.';
      if (!inHand(s, side, action.card)) return 'Choose a card from your hand.';
      const kind = defOf(s, action.card).kind;
      if (action.pos.area === 'goal' ? kind !== 'goalie' : kind !== 'field') {
        return 'Replace a goalie with a goalie, or a field player with a field player.';
      }
      return null;
    }

    case 'regroup': {
      if (action.discard.length > s.config.regroupMax) return `You can discard up to ${s.config.regroupMax} cards.`;
      if (new Set(action.discard).size !== action.discard.length) return 'Each card can only be discarded once.';
      if (!action.discard.every((uid) => inHand(s, side, uid))) return 'Discard cards from your hand.';
      return null;
    }

    case 'cast': {
      if (!inHand(s, side, action.card)) return 'Cast a spell from your hand.';
      const spell = defOf(s, action.card);
      if (!isActionSpell(spell)) return isReactionSpell(spell) ? 'Reaction spells can only be played during a contest.' : 'That card is not a spell.';
      if (!validPos(s, action.caster) || !slotAt(s, side, action.caster)) return 'Choose one of your players to cast the spell.';
      const target = action.target;

      switch (spell.ability.effect) {
        case 'scry': {
          if (target.kind !== 'opponent' || !validPos(s, target.pos)) return "Choose one of your opponent's face-down cards.";
          const slot = slotAt(s, otherSide(side), target.pos);
          if (!slot || slot.revealed) return "Choose one of your opponent's face-down cards.";
          return null;
        }
        case 'swap': {
          if (target.kind !== 'swap' || !validField(s, target.a) || !validField(s, target.b)) return 'Choose two of your face-down players.';
          if (samePos(target.a, target.b)) return 'Choose two different players.';
          // The caster is revealed by casting, so it can't be one of the face-down pair.
          if (samePos(target.a, action.caster) || samePos(target.b, action.caster)) return "The caster is revealed by casting, so it can't be swapped.";
          const a = slotAt(s, side, target.a);
          const b = slotAt(s, side, target.b);
          if (!a || !b || a.revealed || b.revealed) return 'Both players must be face down.';
          return null;
        }
        case 'long_pass':
          if (target.kind !== 'pass') return 'Choose who receives the long pass.';
          return canPass(s, side, target.to, true);
        case 'long_shot':
          if (target.kind !== 'none') return 'A long shot has no target.';
          return canShoot(s, side, 'midfield');
        case 'steal':
          if (target.kind !== 'none') return 'Steal has no target.';
          return canTackle(s, side);
        case 'recall':
          if (target.kind !== 'none') return 'Recall has no target.';
          return null;
      }
      return null;
    }
  }
}

