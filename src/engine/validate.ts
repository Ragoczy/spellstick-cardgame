// Checks whether an action is legal right now. Returns a plain-language reason if not, or null
// if it's fine. legalActions() uses this too, so there is one source of truth for legality.

import type { Action } from './actions';
import { castsLeft, defOf, isActionSpell, isFoulSpell, isReactionSpell, justCameOn, slotAt } from './board';
import { inPenaltyBox, isShaken } from './injuries';
import { PHYSICAL_REACTIONS, type PhysicalCardDef } from './cards';
import { isFieldPos, opposite, otherSide, passTargets, samePos, type FieldPos, type Pos, type Side } from './field';
import type { GameState } from './state';
import { reactionFits, type SpellCardDef } from './cards';

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
  const passer = cantAct(s, side, s.ball!.pos);
  if (passer) return passer;
  if (!validField(s, to)) return 'That is not a spot on the field.';
  const targets = passTargets(s.ball!.pos, s.config.lanes, longPass);
  if (!targets.some((t) => samePos(t, to))) return "You can't pass there.";
  if (!slotAt(s, side, to)) return 'Nobody is in that spot to catch it.';
  return null;
}

function canShoot(s: GameState, side: Side, from: 'forward' | 'midfield'): string | null {
  if (!holds(s, side)) return 'Your team needs the ball to shoot.';
  const shooter = cantAct(s, side, s.ball!.pos);
  if (shooter) return shooter;
  if (s.ball!.pos.area !== from) return from === 'forward' ? 'Only a forward holding the ball can shoot.' : 'A long shot needs a midfielder holding the ball.';
  return null;
}

function canTackle(s: GameState, side: Side): string | null {
  if (s.ball === null || s.ball.side !== otherSide(side)) return 'You can only tackle when the other team has the ball.';
  if (s.ball.pos.area === 'goal') return "Goalies can't be tackled.";
  if (s.ballProtected) return "That player just caught a pass and can't be tackled until their next turn.";
  if (!slotAt(s, side, opposite(s.ball.pos))) return 'You have nobody in that spot to tackle with.';
  return cantAct(s, side, opposite(s.ball.pos));
}

/** A lane can be chosen for a faceoff unless both midfielders are missing (and some lane has one). */
function faceoffLaneOk(s: GameState, lane: number): boolean {
  const hasMid = (l: number) => !!slotAt(s, 'A', { area: 'midfield', lane: l }) || !!slotAt(s, 'B', { area: 'midfield', lane: l });
  if (hasMid(lane)) return true;
  return !Array.from({ length: s.config.lanes }, (_, l) => l).some(hasMid);
}

/** Goalie clears (RULES.md): your goalie holds the ball, so your action must pass it out. */
export function mustClear(s: GameState, side: Side): boolean {
  return !!s.config.goalieMustClear && s.ball?.side === side && s.ball.pos.area === 'goal';
}

/** Whether your goalie can clear the ball: it can act, and one of your defenders is there to pass to. */
export function canClear(s: GameState, side: Side): boolean {
  if (justCameOn(s, side, { area: 'goal' })) return false;
  return Array.from({ length: s.config.lanes }, (_, lane) => lane).some((lane) => !!slotAt(s, side, { area: 'defense', lane }));
}

/** A pass, or a spell that makes one (long_pass, decoy_pass). */
function isClear(action: Action): boolean {
  return action.type === 'pass' || (action.type === 'cast' && (action.target.kind === 'pass' || action.target.kind === 'decoyPass'));
}

const MUST_CLEAR = 'Your goalie has the ball and must clear it: pass to one of your defenders.';
const GOALIE_CLEARING = "Your goalie has the ball and must clear it this turn, so it can't come off now.";

const NEEDS_REST = 'That player has cast as many spells as they have Resonants. Substitute them out to recharge.';
const JUST_CAME_ON = "That player just came on, so they can't act until your next turn.";
const SHAKEN = "That player is Shaken, so they can't pass, shoot, tackle, or cast until they stand up.";
const DIRTY_PLAYS_FIRST = 'A dirty play is a foul: declare it before the dice, not after.';
const IN_THE_BOX = "That player is in the penalty box: nobody can come on in their spot until the penalty is over.";

/**
 * Whether a physical attack is allowed (v0.17): your standing field player (not holding the
 * ball) attacks the opposing player in their spot, or in an adjacent lane of that row with Hooking.
 */
