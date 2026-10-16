// Talking to the game server. Only used by the online build (VITE_ONLINE=true); the plain
// static build never calls these.

import type { Collection, OwnedCard, SavedTeam, TeamInput } from '../shared/collectionApi';
import type { MatchDetail, MatchSummary, Pace, PlayerListing, RatingsBoard } from '../shared/matchApi';
import type { StatsOverview } from '../shared/statsApi';
import type { RedeemCodeInput, RedeemCodeRow, TournamentDetail, TournamentInput, TournamentSummary } from '../shared/tournamentApi';
import { ServerError, StaleMatchError, type MatchApi } from './onlineMatch';

export const ONLINE = import.meta.env.VITE_ONLINE === 'true';

/** The signed-in player, as GET /api/me returns them. */
export interface Me {
  displayName: string | null;
  /** Only shown to the player, in a problem report. */
  discordId: string;
  discordUsername: string;
  avatarUrl: string | null;
  role: 'player' | 'moderator' | 'admin';
}

export const SIGN_IN_URL = '/auth/discord/login';

/** Null when nobody is signed in. */
export async function fetchMe(): Promise<Me | null> {
  const res = await fetch('/api/me', { credentials: 'same-origin' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Couldn't reach the game server (${res.status}).`);
  return (await res.json()) as Me;
}

/** Returns the updated player, or throws with a message to show. */
export async function saveDisplayName(name: string): Promise<Me> {
  const res = await fetch('/api/me/name', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const body = (await res.json()) as Me | { error: string };
  if (!res.ok) throw new Error('error' in body ? body.error : 'Something went wrong.');
  return body as Me;
}

export async function signOut(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
}

/** Plain-language explanations for ?signin=<reason> after a failed sign-in. */
export const SIGN_IN_PROBLEMS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled. You can still play against the computer.',
  failed: "Sign-in didn't work. Please try again in a moment.",
  'not-member': 'Online play is for members of our Discord server. Join the server, then sign in again.',
  'no-role': "Your Discord account doesn't have a role that's allowed to play online yet. Ask a moderator on our Discord server if you think it should.",
};

/**
 * Inside Discord, sign-in happens by itself at launch (see discord.ts). When it doesn't work
 * out, the reason from the server ('not-member', 'no-role', 'failed') or 'discord' (Discord
 * didn't connect, or the player said no to Discord's prompt) becomes one of these.
 */
export const DISCORD_SIGN_IN_PROBLEMS: Record<string, string> = {
  discord: "Discord didn't sign you in to the game, so online play is off. You can still play against the computer. To try again, close the game and open it again.",
  failed: "Sign-in didn't work. You can still play against the computer. To try again, close the game and open it again.",
  'not-member': 'Online play is for members of our Discord server. Join the server, then open the game again.',
  'no-role': SIGN_IN_PROBLEMS['no-role']!,
};

/** The message for a Discord sign-in that didn't work out. */
export function discordSignInProblem(reason: string): string {
  return DISCORD_SIGN_IN_PROBLEMS[reason] ?? DISCORD_SIGN_IN_PROBLEMS.failed!;
}

// ---- Unlinking your Discord account ----

/** What the player types to confirm. The server checks it too (UNLINK_CONFIRMATION). */
export const UNLINK_WORD = 'UNLINK';

/**
 * Starts unlinking. The server answers with a Discord address: Discord checks it's really
 * them, then sends them back, and the server deletes their data. Throws with a message to show.
 */
export async function startUnlink(): Promise<void> {
  const { url } = await call<{ url: string }>('POST', '/auth/discord/unlink', { confirm: UNLINK_WORD });
  window.location.assign(url);
}

/** Inside Discord, unlinking can't leave the page for Discord's check, so it's done in the browser. */
export const UNLINK_IN_BROWSER = 'To unlink your Discord account, open Spellstick in your web browser, sign in, and choose Settings.';

/** Shown after ?unlinked=1. */
export const UNLINKED_MESSAGE = 'Your Spellstick data has been deleted and the game is disconnected from Discord. Your Discord account was not affected.';

/** Plain-language explanations for ?unlink=<reason>, when nothing was deleted. */
export const UNLINK_PROBLEMS: Record<string, string> = {
  cancelled: 'Unlinking was cancelled. Nothing was deleted.',
  failed: "Unlinking didn't work, and nothing was deleted. Please try again in a moment.",
  'wrong-account': 'Discord is signed in to a different account than this one, so nothing was deleted. Switch accounts in Discord and try again.',
};

// ---- Matches ----

/** Calls the game server and returns its answer, or throws with a message to show. */
async function call<T>(method: 'GET' | 'POST', url: string, body?: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Couldn't reach the game server. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (res.status === 401) throw new Error("You've been signed out. Go back to the start screen and sign in again.");
  if (!res.ok) {
    if (data.code === 'stale') throw new StaleMatchError(data.error);
    throw new ServerError(data.error ?? `Something went wrong on the game server (${res.status}).`, res.status);
  }
  return data as T;
}

export const matchApi: MatchApi = {
  get: (id, since) => call('GET', `/api/matches/${id}${since === undefined ? '' : `?since=${since}`}`),
  move: (id, action, seen) => call('POST', `/api/matches/${id}/moves`, { action, seen }),
  resign: (id) => call('POST', `/api/matches/${id}/resign`),
  report: async (id, kind, detail) => {
    await fetch(`/api/matches/${id}/problems`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, detail }),
    });
  },
};

