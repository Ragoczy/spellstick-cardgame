// Talking to the game server. Only used by the online build (VITE_ONLINE=true); the plain
// static build never calls these.

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
  'no-role': "Online play is in a closed beta, and your Discord account doesn't have the beta role yet. Ask a moderator if you think it should.",
};
