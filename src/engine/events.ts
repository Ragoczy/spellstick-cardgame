// Events describe what happened, in order, so the UI can animate it and explain it in plain
// language. Anything only one player may know goes in `secret`; eventsFor() strips it from
// the other player's copy.

import type { CardDef, StatName } from './cards';
import type { FieldPos, Pos, Side } from './field';
import type { Affinity, ContestKind, ContestRole, GameResult, Uid } from './state';

/** A card as a player sees it. */
export interface CardView {
  uid: Uid;
  def: CardDef;
}

export interface BreakdownPart {
  label: string;
  amount: number;
}

/** How one side's contest value was worked out, e.g. Speed 4 + Boost 3 = 7. */
export interface Breakdown {
  side: Side;
  pos: Pos;
  card: CardView;
  stat: StatName;
  /** The printed stat, or 0 if shielded. */
  base: number;
  /** Abilities, spells, and modifiers added to the base. */
  parts: BreakdownPart[];
  total: number;
  shielded: boolean;
}

export type DrawReason = 'setup' | 'turn' | 'recall' | 'ability' | 'regroup';

export type GameEvent =
  | { type: 'gameStarted'; firstSide: Side }
  | { type: 'goalieChosen'; side: Side; secret?: { card: CardView } }
  | { type: 'drew'; side: Side; count: number; reason: DrawReason; secret?: { cards: CardView[] } }
  | { type: 'placed'; side: Side; pos: FieldPos; secret?: { card: CardView } }
  | { type: 'faceoffStarted'; chooser: Side; lane: number }
  | { type: 'turnStarted'; side: Side; turn: number }
  | { type: 'deckOut'; side: Side; finalTurnFor: Side }
  | { type: 'revealed'; side: Side; pos: Pos; card: CardView }
  | { type: 'contestStarted'; kind: ContestKind; attacker: { side: Side; pos: Pos }; defender: { side: Side; pos: Pos } }
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
  | { type: 'suddenDeath' }
  | { type: 'gameOver'; result: GameResult };
