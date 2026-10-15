// Small helpers for reading and changing the table. Functions that change things work on a
// draft copy of the state made by applyAction, never on the caller's state.

import { reactionFits, type CardDef, type PlayerCardDef, type SpellCardDef, type StatName } from './cards';
import type { InjuryDef } from './config';
import type { CardView, DrawReason, GameEvent } from './events';
import { type Pos, type Side } from './field';
import { shuffle } from './rng';
import type { ContestSide, GameState, Pile, Slot, TeamState, Uid } from './state';

export function cardView(s: GameState, uid: Uid): CardView {
  const injury = injuryOf(s, uid);
  return injury ? { uid, def: defOf(s, uid), injury } : { uid, def: defOf(s, uid) };
}

/** The injury attached to a player card, if any. */
export function injuryOf(s: GameState, uid: Uid): InjuryDef | null {
  const injuryCard = s.injuries[uid];
  return injuryCard ? s.injuryCards[injuryCard] ?? null : null;
}

/** Takes the injury off a player (if any) and shuffles it back into the injury deck. */
export function releaseInjury(s: GameState, uid: Uid): InjuryDef | null {
  const injuryCard = s.injuries[uid];
  if (!injuryCard) return null;
  delete s.injuries[uid];
  [s.injuryDeck, s.rng] = shuffle([...s.injuryDeck, injuryCard], s.rng);
  return s.injuryCards[injuryCard] ?? null;
}

export function defOf(s: GameState, uid: Uid): CardDef {
  const def = s.cards[uid];
  if (!def) throw new Error(`Unknown card ${uid}`);
  return def;
}

export function slotAt(s: GameState, side: Side, pos: Pos): Slot | null {
  const team = s.teams[side];
  if (pos.area === 'goal') return team.goalie;
  return team.lineup[pos.area][pos.lane] ?? null;
}

export function setSlotAt(s: GameState, side: Side, pos: Pos, slot: Slot | null): void {
  const team = s.teams[side];
  if (pos.area === 'goal') team.goalie = slot;
  else team.lineup[pos.area][pos.lane] = slot;
}

/** The player card at a position. Throws if the spot is empty. */
export function playerAt(s: GameState, side: Side, pos: Pos): PlayerCardDef {
  const slot = slotAt(s, side, pos);
  if (!slot) throw new Error(`No player at ${side} ${pos.area}`);
  return defOf(s, slot.uid) as PlayerCardDef;
}

/**
 * How many more spells the player at a spot can cast before they have to be substituted out to
 * recharge (RULES.md "Casting limit"). 0 for an empty spot; Infinity when there is no limit.
 */
export function castsLeft(s: GameState, side: Side, pos: Pos): number {
  const slot = slotAt(s, side, pos);
  return slot ? castsLeftIn(s, slot) : 0;
}

/** castsLeft() for a player already looked up. */
export function castsLeftIn(s: GameState, slot: Slot): number {
  const perResonant = s.config.castsPerResonant;
  if (perResonant <= 0) return Infinity;
  const player = defOf(s, slot.uid) as PlayerCardDef;
  return Math.max(0, player.resonants.length * perResonant - (slot.casts ?? 0));
}

/** Counts a spell cast by the player at a spot. */
export function countCast(s: GameState, side: Side, pos: Pos): void {
  const slot = slotAt(s, side, pos);
  if (slot) slot.casts = (slot.casts ?? 0) + 1;
}

/**
 * Puts a card on its owner's discard pile. An injured player's injury goes back to the injury deck.
 * A physical card goes to the Physical discard pile instead (v0.17).
 */
export function toDiscard(s: GameState, side: Side, uid: Uid): void {
  releaseInjury(s, uid);
  if (defOf(s, uid).kind === 'physical') s.teams[side].physicalDiscard.push(uid);
  else s.teams[side].discard.push(uid);
}

export function statOf(def: PlayerCardDef, stat: StatName): number {
  if (def.kind === 'goalie') return stat === 'save' ? def.save : 0;
  return stat === 'save' ? 0 : def[stat];
}

export function isActionSpell(def: CardDef): def is SpellCardDef & { spellType: 'action' } {
  return def.kind === 'spell' && def.spellType === 'action';
}

export function isReactionSpell(def: CardDef): def is SpellCardDef & { spellType: 'reaction' } {
  return def.kind === 'spell' && def.spellType === 'reaction';
}

/** A dirty play: since v0.17 it's declared as a foul before the dice, not played as a reaction. */
export function isFoulSpell(def: CardDef): boolean {
  return isReactionSpell(def) && def.ability.effect === 'dirty_play';
}

/**
 * Whether this side holds a reaction spell it could play in this side of a contest. `foul`: a dirty
 * play to declare before the dice (v0.17); otherwise any other reaction spell, after the dice.
 * (With the old rule, dirty plays are ordinary reaction spells.)
 */
export function hasReactionSpell(s: GameState, side: Side, contestSide: ContestSide, foul = false): boolean {
  const foulsFirst = s.config.foulTiming === 'before';
  return s.teams[side].hand.some((uid) => {
    const def = defOf(s, uid);
    if (!isReactionSpell(def) || !reactionFits(def, contestSide)) return false;
    return foul ? isFoulSpell(def) : !(foulsFirst && isFoulSpell(def));
  });
}