function canAttack(s: GameState, side: Side, card: string, attacker: FieldPos, target: FieldPos): string | null {
  if (!s.config.physicalAttacks) return 'There are no physical attacks in this game.';
  if (!inHand(s, side, card) || defOf(s, card).kind !== 'physical') return 'Attack with a physical card from your hand.';
  const def = defOf(s, card) as PhysicalCardDef;
  if (!validField(s, attacker) || !slotAt(s, side, attacker)) return 'Choose one of your field players to attack.';
  const busy = cantAct(s, side, attacker);
  if (busy) return busy;
  if (!s.config.attackWithBall && s.ball?.side === side && samePos(s.ball.pos, attacker)) return "A player holding the ball can't attack.";
  if (!validField(s, target)) return 'Attack an opposing field player.';
  const facing = opposite(attacker);
  const reach = def.ability?.effect === 'reach' && target.area === facing.area && Math.abs(target.lane - facing.lane) === 1;
  if (!samePos(target, facing) && !reach) return def.ability?.effect === 'reach'
    ? 'Attack the opposing player in your spot, or one lane over in that row.'
    : 'Attack the opposing player in your spot.';
  if (!slotAt(s, otherSide(side), target)) return 'There is nobody there to attack.';
  if (def.ability?.effect === 'needs_holder' && !(s.ball?.side === otherSide(side) && samePos(s.ball.pos, target))) return `${def.name} only works against the ball carrier.`;
  if (def.ability?.effect === 'needs_shaken' && !isShaken(s, otherSide(side), target)) return `${def.name} only works against a Shaken player.`;
  return null;
}

/** Why the player in a spot can't pass, shoot, tackle, or cast right now, or null if they can. */
function cantAct(s: GameState, side: Side, pos: Pos): string | null {
  if (justCameOn(s, side, pos)) return JUST_CAME_ON;
  if (isShaken(s, side, pos)) return SHAKEN;
  return null;
}

/** Whether a card (on the field or in hand) is one of your injured players. */
function isInjured(s: GameState, uid: string | undefined): boolean {
  return !!uid && !!s.injuries[uid];
}

