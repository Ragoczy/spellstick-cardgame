// Everything a player can do. Each action names the side taking it, so the engine can check
// that it's that side's decision.

import type { FieldPos, Pos, Side } from './field';
import type { Pile, Uid } from './state';

export type SpellTarget =
  | { kind: 'none' }
  /** scry: one of the opponent's face-down cards. */
  | { kind: 'opponent'; pos: Pos }
  /** swap: two of your own face-down field players. */
  | { kind: 'swap'; a: FieldPos; b: FieldPos }
  /** long_pass: the receiver. */
  | { kind: 'pass'; to: FieldPos }
  /** decoy_pass: the receiver, and the lane (in the receiver's row) the opponent thinks the ball went to. */
  | { kind: 'decoyPass'; to: FieldPos; decoyLane: number }
  /** hit: the opposing player in the caster's spot (goalies can't be hit). */
  | { kind: 'hit' }
  /** mend: one of your injured players on the field... */
  | { kind: 'mendField'; pos: Pos }
  /** ...or in your hand. */
  | { kind: 'mendHand'; card: Uid };

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
  // During a contest: call for dice (spend one of your rolls), or not
  | { type: 'callDice'; side: Side; roll: boolean }
  // End of turn, one card at a time
  | { type: 'discard'; side: Side; card: Uid }
  /** Draw step: draw one card from this pile. */
  | { type: 'draw'; side: Side; pile: Pile }
  // Penalty shootout: choose a field player who hasn't shot yet
  | { type: 'shootoutPick'; side: Side; pos: FieldPos }
  // A player was injured or carried off: bring on a substitute from your hand
  | { type: 'forcedSub'; side: Side; card: Uid };
