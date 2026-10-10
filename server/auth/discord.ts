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

export function discordApi(clientId: string, clientSecret: string): DiscordApi {
  return {
    async exchangeCode(code, redirectUri) {
      const res = await fetch(`${API}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      });
      if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status}`);
      const body = (await res.json()) as { access_token: string };
      return body.access_token;
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

export type AccessResult = 'allowed' | 'not-member' | 'no-role';

/**
 * Who may sign in: admins always; everyone else must be in the server and, if any roles are
 * set, hold at least one of them.
 */
export function checkAccess(
  discordId: string,
  member: DiscordMember | null,
  rules: { allowedRoleIds: string[]; adminDiscordIds: string[] },
): AccessResult {
  if (rules.adminDiscordIds.includes(discordId)) return 'allowed';
  if (!member) return 'not-member';
  if (rules.allowedRoleIds.length === 0) return 'allowed';
  return member.roles.some((r) => rules.allowedRoleIds.includes(r)) ? 'allowed' : 'no-role';
}
