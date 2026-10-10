// One player's seat at the table: everything the game screen reads. A game against the
// computer (GameSession) and an online match (OnlineSeat) both provide it, so the same screen
// plays both.

import type { Action, PlayerView, Side } from '../engine';

export interface Seat {
  /** Your side. */
  readonly human: Side;
  readonly opponent: Side;
  /** Which team in the card set plays each side (for card colors). */
  readonly teams: Record<Side, string>;
  /** What you can see. */
  readonly view: PlayerView;
  /** Your legal actions (empty when it isn't your decision). */
  readonly legal: Action[];
  /** Whose decision the game is waiting for. */
  readonly waitingFor: 'human' | 'opponent' | 'over';
  /** A suggested move: what the computer would do, seeing only your view. */
  hint(): Action | null;
}
