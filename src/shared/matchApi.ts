// What the game server's match API sends, shared by the server (server/matches.ts) and the
// browser (src/ui/online.ts) so the two can't drift apart. Types only: no code.

import type { Action, GameEvent, PlayerView, Side } from '../engine';

export type MatchStatus = 'challenged' | 'active' | 'finished' | 'declined';

/** How long each player's time bank is: live (minutes) or async (hours). See TIME_BANKS on the server. */
export type Pace = 'live' | 'async';

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
  /** Null for matches from before time banks. */
  pace: Pace | null;
  /** True if the match starts with a head-to-head draft (otherwise players are dealt at random). */
  draft: boolean;
  /** True if the result changes both players' ratings (draft matches only). */
  ranked: boolean;
  /**
   * Time left in each player's bank, in milliseconds, at the moment this was sent. running: whose
   * bank is going down now. Null for untimed matches.
   */
  clock: { you: number; them: number; running: 'you' | 'them' | null } | null;
  /** Players whose time ran out: the computer makes their decisions. */
  autopilot: { you: boolean; them: boolean };
  /**
   * forfeit: a player's time ran out before they had made a single move. ratingChange: how much
   * your rating went up or down (null for unranked matches).
   */
  result: { outcome: 'won' | 'lost' | 'draw'; reason: 'played' | 'resigned' | 'forfeit'; ratingChange: number | null } | null;
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

/** A rating tier and the lowest rating in it. */
export interface RatingTier {
  name: string;
  from: number;
}

/** A player's ranked record since ratings last started over. */
export interface RatingRecord {
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Null until the player has finished their first few ranked matches (placementGames). */
  tier: string | null;
}

/** GET /api/ratings: the leaderboard, and where you stand. */
export interface RatingsBoard {
  /** Null if you haven't finished a ranked match since ratings last started over. */
  you: (RatingRecord & { rank: number | null }) | null;
  /** Players with a tier, best first. Players with the same rating share a rank. */
  players: (RatingRecord & { rank: number; name: string; you: boolean })[];
  /** Ranked matches a player finishes before they get a tier and a place on the board. */
  placementGames: number;
  /** Highest first. */
  tiers: RatingTier[];
  /** When ratings last started over (null if never). */
  since: string | null;
}
