// Events describe what happened, in order, so the UI can animate it and explain it in plain
// language. Anything only one player may know goes in `secret`; eventsFor() strips it from
// the other player's copy.

import type { CardDef, StatName } from './cards';
import type { InjuryDef } from './config';
import type { FieldPos, Pos, Side } from './field';
import type { Affinity, ContestKind, ContestRole, GameResult, Uid } from './state';

/** A card as a player sees it. Injury cards are face up, so an injury is shown with its player. */
export interface CardView {
  uid: Uid;
  def: CardDef;
  injury?: InjuryDef;
}

export interface BreakdownPart {
  label: string;
  amount: number;
}

/** How one side's contest value was worked out, e.g. Speed 4 + Boost 3 = 7. */
export interface Breakdown {
  side: Side;
  pos: Pos;
  /** null if the spot is empty (a player was carried off). */
  card: CardView | null;
  stat: StatName;
  /** Shown instead of the stat name when the value isn't a stat (a hit's strength). */
  baseLabel?: string;
  /** The printed stat, or 0 if shielded. */
  base: number;
  /** Abilities, spells, and modifiers added to the base. */
  parts: BreakdownPart[];
  total: number;
  shielded: boolean;
  /** The value from the printed card alone (stat, ability, injury), before spells and dice. */
  printed: number;
}

export type DrawReason = 'setup' | 'turn' | 'recall' | 'ability' | 'regroup';
export type InjurySource = 'hit' | 'dirty_play';

export type GameEvent =
  | { type: 'gameStarted'; firstSide: Side }
  | { type: 'goalieChosen'; side: Side; secret?: { card: CardView } }
  | { type: 'drew'; side: Side; count: number; reason: DrawReason; secret?: { cards: CardView[] } }
  | { type: 'placed'; side: Side; pos: FieldPos; secret?: { card: CardView } }
  | { type: 'faceoffStarted'; chooser: Side; lane: number }
  | { type: 'turnStarted'; side: Side; turn: number }
  | { type: 'deckOut'; side: Side; finalTurnFor: Side }
  | { type: 'revealed'; side: Side; pos: Pos; card: CardView }
  | {
      type: 'contestStarted';
      kind: ContestKind;
      attacker: { side: Side; pos: Pos; roll?: number };
      defender: { side: Side; pos: Pos; roll?: number };
    }
  | {
      type: 'spellCast';
      side: Side;
      card: CardView;
      caster: Pos;
      affinity: Affinity;
      /** True if an opposed non-numeric spell had no effect. */
      fizzled: boolean;
    }
  | { type: 'contestResolved'; kind: ContestKind; attacker: Breakdown; defender: Breakdown; winner: Side; winnerRole: ContestRole }
  | { type: 'ballMoved'; side: Side; pos: Pos }
  | { type: 'goal'; side: Side; score: Record<Side, number> }
  | { type: 'substituted'; side: Side; pos: Pos; removed: CardView }
  | { type: 'swapped'; side: Side; a: FieldPos; b: FieldPos }
  | { type: 'scried'; side: Side; target: Pos; secret?: { card: CardView } }
  | { type: 'discarded'; side: Side; cards: CardView[] }
  | { type: 'shootoutStarted'; first: Side }
  /** A player called for dice: both players rolled (only the caller spent a roll). */
  | { type: 'diceRolled'; caller: Side; attacker: Side; attackerRoll?: number; defenderRoll?: number; left: Record<Side, number> }
  | {
      type: 'injured';
      side: Side;
      pos: Pos;
      card: CardView;
      /** The injury card drawn, or null if the injury deck was empty or the player was carried off. */
      injury: InjuryDef | null;
      source: InjurySource;
      /** The spell that did it, e.g. "Flambé" or "Late Hit". */
      cause: string;
      /** Already injured, so carried off and discarded. */
      carriedOff: boolean;
    }
  /** A forced substitution: a new player comes on face down. `toHand` is the injured player going to hand. */
  | { type: 'forcedSub'; side: Side; pos: Pos; toHand: CardView | null }
  /** Nobody could replace a carried-off player: the spot is empty. */
  | { type: 'slotEmptied'; side: Side; pos: Pos }
  | { type: 'mended'; side: Side; card: CardView; injury: InjuryDef }
  | { type: 'penalty'; side: Side; scored: boolean; goals: Record<Side, number>; taken: Record<Side, number> }
  | { type: 'gameOver'; result: GameResult };
