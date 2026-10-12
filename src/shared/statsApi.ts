// What the stats dashboard (GET /api/admin/stats, moderators and admins) sends, shared by the
// server (server/stats.ts) and the browser (src/ui/StatsDashboard.tsx). Types only: no code.

/** A win–loss–draw record. */
export interface StatsRecord {
  played: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface StatsOverview {
  /** When these numbers were worked out. */
  generatedAt: string;

  players: {
    /** Signed in at least once and haven't unlinked. */
    accounts: number;
    /** Picked a team or manager name (needed to play online). */
    named: number;
    byRole: { player: number; moderator: number; admin: number };
    /** Opened the game while signed in, in the last day, week, and 30 days. */
    seenDay: number;
    seenWeek: number;
    seenMonth: number;
    /** First signed in during the last week, and the last 30 days. */
    newWeek: number;
    newMonth: number;
    /** Started at least one match, and finished at least five. */
    playedOne: number;
    playedFive: number;
    /** Accounts deleted with "Unlink my Discord account". */
    unlinked: number;
  };

  matches: {
    challenged: number;
    active: number;
    finished: number;
    declined: number;
    finishedWeek: number;
    finishedMonth: number;
    /** How finished matches ended. Draws are matches played to the end with no winner. */
    played: number;
    resigned: number;
    forfeit: number;
    draws: number;
    /** Finished matches where a player ran out of time and the computer finished for them. */
    autopilot: number;
    /** Of matches that started (active or finished). */
    started: number;
    ranked: number;
    draft: number;
    /** Each player brought a saved team. */
    constructed: number;
    threeLanes: number;
    live: number;
    async: number;
    /** Average moves in matches played to the end. Null before there are any. */
    averageMoves: number | null;
    /** Median time from accepting to the end, for matches played to the end, in minutes. */
    medianMinutesLive: number | null;
    medianMinutesAsync: number | null;
    /** Challenges nobody has answered for over a week. */
    oldChallenges: number;
  };

  /** The last 30 days, oldest first. Days are UTC dates (YYYY-MM-DD). */
  days: { day: string; started: number; finished: number; players: number }[];

  /** Finished matches: the challenger (side A) against the player they challenged (side B). */
  sides: { challengerWins: number; challengedWins: number; draws: number };

  /** Each team's record in finished matches. */
  teams: ({ id: string; name: string } & StatsRecord)[];

  /** Draft picks, from draft matches whose draft is over. Most-picked first. */
  draftCards: {
    id: string;
    name: string;
    kind: 'field' | 'goalie';
    /** Drafts this card was in the pool for, and how often it was taken. */
    offered: number;
    picked: number;
    /** Average place in the pick order (1 = first pick). Null if never picked. */
    averagePick: number | null;
    /** Finished matches where the side that picked it won or lost. */
    wins: number;
    losses: number;
  }[];
  /** Draft matches counted for draftCards. */
  drafts: number;

  ratings: {
    /** Players with a rating since the last reset, and those who've finished their placement matches. */
    rated: number;
    placed: number;
    average: number | null;
    tiers: { name: string; players: number }[];
  };

  /** Most active players in the last 30 days, by matches finished. */
  topPlayers: { name: string; finishedMonth: number; finished: number; wins: number; lastSeen: string }[];

  notifications: {
    /** Players with at least one kind of Discord notification turned on. */
    playersOptedIn: number;
    sentWeek: number;
    /** Discord refused, usually because the player only accepts DMs from friends. */
    failedWeek: number;
  };

  problems: { open: number; total: number };
}
