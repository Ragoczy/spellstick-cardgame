// Injuries (RULES.md "Injuries"): hits and dirty plays injure players. An injured player
// draws an injury card and, if their owner can, is replaced at once by a substitute from hand.
// A player injured a second time is carried off.

import { cardView, defOf, injuryOf, releaseInjury, setSlotAt, slotAt, takeFromHand, toDiscard } from './board';
import type { InjuryDef, InjuryStat } from './config';
import type { GameEvent, InjurySource } from './events';
import { isFieldPos, opposite, otherSide, samePos, type Pos, type Side } from './field';
import type { PlayerCardDef, StatName } from './cards';
import type { GameState, Uid } from './state';

/** How much an injury lowers a stat. (Goalies can't be injured, so Save is never lowered.) */
export function injuryPenalty(injury: InjuryDef | null | undefined, player: PlayerCardDef, stat: StatName): number {
  if (!injury || player.kind === 'goalie' || stat === 'save') return 0;
  return injury.penalty[stat as InjuryStat] ?? 0;
}

/** Cards in hand that could replace the player at `pos` (field player for field, goalie for goal). */
export function substitutesInHand(s: GameState, side: Side, pos: Pos): Uid[] {
  const kind = pos.area === 'goal' ? 'goalie' : 'field';
  return s.teams[side].hand.filter((uid) => defOf(s, uid).kind === kind);
}

/** Injures the player at a position (if there is one). */
export function injurePlayer(s: GameState, side: Side, pos: Pos, source: InjurySource, cause: string, ev: GameEvent[]): void {
  const slot = slotAt(s, side, pos);
  if (!slot) return;
  const uid = slot.uid;

  // Hitting the goalie isn't allowed, so a dirty play against a goalie does nothing.
  if (pos.area === 'goal') return;

  if (s.injuries[uid]) {
    // Already injured: carried off and discarded. Their injury goes back to the injury deck.
    const card = cardView(s, uid);
    setSlotAt(s, side, pos, null);
    toDiscard(s, side, uid);
    ev.push({ type: 'injured', side, pos, card, injury: null, source, cause, carriedOff: true });
    if (substitutesInHand(s, side, pos).length) {
      s.forcedSub = { side, pos, injured: null };
    } else {
      if (s.forcedSub && s.forcedSub.side === side && samePos(s.forcedSub.pos, pos)) s.forcedSub = null;
      ev.push({ type: 'slotEmptied', side, pos });
      dropBall(s, side, pos, ev);
    }
    return;
  }

  // Draw an injury card (if there are any left) and attach it.
  const injuryCard = s.injuryDeck.pop();
  if (injuryCard) s.injuries[uid] = injuryCard;
  ev.push({ type: 'injured', side, pos, card: cardView(s, uid), injury: injuryOf(s, uid), source, cause, carriedOff: false });

  // If the owner can, they must bring on a substitute straight away.
  if (substitutesInHand(s, side, pos).length) s.forcedSub = { side, pos, injured: uid };
}

/** The owner brings on a substitute after an injury. The injured player (if still there) goes to hand. */
export function completeForcedSub(s: GameState, card: Uid, ev: GameEvent[]): void {
  const pending = s.forcedSub!;
  const { side, pos } = pending;
  takeFromHand(s, side, card);
  const injured = pending.injured ? slotAt(s, side, pos) : null;
  if (injured) s.teams[side].hand.push(injured.uid);
  // The substitute comes in face down. If the injured player held the ball, the substitute does.
  setSlotAt(s, side, pos, { uid: card, revealed: false, scried: false });
  s.forcedSub = null;
  ev.push({ type: 'forcedSub', side, pos, toHand: injured ? cardView(s, injured.uid) : null });
}

/** Mend: removes a player's injury and shuffles it back into the injury deck. */
export function mend(s: GameState, side: Side, uid: Uid, ev: GameEvent[]): void {
  const injury = releaseInjury(s, uid);
  if (injury) ev.push({ type: 'mended', side, card: cardView(s, uid), injury });
}

/**
 * A carried-off ball carrier with nobody to replace them: the opposing player in that spot picks
 * up the ball. If there is none (a goalie, or an empty spot), it goes to a faceoff, and the team
 * that lost the player chooses the lane.
 */
function dropBall(s: GameState, side: Side, pos: Pos, ev: GameEvent[]): void {
  if (!s.ball || s.ball.side !== side || !samePos(s.ball.pos, pos)) return;
  s.ballProtected = false;
  if (isFieldPos(pos) && slotAt(s, otherSide(side), opposite(pos))) {
    s.ball = { side: otherSide(side), pos: opposite(pos) };
    ev.push({ type: 'ballMoved', side: otherSide(side), pos: opposite(pos) });
    return;
  }
  s.ball = null;
  s.faceoffChooser = side;
}

