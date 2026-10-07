// Small helpers for reading and changing the table. Functions that change things work on a
// draft copy of the state made by applyAction, never on the caller's state.

import type { CardDef, PlayerCardDef, SpellCardDef, StatName } from './cards';
import type { InjuryDef } from './config';
import type { CardView, DrawReason, GameEvent } from './events';
import { type Pos, type Side } from './field';
import { shuffle } from './rng';
import type { GameState, Slot, TeamState, Uid } from './state';

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

/** Puts a card on its owner's discard pile. An injured player's injury goes back to the injury deck. */
export function toDiscard(s: GameState, side: Side, uid: Uid): void {
  releaseInjury(s, uid);
  s.teams[side].discard.push(uid);
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

export function hasReactionSpell(s: GameState, side: Side): boolean {
  return s.teams[side].hand.some((uid) => isReactionSpell(defOf(s, uid)));
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

/**
 * Draws up to `count` cards. If the deck runs short, draws what's left: only the Draw step at
 * the start of a turn can end the game (RULES.md "End of the game").
 */
export function drawCards(s: GameState, side: Side, count: number, reason: DrawReason, ev: GameEvent[]): number {
  const team = s.teams[side];
  const drawn: Uid[] = [];
  for (let i = 0; i < count && team.deck.length > 0; i++) drawn.push(team.deck.pop()!);
  team.hand.push(...drawn);
  if (drawn.length > 0) {
    ev.push({ type: 'drew', side, count: drawn.length, reason, secret: { cards: drawn.map((uid) => cardView(s, uid)) } });
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