function removeFromHand(team: TeamState, uid: Uid): void {
  const index = team.hand.indexOf(uid);
  if (index < 0) throw new Error(`Card ${uid} is not in hand`);
  team.hand.splice(index, 1);
}

/** Takes a card from hand and puts it on the discard pile (no event). */
export function moveHandToDiscard(s: GameState, side: Side, uid: Uid): void {
  removeFromHand(s.teams[side], uid);
  toDiscard(s, side, uid);
}

export function takeFromHand(s: GameState, side: Side, uid: Uid): void {
  removeFromHand(s.teams[side], uid);
}

/** Discards cards from hand with a public event. */
export function discardFromHand(s: GameState, side: Side, uids: Uid[], ev: GameEvent[]): void {
  if (uids.length === 0) return;
  for (const uid of uids) moveHandToDiscard(s, side, uid);
  ev.push({ type: 'discarded', side, cards: uids.map((uid) => cardView(s, uid)) });
}

/** Cards left in both draw piles. */
export function cardsLeft(team: TeamState): number {
  return team.players.length + team.spells.length;
}

/** Is this hand at (or over) the hand limit? Then the Draw step doesn't add a card. */
export function handIsFull(s: GameState, side: Side): boolean {
  return s.teams[side].hand.length >= s.config.handLimit;
}

/** Whether a card is a player card (a field player or a goalie). */
export function isPlayerCard(def: CardDef): def is PlayerCardDef {
  return def.kind === 'field' || def.kind === 'goalie';
}

/** Whether the side holds a player who could substitute: any field player, or a goalie. */
export function canSubstitute(s: GameState, side: Side): boolean {
  return s.teams[side].hand.some((uid) => isPlayerCard(defOf(s, uid)));
}

/** The player at a spot came on at this turn's Draw step, so can't act yet (RULES.md "Turn sequence"). */
export function justCameOn(s: GameState, side: Side, pos: Pos): boolean {
  return !!slotAt(s, side, pos)?.cameOn;
}

/**
 * The Draw step with a full hand: instead of drawing, the top card of `pile` goes face up on
 * the discard pile, so the game clock still runs (RULES.md "Turn sequence").
 */
export function discardTopOfPile(s: GameState, side: Side, pile: Pile, ev: GameEvent[]): void {
  const uid = s.teams[side][pile].pop();
  if (!uid) return;
  toDiscard(s, side, uid);
  ev.push({ type: 'discarded', side, cards: [cardView(s, uid)], fromPile: pile });
}

/** The pile a card belongs in. */
export function pileFor(def: CardDef): Pile {
  return def.kind === 'spell' ? 'spells' : def.kind === 'physical' ? 'physical' : 'players';
}

/**
 * Draws up to `count` cards from `pile`, switching to the other pile once that one is empty.
 * Draws by spells and abilities use the Spells pile. If both piles run out, draws what's left:
 * only the Draw step at the start of a turn can end the game (RULES.md "End of the game").
 */
export function drawCards(s: GameState, side: Side, count: number, reason: DrawReason, ev: GameEvent[], pile: Pile = 'spells'): number {
  if (pile === 'physical') return drawPhysical(s, side, count, reason, ev);
  const team = s.teams[side];
  const other: Pile = pile === 'players' ? 'spells' : 'players';
  const drawn: Uid[] = [];
  for (let i = 0; i < count; i++) {
    const from = team[pile].length > 0 ? team[pile] : team[other];
    if (from.length === 0) break;
    drawn.push(from.pop()!);
  }
  team.hand.push(...drawn);
  if (drawn.length > 0) {
    ev.push({ type: 'drew', side, count: drawn.length, reason, pile, secret: { cards: drawn.map((uid) => cardView(s, uid)) } });
  }
  return drawn.length;
}

/**
 * Draws from the Physical pile (v0.17). When it runs out, its discards are shuffled into a new
 * pile. It never switches to another pile, and it isn't part of the game clock.
 */
function drawPhysical(s: GameState, side: Side, count: number, reason: DrawReason, ev: GameEvent[]): number {
  const team = s.teams[side];
  const drawn: Uid[] = [];
  for (let i = 0; i < count; i++) {
    if (team.physical.length === 0 && team.physicalDiscard.length > 0) {
      [team.physical, s.rng] = shuffle(team.physicalDiscard, s.rng);
      team.physicalDiscard = [];
    }
    const uid = team.physical.pop();
    if (!uid) break;
    drawn.push(uid);
  }
  team.hand.push(...drawn);
  if (drawn.length > 0) {
    ev.push({ type: 'drew', side, count: drawn.length, reason, pile: 'physical', secret: { cards: drawn.map((uid) => cardView(s, uid)) } });
  }
  return drawn.length;
}

/** Turns a player face up, with an event if they were face down. */
export function reveal(s: GameState, side: Side, pos: Pos, ev: GameEvent[]): void {
  const slot = slotAt(s, side, pos);
  if (!slot || slot.revealed) return;
  slot.revealed = true;
  ev.push({ type: 'revealed', side, pos, card: cardView(s, slot.uid) });
}

/** Every position where a side has a player (goal first). */
export function playerPositions(s: GameState): Pos[] {
  const result: Pos[] = [{ area: 'goal' }];
  for (const area of ['defense', 'midfield', 'forward'] as const) {
    for (let lane = 0; lane < s.config.lanes; lane++) result.push({ area, lane });
  }
  return result;
}
