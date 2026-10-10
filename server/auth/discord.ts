// Talking to Discord during sign-in.
//
// We ask for two permissions ("scopes"): identify (who you are) and guilds.members.read (your
// membership and roles in our server). The access token is used for these calls and then
// thrown away. We never store Discord tokens.

export const DISCORD_SCOPES = 'identify guilds.members.read';
const API = 'https://discord.com/api/v10';

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export interface DiscordMember {
  roles: string[];
  joinedAt: string;
}

/** The Discord calls sign-in needs. Tests swap in a fake. */
export interface DiscordApi {
  exchangeCode(code: string, redirectUri: string): Promise<string>;
  getUser(accessToken: string): Promise<DiscordUser>;
  /** Null when the person isn't in the server. */
  getMember(accessToken: string, guildId: string): Promise<DiscordMember | null>;
  /**
   * The game inside Discord (a Discord Activity) gets a one-time code from the Discord app and
   * trades it here for an access token, using the Activity app's secret. No return address.
   */
  exchangeActivityCode(code: string): Promise<string>;
}

interface AppCredentials {
  clientId: string;
  clientSecret: string;
}

/** Trades a one-time code for an access token. */
async function exchangeForToken(app: AppCredentials, params: Record<string, string>): Promise<string> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', ...params }),
  });
  if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', DISCORD_SCOPES);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  // Skip Discord's "Authorize" screen for people who already approved the app.
  url.searchParams.set('prompt', 'none');
  return url.toString();
}

/** signIn: the shared sign-in app. activity: the app that runs the game inside Discord (may be the same one; null = off). */
export function discordApi(signIn: AppCredentials, activity: AppCredentials | null): DiscordApi {
  return {
    exchangeCode: (code, redirectUri) => exchangeForToken(signIn, { code, redirect_uri: redirectUri }),
    exchangeActivityCode: async (code) => {
      if (!activity) throw new Error('The Discord Activity is off.');
      return exchangeForToken(activity, { code });
    },

    async getUser(accessToken) {
      const res = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`Discord user lookup failed: ${res.status}`);
      const body = (await res.json()) as { id: string; username: string; global_name: string | null; avatar: string | null };
      return { id: body.id, username: body.username, globalName: body.global_name, avatar: body.avatar };
    },

    async getMember(accessToken, guildId) {
      const res = await fetch(`${API}/users/@me/guilds/${guildId}/member`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Discord member lookup failed: ${res.status}`);
      const body = (await res.json()) as { roles: string[]; joined_at: string };
      return { roles: body.roles, joinedAt: body.joined_at };
    },
  };
}

/** Discord IDs contain the time the account was made (milliseconds since the start of 2015). */
export function discordCreatedAt(discordId: string): Date {
  return new Date(Number(BigInt(discordId) >> 22n) + 1420070400000);
}

export type Role = 'player' | 'moderator' | 'admin';

export type AccessResult = { allowed: true; role: Role } | { allowed: false; reason: 'not-member' | 'no-role' };

export interface AccessRules {
  /** Roles that may sign in as players. Empty means any server member. */
  allowedRoleIds: string[];
  moderatorRoleIds: string[];
  adminRoleIds: string[];
  /** Always admins, even without a role or outside the server. */
  adminDiscordIds: string[];
}

/** This game's sign-in rules: its own allowed roles if it has any, otherwise the shared player roles. */
export function accessRules(discord: { playerRoleIds: string[]; moderatorRoleIds: string[]; adminRoleIds: string[]; allowedRoleIds: string[] }, adminDiscordIds: string[]): AccessRules {
  return {
    allowedRoleIds: discord.allowedRoleIds.length > 0 ? discord.allowedRoleIds : discord.playerRoleIds,
    moderatorRoleIds: discord.moderatorRoleIds,
    adminRoleIds: discord.adminRoleIds,
    adminDiscordIds,
  };
}

/**
 * Who may sign in, and as what. Roles come from our Discord server, checked at each sign-in:
 * an Admins role makes you an admin, a Mods role a moderator, and an allowed role a player.
 * Anyone else in the server is turned away.
 */
export function checkAccess(discordId: string, member: DiscordMember | null, rules: AccessRules): AccessResult {
  if (rules.adminDiscordIds.includes(discordId)) return { allowed: true, role: 'admin' };
  if (!member) return { allowed: false, reason: 'not-member' };
  const has = (ids: string[]) => member.roles.some((r) => ids.includes(r));
  if (has(rules.adminRoleIds)) return { allowed: true, role: 'admin' };
  if (has(rules.moderatorRoleIds)) return { allowed: true, role: 'moderator' };
  if (rules.allowedRoleIds.length === 0 || has(rules.allowedRoleIds)) return { allowed: true, role: 'player' };
  return { allowed: false, reason: 'no-role' };
}
