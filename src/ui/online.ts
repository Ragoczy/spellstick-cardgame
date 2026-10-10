// Talking to the game server. Only used by the online build (VITE_ONLINE=true); the plain
// static build never calls these.

import type { MatchDetail, MatchSummary, Pace, PlayerListing } from '../shared/matchApi';
import { StaleMatchError, type MatchApi } from './onlineMatch';

export const ONLINE = import.meta.env.VITE_ONLINE === 'true';

/** The signed-in player, as GET /api/me returns them. */
export interface Me {
  displayName: string | null;
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
    throw new Error(data.error ?? `Something went wrong on the game server (${res.status}).`);
  }
  return data as T;
}

export const matchApi: MatchApi = {
  get: (id, since) => call('GET', `/api/matches/${id}${since === undefined ? '' : `?since=${since}`}`),
  move: (id, action, seen) => call('POST', `/api/matches/${id}/moves`, { action, seen }),
  resign: (id) => call('POST', `/api/matches/${id}/resign`),
};

export const listMatches = () => call<MatchSummary[]>('GET', '/api/matches');
export const findPlayers = (name: string) => call<PlayerListing[]>('GET', `/api/players?name=${encodeURIComponent(name)}`);
export const sendChallenge = (opponentId: number, lanes: number, team: string, pace: Pace) =>
  call<MatchSummary>('POST', '/api/matches', { opponentId, lanes, team, pace });
export const acceptChallenge = (id: number) => call<MatchDetail>('POST', `/api/matches/${id}/accept`);
export const declineChallenge = (id: number) => call<MatchSummary>('POST', `/api/matches/${id}/decline`);
