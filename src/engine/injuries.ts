// Hurting players (RULES.md "Contact" and "Injuries").
//
// Since v0.17: a successful tackle knocks the tackled player down, and they roll against their
// Toughness. Hurt players (from a knockdown, a hit, or a dirty play) roll for severity: Shaken,
// Injured, or Knocked out. Before v0.17 (config.knockdowns false), only hits and dirty plays
// hurt, and every hurt is an injury.
//
// An injured player draws an injury card and, if their owner can, is replaced at once by a
// substitute from hand. A player injured a second time is carried off.

import { cardView, defOf, injuryOf, releaseInjury, setSlotAt, slotAt, takeFromHand, toDiscard } from './board';
import type { InjuryDef, InjuryStat } from './config';
import type { GameEvent, InjurySource, Severity } from './events';
import { isFieldPos, opposite, otherSide, samePos, SIDES, type Pos, type Side } from './field';
import type { FieldCardDef, PlayerCardDef, StatName } from './cards';
import { randomInt } from './rng';
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
    afterLeaving(s, side, pos, ev);
    return;
  }

  // Draw an injury card (if there are any left) and attach it.
  const injuryCard = s.injuryDeck.pop();
  if (injuryCard) s.injuries[uid] = injuryCard;
  ev.push({ type: 'injured', side, pos, card: cardView(s, uid), injury: injuryOf(s, uid), source, cause, carriedOff: false });

  // If the owner can, they must bring on a substitute straight away.
  if (substitutesInHand(s, side, pos).length) s.forcedSub = { side, pos, injured: uid };
}

/**
 * A player has left the field (carried off or knocked out): their owner must bring on a substitute
 * if they can. If not, the spot is empty, and a ball they held goes to the opposing player there.
 */
function afterLeaving(s: GameState, side: Side, pos: Pos, ev: GameEvent[]): void {
  if (substitutesInHand(s, side, pos).length) {
    s.forcedSub = { side, pos, injured: null };
    return;
  }
  if (s.forcedSub && s.forcedSub.side === side && samePos(s.forcedSub.pos, pos)) s.forcedSub = null;
  ev.push({ type: 'slotEmptied', side, pos });
  dropBall(s, side, pos, ev);
}

// ---- Contact (v0.17) ----

/** One roll of the contact die (Toughness, severity, and return rolls). These are never rerolled. */
function contactRoll(s: GameState): number {
  let roll: number;
  [roll, s.rng] = randomInt(s.rng, s.config.contactDie);
  return roll + 1;
}

/**
 * The turn a player Shaken now stands up at the end of: their team's next turn. (A player hurt on
 * the other team's turn sits out the coming turn; one hurt on their own turn, the one after.)
 */
export function shakenUntil(s: GameState, owner: Side): number {
  if (s.turn === 0) return owner === s.firstSide ? 1 : 2;
  return s.activeSide === owner ? s.turn + 2 : s.turn + 1;
}

/** Whether the player in a spot is Shaken. */
export function isShaken(s: GameState, side: Side, pos: Pos): boolean {
  return slotAt(s, side, pos)?.shakenUntil !== undefined;
}

/**
 * A successful tackle knocks the tackled player down: they roll against their Toughness, fine at
 * or below it, hurt above it.
 */
export function knockDown(s: GameState, side: Side, pos: Pos, cause: string, ev: GameEvent[]): void {
  const slot = slotAt(s, side, pos);
  if (!slot || pos.area === 'goal') return;
  const toughness = (defOf(s, slot.uid) as FieldCardDef).toughness;
  const roll = contactRoll(s);
  const hurt = roll > toughness;
  ev.push({ type: 'knockedDown', side, pos, card: cardView(s, slot.uid), toughness, roll, hurt });
  if (hurt) hurtPlayer(s, side, pos, 'tackle', cause, ev);
}

/**
 * Hurts the player in a spot. Since v0.17 they roll for severity: Shaken, Injured, or Knocked out.
 * Before v0.17 every hurt was an injury. Goalies are never hurt.
 */
export function hurtPlayer(s: GameState, side: Side, pos: Pos, source: InjurySource, cause: string, ev: GameEvent[]): void {
  if (!s.config.knockdowns) {
    injurePlayer(s, side, pos, source, cause, ev);
    return;
  }
  const slot = slotAt(s, side, pos);
  if (!slot || pos.area === 'goal') return;
  const roll = contactRoll(s);
  const { shaken, injured } = s.config.severity;
  const result: Severity = roll <= shaken ? 'shaken' : roll <= injured ? 'injured' : 'knockedOut';
  const hurt = { type: 'hurt', side, pos, card: cardView(s, slot.uid), source, cause, roll, result } as const;
  if (result === 'shaken') {
    // Shaken again while Shaken: the count starts over. They keep the ball if they have it.
    slot.shakenUntil = shakenUntil(s, side);
    ev.push({ ...hurt, until: slot.shakenUntil });
    return;
  }
  ev.push(hurt);
  if (result === 'injured') injurePlayer(s, side, pos, source, cause, ev);
  else knockOut(s, side, pos, ev);
}

/** Knocked out: off the field, face up beside the mat, until a return roll at a faceoff. */
function knockOut(s: GameState, side: Side, pos: Pos, ev: GameEvent[]): void {
  const slot = slotAt(s, side, pos)!;
  setSlotAt(s, side, pos, null);
  s.teams[side].knockedOut.push(slot.uid);
  afterLeaving(s, side, pos, ev);
}

/** At a faceoff, before the lane is chosen, each knocked-out player rolls to go back to the hand. */
export function returnRolls(s: GameState, ev: GameEvent[]): void {
  for (const side of SIDES) {
    const team = s.teams[side];
    for (const uid of [...team.knockedOut]) {
      const roll = contactRoll(s);
      const returned = roll >= s.config.knockedOutReturn;
      if (returned) {
        team.knockedOut = team.knockedOut.filter((u) => u !== uid);
        team.hand.push(uid);
      }
      ev.push({ type: 'returnRoll', side, card: cardView(s, uid), roll, returned });
    }
  }
}

/**
 * Shaken players of this team stand up: those whose time is up (at the end of the team's turn),
 * or everyone (at full time).
 */
export function standUp(s: GameState, side: Side, ev: GameEvent[], everyone = false): void {
  const team = s.teams[side];
  const spots: Pos[] = [{ area: 'goal' }];
  for (const area of ['defense', 'midfield', 'forward'] as const) {
    team.lineup[area].forEach((_, lane) => spots.push({ area, lane }));
  }
  for (const pos of spots) {
    const slot = slotAt(s, side, pos);
    if (slot?.shakenUntil === undefined) continue;
    if (!everyone && slot.shakenUntil > s.turn) continue;
    delete slot.shakenUntil;
    ev.push({ type: 'stoodUp', side, pos, card: cardView(s, slot.uid) });
  }
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

