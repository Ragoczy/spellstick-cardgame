// What the game server's match API sends, shared by the server (server/matches.ts) and the
// browser (src/ui/online.ts) so the two can't drift apart. Types only: no code.

import type { Action, GameEvent, PlayerView, Side } from '../engine';

export type MatchStatus = 'challenged' | 'active' | 'finished' | 'declined';

/** One match as a player sees it in their list. */
export interface MatchSummary {
  id: number;
  status: MatchStatus;
  /** Your side in the game. The challenger is always side A. */
  side: Side;
  opponent: { id: number; name: string };
  /** True if you sent the challenge. */
  youChallenged: boolean;
  lanes: number;
  /** Your team in the card set, and theirs. */
  team: string;
  opponentTeam: string;
  /** True when the match is waiting on you: accepting a challenge, or your next decision. */
  yourMove: boolean;
  /** Moves made so far. Send it back with your next move. */
  moveCount: number;
  waitingSince: string;
  result: { outcome: 'won' | 'lost' | 'draw'; reason: 'played' | 'resigned' } | null;
  createdAt: string;
}

/** Events from one move (seq 0 is the start of the game), as one player may see them. */
export interface MoveEvents {
  seq: number;
  events: GameEvent[];
}

/** One match in full, for the player looking at it. game is null until the challenge is accepted. */
export interface MatchDetail {
  match: MatchSummary;
  game: { view: PlayerView; legal: Action[]; events: MoveEvents[] } | null;
}

/** Another player you could challenge. */
export interface PlayerListing {
  id: number;
  name: string;
}

/**
 * A live update (GET /api/live, event "match"): one of your matches changed. It carries no game
 * information; fetch the match to see what happened.
 */
export interface MatchChange {
  matchId: number;
  status: MatchStatus;
  moveCount: number;
}
