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
import { isFieldPos, opposite, otherSide, samePos, SIDES, type FieldPos, type Pos, type Side } from './field';
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
/** Changes to the contact rolls, from a physical attack card (v0.17). */
export interface HurtOptions {
  /** What hurt them (default: a tackle, for a knockdown). */
  source?: InjurySource;
  /** Added to the Toughness the roll must beat (negative makes them easier to hurt). */
  toughness?: number;
  /** Added to the severity roll. */
  severity?: number;
  /** Passing the Toughness roll still leaves them Shaken (Gouge). */
  shakenAnyway?: boolean;
  /** A Shaken result counts as Injured (Kneecap). */
  shakenIsInjured?: boolean;
  /** Ward (v0.17): if hurt, they're only Shaken (no severity roll). */
  onlyShaken?: boolean;
}

/**
 * The severity modifier from players' abilities (v0.17): Heavy hands on the player doing the
 * hurting, and Sturdy on the player being hurt.
 */
export function abilitySeverity(s: GameState, hurter: { side: Side; pos: Pos } | null, victim: { side: Side; pos: Pos }): number {
  const abilityAt = (side: Side, pos: Pos) => {
    const slot = slotAt(s, side, pos);
    return slot ? (defOf(s, slot.uid) as PlayerCardDef).ability : undefined;
  };
  const heavy = hurter ? abilityAt(hurter.side, hurter.pos) : undefined;
  const sturdy = abilityAt(victim.side, victim.pos);
  return (heavy?.effect === 'hits_harder' ? heavy.params.amount : 0) - (sturdy?.effect === 'hard_to_hurt' ? sturdy.params.amount : 0);
}

/** How a hurt turned out, or null if the player wasn't hurt. */
export type HurtResult = Severity | 'carriedOff' | null;

/**
 * A successful tackle (or physical attack) knocks the player down: they roll against their
 * Toughness, fine at or below it, hurt above it.
 */
export function knockDown(s: GameState, side: Side, pos: Pos, cause: string, ev: GameEvent[], options: HurtOptions = {}): HurtResult {
  const slot = slotAt(s, side, pos);
  if (!slot || pos.area === 'goal') return null;
  const toughness = (defOf(s, slot.uid) as FieldCardDef).toughness + (options.toughness ?? 0);
  const roll = contactRoll(s);
  const hurt = roll > toughness;
  ev.push({ type: 'knockedDown', side, pos, card: cardView(s, slot.uid), toughness, roll, hurt });
  const source = options.source ?? 'tackle';
  if (hurt) return hurtPlayer(s, side, pos, source, cause, ev, options);
  if (options.shakenAnyway) return shake(s, side, pos, source, cause, ev);
  return null;
}

/**
 * Hurts the player in a spot. Since v0.17 they roll for severity: Shaken, Injured, or Knocked out.
 * Before v0.17 every hurt was an injury. Goalies are never hurt.
 */
export function hurtPlayer(s: GameState, side: Side, pos: Pos, source: InjurySource, cause: string, ev: GameEvent[], options: HurtOptions = {}): HurtResult {
  const slot = slotAt(s, side, pos);
  if (!s.config.knockdowns) {
    const already = !!slot && !!s.injuries[slot.uid];
    injurePlayer(s, side, pos, source, cause, ev);
    return slot && pos.area !== 'goal' ? (already ? 'carriedOff' : 'injured') : null;
  }
  if (!slot || pos.area === 'goal') return null;
  if (options.onlyShaken) return shake(s, side, pos, source, cause, ev);
  const roll = contactRoll(s) + (options.severity ?? 0);
  const { shaken, injured } = s.config.severity;
  let result: Severity = roll <= shaken ? 'shaken' : roll <= injured ? 'injured' : 'knockedOut';
  if (result === 'shaken' && options.shakenIsInjured) result = 'injured';
  const hurt = { type: 'hurt', side, pos, card: cardView(s, slot.uid), source, cause, roll, result } as const;
  if (result === 'shaken') {
    // Shaken again while Shaken: the count starts over. They keep the ball if they have it.
    slot.shakenUntil = shakenUntil(s, side);
    ev.push({ ...hurt, until: slot.shakenUntil });
    return 'shaken';
  }
  ev.push(hurt);
  if (result === 'injured') {
    const already = !!s.injuries[slot.uid];
    injurePlayer(s, side, pos, source, cause, ev);
    return already ? 'carriedOff' : 'injured';
  }
  knockOut(s, side, pos, ev);
  return 'knockedOut';
}

