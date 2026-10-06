// Everything a player can do. Each action names the side taking it, so the engine can check
// that it's that side's decision.

import type { FieldPos, Pos, Side } from './field';
import type { Uid } from './state';

export type SpellTarget =
  | { kind: 'none' }
  /** scry: one of the opponent's face-down cards. */
  | { kind: 'opponent'; pos: Pos }
  /** swap: two of your own face-down field players. */
  | { kind: 'swap'; a: FieldPos; b: FieldPos }
  /** long_pass: the receiver. */
  | { kind: 'pass'; to: FieldPos };

export type Action =
  // Setup
  | { type: 'chooseGoalie'; side: Side; card: Uid }
  | { type: 'place'; side: Side; card: Uid; pos: FieldPos }
  | { type: 'faceoffLane'; side: Side; lane: number }
  // Your turn
  | { type: 'pass'; side: Side; to: FieldPos }
  | { type: 'shoot'; side: Side }
  | { type: 'tackle'; side: Side }
  | { type: 'cast'; side: Side; card: Uid; caster: Pos; target: SpellTarget }
  | { type: 'substitute'; side: Side; pos: Pos; card: Uid }
  | { type: 'regroup'; side: Side; discard: Uid[] }
  // During a contest: play a reaction spell, or null for none
  | { type: 'react'; side: Side; card: Uid | null }
  // End of turn, one card at a time
  | { type: 'discard'; side: Side; card: Uid };