export function validateAction(s: GameState, action: Action): string | null {
  const p = s.pending;
  if (p.kind === 'gameOver') return 'The game is over.';
  if (action.side !== p.side) return "It isn't your decision right now.";
  const side = action.side;
  const team = s.teams[side];

  switch (action.type) {
    case 'draftPick': {
      if (p.kind !== 'draftPick' || !s.draft) return "It isn't time to draft.";
      if (!s.draft.pool.includes(action.card)) return 'Pick a player from the pool.';
      const kind = defOf(s, action.card).kind;
      const mine = s.draft.picks[side].filter((uid) => defOf(s, uid).kind === kind).length;
      if (kind === 'goalie' && mine >= s.config.deckGoalies) return `You already have ${s.config.deckGoalies} goalies, the most a team can have.`;
      if (kind === 'field' && mine >= s.config.deckFieldPlayers) return 'You already have all the field players a team can have.';
      return null;
    }

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
      if (!faceoffLaneOk(s, action.lane)) return 'Both midfielders in that lane are missing.';
      return null;
    }

    case 'callDice': {
      if (p.kind !== 'callDice') return 'There is no contest waiting for dice.';
      if (action.roll && s.diceLeft[side] <= 0) return s.config.diceTokens === 'reroll' ? 'You have no rerolls left.' : 'You have no rolls left.';
      return null;
    }

    case 'physicalReaction': {
      if (p.kind !== 'physicalReaction') return "It isn't time for a physical reaction.";
      if (action.card === null) return null;
      if (!inHand(s, side, action.card)) return 'Play a physical card from your hand.';
      const def = defOf(s, action.card);
      if (def.kind !== 'physical' || def.ability?.effect !== p.trigger) return "That card can't be played now.";
      return null;
    }

    case 'foul': {
      if (p.kind !== 'foul') return "It isn't time to declare a foul.";
      if (action.card === null) return null;
      if (!inHand(s, side, action.card) || !isFoulSpell(defOf(s, action.card))) return 'Declare a foul with a dirty play from your hand.';
      if (castsLeft(s, side, p.contest[p.role].pos) <= 0) return NEEDS_REST;
      return cantAct(s, side, p.contest[p.role].pos);
    }

    case 'react': {
      if (p.kind !== 'reaction') return 'There is no contest to react to.';
      if (action.card === null) return null;
      if (!inHand(s, side, action.card) || !isReactionSpell(defOf(s, action.card))) return 'Play a reaction spell from your hand.';
      if (s.config.foulTiming === 'before' && isFoulSpell(defOf(s, action.card))) return DIRTY_PLAYS_FIRST;
      if (!reactionFits(defOf(s, action.card) as SpellCardDef, p.contest[p.role])) return `${defOf(s, action.card).name} doesn't work in this contest.`;
      if (castsLeft(s, side, p.contest[p.role].pos) <= 0) return NEEDS_REST;
      return cantAct(s, side, p.contest[p.role].pos);
    }

    case 'shootoutPick': {
      if (p.kind !== 'shootoutPick') return "It isn't time for a penalty.";
      if (!validField(s, action.pos)) return 'Choose one of your field players.';
      const slot = slotAt(s, side, action.pos);
      if (!slot) return 'Choose one of your field players.';
      if (s.shootout?.shooters.includes(slot.uid)) return 'Each player can only take one penalty.';
      return null;
    }

    case 'forcedSub': {
      if (p.kind !== 'forcedSub') return 'There is no injured player to replace.';
      if (!inHand(s, side, action.card)) return 'Choose a player from your hand.';
      const kind = defOf(s, action.card).kind;
      if (p.pos.area === 'goal' ? kind !== 'goalie' : kind !== 'field') return 'Replace a goalie with a goalie, or a field player with a field player.';
      return null;
    }

    case 'substitute': {
      // Since v0.11 you substitute at the Draw step, instead of drawing. (Old online matches: as an action.)
      if (s.config.substituteStep === 'draw') {
        if (p.kind !== 'draw') return 'You can only substitute at the start of your turn, instead of drawing.';
      } else if (p.kind !== 'action') return "It isn't time to take an action.";
      // The spot may hold a player to replace, or be empty after a player was carried off.
      if (!validPos(s, action.pos)) return 'Choose one of your players to replace.';
      if (!inHand(s, side, action.card)) return 'Choose a card from your hand.';
      const kind = defOf(s, action.card).kind;
      if (action.pos.area === 'goal' ? kind !== 'goalie' : kind !== 'field') {
        return 'Replace a goalie with a goalie, or a field player with a field player.';
      }
      if (action.pos.area === 'goal' && mustClear(s, side)) return GOALIE_CLEARING;
      if (s.config.penaltyNoSubstitution && inPenaltyBox(s, side, action.pos)) return IN_THE_BOX;
      return null;
    }

    case 'draw': {
      if (p.kind !== 'draw') return "It isn't the draw step.";
      if (s.teams[side][action.pile].length === 0) return 'That pile is empty.';
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
  if (mustClear(s, side) && !isClear(action)) return MUST_CLEAR;

  switch (action.type) {
    case 'pass':
      return canPass(s, side, action.to, false);

    case 'shoot':
      return canShoot(s, side, 'forward');

    case 'tackle':
      return canTackle(s, side);

    case 'attack': {
      const def = defOf(s, action.card);
      if (def.kind === 'physical' && def.ability && PHYSICAL_REACTIONS.has(def.ability.effect)) {
        return `${def.name} is a reaction: ${def.when ?? 'play it when it says'}`;
      }
      return canAttack(s, side, action.card, action.attacker, action.target);
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
      if (castsLeft(s, side, action.caster) <= 0) return NEEDS_REST;
      const caster = cantAct(s, side, action.caster);
      if (caster) return caster;
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
        case 'decoy_pass': {
          if (target.kind !== 'decoyPass') return 'Choose who receives the pass.';
          const lane = target.decoyLane;
          if (!Number.isInteger(lane) || lane < 0 || lane >= s.config.lanes || lane === target.to?.lane) {
            return 'The opponent has to think the ball went to another lane of that row.';
          }
          return canPass(s, side, target.to, false);
        }
        case 'mirror_images': {
          if (target.kind !== 'none') return 'Mirror images have no target.';
          // Goalies can't be tackled or hit, so images would do nothing there.
          if (!isFieldPos(action.caster)) return 'A goalie has no use for images.';
          if (slotAt(s, side, action.caster)!.images) return 'That player already has images.';
          return null;
        }
        case 'long_shot':
          if (target.kind !== 'none') return 'A long shot has no target.';
          return canShoot(s, side, 'midfield');
        case 'steal':
          if (target.kind !== 'none') return 'Steal has no target.';
          return canTackle(s, side);
        case 'recall':
          if (target.kind !== 'none') return 'Recall has no target.';
          return null;
        case 'hit': {
          if (target.kind !== 'hit') return 'Choose who to hit.';
          if (!isFieldPos(action.caster)) return "A goalie can't cast a hit.";
          if (!slotAt(s, otherSide(side), opposite(action.caster))) return 'There is nobody in that spot to hit.';
          return null;
        }
        case 'mend': {
          if (target.kind === 'mendField') {
            if (!validPos(s, target.pos) || !isInjured(s, slotAt(s, side, target.pos)?.uid)) return 'Choose one of your injured players.';
            return null;
          }
          if (target.kind === 'mendHand') {
            if (!inHand(s, side, target.card) || !isInjured(s, target.card)) return 'Choose one of your injured players.';
            return null;
          }
          return 'Choose one of your injured players.';
        }
      }
      return null;
    }
  }
}