/** Makes a player Shaken with no severity roll (Atomic Wedgie, and Gouge after a passed Toughness roll). */
export function shake(s: GameState, side: Side, pos: Pos, source: InjurySource, cause: string, ev: GameEvent[]): HurtResult {
  const slot = slotAt(s, side, pos);
  if (!slot || pos.area === 'goal') return null;
  slot.shakenUntil = shakenUntil(s, side);
  ev.push({ type: 'hurt', side, pos, card: cardView(s, slot.uid), source, cause, result: 'shaken', until: slot.shakenUntil });
  return 'shaken';
}

// ---- The penalty box (v0.17) ----

/** The penalty die: rolled when an attacker's final die is a 1. Another 1 and the referee calls a penalty. */
export function penaltyRoll(s: GameState): number {
  return contactRoll(s);
}

/**
 * A penalty: the player goes to the penalty box beside the mat, face up, for `turns` turns. Their
 * spot stays empty meanwhile. A ball they held goes to the opposing player in that spot.
 */
export function penalize(s: GameState, side: Side, pos: FieldPos, turns: number, ev: GameEvent[]): void {
  const slot = slotAt(s, side, pos);
  if (!slot) return;
  setSlotAt(s, side, pos, null);
  // An injured attacker (Spearing) goes to the box injured: nobody comes on in their spot.
  if (s.forcedSub && s.forcedSub.side === side && samePos(s.forcedSub.pos, pos)) s.forcedSub = null;
  s.teams[side].penaltyBox.push({ uid: slot.uid, pos, turnsLeft: turns, since: s.turn });
  ev.push({ type: 'penalized', side, pos, card: cardView(s, slot.uid), turns });
  dropBall(s, side, pos, ev);
}

/**
 * At the end of a team's turn, a turn comes off each of its penalties, except those given this
 * turn. A player whose penalty is over goes back to their spot (or to the hand, if someone is there).
 */
export function servePenalties(s: GameState, side: Side, ev: GameEvent[]): void {
  const team = s.teams[side];
  for (const entry of [...team.penaltyBox]) {
    if (entry.since >= s.turn) continue;
    entry.turnsLeft -= 1;
    if (entry.turnsLeft <= 0) endPenalty(s, side, entry.uid, ev);
  }
}

/** Every penalized player of a team comes back at once: after the other team scores (power play), or at full time. */
export function endAllPenalties(s: GameState, side: Side, ev: GameEvent[], powerPlay: boolean): void {
  const team = s.teams[side];
  if (team.penaltyBox.length === 0) return;
  const cards = team.penaltyBox.map((entry) => cardView(s, entry.uid));
  for (const entry of [...team.penaltyBox]) endPenalty(s, side, entry.uid, ev);
  if (powerPlay) ev.push({ type: 'powerPlayReturn', side, cards });
}

function endPenalty(s: GameState, side: Side, uid: string, ev: GameEvent[]): void {
  const team = s.teams[side];
  const entry = team.penaltyBox.find((e) => e.uid === uid)!;
  team.penaltyBox = team.penaltyBox.filter((e) => e.uid !== uid);
  if (slotAt(s, side, entry.pos)) {
    team.hand.push(uid);
  } else {
    setSlotAt(s, side, entry.pos, { uid, revealed: true, scried: false });
  }
  ev.push({ type: 'penaltyServed', side, pos: entry.pos, card: cardView(s, uid) });
}

/** Whether a field spot is held open for a player in the penalty box. */
export function inPenaltyBox(s: GameState, side: Side, pos: Pos): boolean {
  return s.teams[side].penaltyBox.some((e) => samePos(e.pos, pos));
}

/**
 * Sent off by the referee (v0.17): the player goes to the discard pile, out for the game. There's
 * no free replacement: the spot stays empty until a Substitute at a Draw step fills it. A ball
 * they held goes to the opposing player in that spot.
 */
export function sendOff(s: GameState, side: Side, pos: Pos, roll: number, ev: GameEvent[]): void {
  const slot = slotAt(s, side, pos);
  if (!slot) return;
  const card = cardView(s, slot.uid);
  setSlotAt(s, side, pos, null);
  toDiscard(s, side, slot.uid);
  ev.push({ type: 'sentOff', side, pos, card, roll });
  dropBall(s, side, pos, ev);
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

/** Mend (v0.17): brings one of your knocked-out players back to your hand, injury card and all. */
export function bringBack(s: GameState, side: Side, uid: Uid, ev: GameEvent[]): void {
  const team = s.teams[side];
  team.knockedOut = team.knockedOut.filter((u) => u !== uid);
  team.hand.push(uid);
  ev.push({ type: 'broughtBack', side, card: cardView(s, uid) });
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

