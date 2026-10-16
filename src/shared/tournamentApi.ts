// What the game server's tournament API sends (server/tournaments.ts), shared with the browser
// (src/ui/online.ts). Types only: no code.

import type { Pace } from './matchApi';

export type TournamentStatus = 'registration' | 'swiss' | 'knockout' | 'finished' | 'cancelled';
export type TournamentFormat = 'draft' | 'constructed';
/** How a pairing ended: side A or B won, a draw, both lost (nobody moved by the deadline), or a bye. */
export type PairingOutcome = 'A' | 'B' | 'draw' | 'double_loss' | 'bye';
export type Placing = 'champion' | 'finalist' | 'knockout' | 'played';

/** One tournament in the list. */
export interface TournamentSummary {
  id: number;
  name: string;
  status: TournamentStatus;
  format: TournamentFormat;
  lanes: number;
  pace: Pace;
  roundHours: number;
  /** Free-form, set by an admin. Null when there's no top prize. */
  topPrize: string | null;
  /** The player card award editions are made from (null: no award cards). */
  awardCard: string | null;
  entrants: number;
  /** Set when the tournament starts. */
  swissRounds: number | null;
  knockoutSize: number | null;
  /** The round being played (0 before the start). Knockout rounds come after the Swiss rounds. */
  round: number;
  roundEndsAt: string | null;
  champion: string | null;
  /** True if you're entered (and haven't dropped). */
  youEntered: boolean;
  createdAt: string;
}

export interface StandingRow {
  rank: number;
  name: string;
  /** Saved-team events only. */
  teamName: string | null;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  /** Opponents' match-win percentage, 0 to 100, one decimal. */
  opponentsWin: number;
  goalDifference: number;
  dropped: boolean;
  you: boolean;
}

export interface PairingRow {
  round: number;
  stage: 'swiss' | 'knockout';
  slot: number;
  a: { name: string; you: boolean; seed: number | null };
  /** Null for a bye. */
  b: { name: string; you: boolean; seed: number | null } | null;
  outcome: PairingOutcome | null;
  goalsA: number;
  goalsB: number;
  /** How the match ended (null while it's being played, and for byes). */
  ended: 'played' | 'resigned' | 'forfeit' | 'deadline' | null;
  /** Your own matches only, so you can open them. */
  matchId: number | null;
}

/** GET /api/tournaments/:id */
export interface TournamentDetail {
  tournament: TournamentSummary;
  /** Swiss standings (empty before the start). */
  standings: StandingRow[];
  pairings: PairingRow[];
  /** Before the start: who has entered. */
  entrants: { name: string; teamName: string | null; you: boolean }[];
  you: {
    entered: boolean;
    dropped: boolean;
    /** How you did, once the tournament is over. */
    placing: Placing | null;
    /** Your match in the round being played, if any. */
    currentMatchId: number | null;
  };
  /** Admins only: when the top prize was marked sent. */
  prizeSentAt: string | null;
}

/** POST /api/admin/tournaments */
export interface TournamentInput {
  name: string;
  format: TournamentFormat;
  lanes: number;
  pace: Pace;
  roundHours: number;
  topPrize: string;
  /** A player card id, or '' for no award cards. */
  awardCard: string;
}

/** A redeem code, as admins see it. */
export interface RedeemCodeRow {
  code: string;
  cardId: string;
  label: string;
  tradeable: boolean;
  expiresAt: string | null;
  createdAt: string;
  redeemedBy: string | null;
  redeemedAt: string | null;
}

/** POST /api/admin/codes */
export interface RedeemCodeInput {
  cardId: string;
  label: string;
  count: number;
  tradeable: boolean;
  /** 0 for codes that never expire. */
  expiresInDays: number;
}