export const listMatches = () => call<MatchSummary[]>('GET', '/api/matches');
export const findPlayers = (name: string) => call<PlayerListing[]>('GET', `/api/players?name=${encodeURIComponent(name)}`);
/** How players are chosen: a draft, dealt at random, or each player's saved team (constructed). */
export type PlayersChoice = 'draft' | 'dealt' | 'constructed';
export interface ChallengeInput {
  opponentId: number;
  lanes: number;
  /** Team colors and spells, for a draft or dealt players. */
  team: string;
  pace: Pace;
  players: PlayersChoice;
  ranked: boolean;
  /** Your saved team, for a constructed match. */
  teamId?: number;
}
export const sendChallenge = (input: ChallengeInput) => call<MatchSummary>('POST', '/api/matches', input);
/** teamId: your saved team, for a constructed match. */
export const acceptChallenge = (id: number, teamId?: number) =>
  call<MatchDetail>('POST', `/api/matches/${id}/accept`, teamId === undefined ? undefined : { teamId });
export const declineChallenge = (id: number) => call<MatchSummary>('POST', `/api/matches/${id}/decline`);

// ---- Cards and saved teams ----

export const fetchCollection = () => call<Collection>('GET', '/api/collection');
/** Saves a team: a new one, or changes to team id. */
export const saveTeam = (team: TeamInput, id?: number) => call<SavedTeam>('POST', id === undefined ? '/api/teams' : `/api/teams/${id}`, team);
export const deleteTeam = (id: number) => call<{ ok: true }>('POST', `/api/teams/${id}/delete`);

/** Uses a redeem code. Returns the card it gave you. */
export const redeemCode = (code: string) => call<OwnedCard>('POST', '/api/redeem', { code });

// ---- Tournaments ----

export const listTournaments = () => call<TournamentSummary[]>('GET', '/api/tournaments');
export const fetchTournament = (id: number) => call<TournamentDetail>('GET', `/api/tournaments/${id}`);
/** teamId: your saved team, for a saved-team event. */
export const enterTournament = (id: number, teamId?: number) =>
  call<TournamentDetail>('POST', `/api/tournaments/${id}/enter`, teamId === undefined ? undefined : { teamId });
export const leaveTournament = (id: number) => call<TournamentDetail>('POST', `/api/tournaments/${id}/leave`);
/** Admins only. */
export const createTournament = (input: TournamentInput) => call<TournamentSummary>('POST', '/api/admin/tournaments', input);
export const startTournament = (id: number) => call<TournamentDetail>('POST', `/api/admin/tournaments/${id}/start`);
export const cancelTournament = (id: number) => call<TournamentDetail>('POST', `/api/admin/tournaments/${id}/cancel`);
export const markPrizeSent = (id: number) => call<TournamentDetail>('POST', `/api/admin/tournaments/${id}/prize-sent`);
export const listCodes = () => call<RedeemCodeRow[]>('GET', '/api/admin/codes');
export const createCodes = (input: RedeemCodeInput) => call<RedeemCodeRow[]>('POST', '/api/admin/codes', input);

// ---- Ratings ----

export const fetchRatings = () => call<RatingsBoard>('GET', '/api/ratings');
/** Admins only. */
export const recalculateRatings = () => call<{ matches: number }>('POST', '/api/admin/ratings/recalculate');
export const resetRatings = () => call<{ ok: true }>('POST', '/api/admin/ratings/reset');

// ---- Notification settings ----

export interface NotificationSettings {
  /** False when the game can't send Discord messages yet. */
  available: boolean;
  kinds: { kind: string; label: string; description: string; enabled: boolean }[];
}

export const fetchNotificationSettings = () => call<NotificationSettings>('GET', '/api/me/notifications');
export const saveNotificationSetting = (kind: string, enabled: boolean) =>
  call<NotificationSettings>('POST', '/api/me/notifications', { kind, enabled });

// ---- Beta dashboard (moderators and admins) ----

export interface BetaOverview {
  target: number;
  matches: { finishedPlayed: number; finishedOther: number; active: number; challenged: number; withProblems: number };
  players: { signedUp: number; played: number };
  problems: { id: number; matchId: number; kind: string; detail: string; reportedBy: string; createdAt: string; resolved: boolean }[];
  recent: { id: number; players: [string, string]; status: string; endReason: string | null; moves: number; pace: string | null; draft: boolean; updatedAt: string }[];
}

export const fetchBetaOverview = () => call<BetaOverview>('GET', '/api/admin/beta');
export const checkAllMatches = () => call<{ checked: number; newProblems: number }>('POST', '/api/admin/beta/check');
export const resolveProblem = (id: number) => call<BetaOverview>('POST', `/api/admin/problems/${id}/resolve`);

// ---- Stats dashboard (moderators and admins) ----

export type { StatsOverview };
export const fetchStats = () => call<StatsOverview>('GET', '/api/admin/stats');
