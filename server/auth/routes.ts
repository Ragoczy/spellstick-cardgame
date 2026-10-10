// Sign in with Discord, and sign out.
//
//   /auth/discord/login     sends the player to Discord
//   /auth/discord/callback  Discord sends them back here; we check access and start a session
//   /auth/logout            ends the session
//   /auth/discord/unlink    "Unlink my Discord account": deletes the player's data (see below)
//
// When sign-in doesn't work out, the player lands back on the start screen with ?signin=<reason>
// so the page can explain what happened.
//
// Unlinking: we don't keep Discord tokens, so there is nothing stored to revoke. Instead the
// player goes through Discord's sign-in once more (Discord skips its screen for an app they
// already approved), and the callback revokes that fresh token, which ends every token the game
// was given, then deletes their data (../unlink.ts). The player lands on ?unlinked=1, or
// ?unlink=<reason> if nothing was deleted.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import type { LiveHub } from '../live';
import { unlinkAccount } from '../unlink';
import { createSession, deleteSession, upsertUser } from '../users';
import { currentUser } from './current-user';
import { accessRules, authorizeUrl, checkAccess } from './discord';

export const SESSION_COOKIE = 'spellstick_session';
const STATE_COOKIE = 'spellstick_oauth_state';

export type SignInProblem = 'cancelled' | 'failed' | 'not-member' | 'no-role';
export type UnlinkProblem = 'cancelled' | 'failed' | 'wrong-account';

/** What the player types to confirm unlinking. The page asks for it too. */
export const UNLINK_CONFIRMATION = 'UNLINK';
/** The state value of an unlink starts with this. (Sign-in states are base64url, which has no dots.) */
const UNLINK_STATE_PREFIX = 'unlink.';

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function authRoutes(app: FastifyInstance, deps: AppDeps, live: LiveHub): void {
  const { config, db, discord } = deps;
  const redirectUri = `${config.publicUrl}/auth/discord/callback`;
  const secure = config.publicUrl.startsWith('https://');
  const rules = accessRules(config.discord, config.adminDiscordIds);

  app.get('/auth/discord/login', async (_req, reply) => {
    // A random value we check on the way back, so nobody can trick a browser into signing in
    // with someone else's Discord account.
    const state = randomBytes(24).toString('base64url');
    reply.setCookie(STATE_COOKIE, state, { path: '/auth', httpOnly: true, secure, sameSite: 'lax', maxAge: 600 });
    return reply.redirect(authorizeUrl(config.discord.clientId, redirectUri, state));
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/auth/discord/callback', async (req, reply) => {
    const back = (problem: SignInProblem) => reply.redirect(`/?signin=${problem}`);
    const expected = req.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: '/auth' });
    // Only our server sets this cookie, so only the unlink button can start an unlink.
    const unlinking = expected?.startsWith(UNLINK_STATE_PREFIX) ?? false;
    const unlinkBack = (problem: UnlinkProblem) => reply.redirect(`/?unlink=${problem}`);

    if (req.query.error) return unlinking ? unlinkBack('cancelled') : back('cancelled');
    const { code, state } = req.query;
    if (!code || !state || !expected || !sameString(state, expected)) return unlinking ? unlinkBack('failed') : back('failed');

    if (unlinking) {
      const user = await currentUser(db, req);
      if (!user) return unlinkBack('failed');
      let token: string;
      try {
        token = await discord.exchangeCode(code, redirectUri);
        const discordUser = await discord.getUser(token);
        // Signed in to Discord as someone else: delete nothing, and leave their token alone.
        if (discordUser.id !== user.discordId) return unlinkBack('wrong-account');
      } catch (err) {
        req.log.error(err, 'unlink: Discord check failed');
        return unlinkBack('failed');
      }
      try {
        await discord.revokeToken(token);
      } catch (err) {
        // Still delete their data: that's what they asked for, and it doesn't depend on Discord.
        req.log.warn(err, 'unlink: token revocation failed');
      }
      const notices = await unlinkAccount(db, user.id);
      live.closeUser(user.id);
      for (const notice of notices) live.matchChanged(notice.playerIds, notice.change);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      // No user ID in the log: the player asked us to forget them.
      req.log.info('account unlinked');
      return reply.redirect('/?unlinked=1');
    }

    try {
      const token = await discord.exchangeCode(code, redirectUri);
      const user = await discord.getUser(token);
      const member = await discord.getMember(token, config.discord.guildId);
      const access = checkAccess(user.id, member, rules);
      if (!access.allowed) {
        req.log.info({ discordId: user.id, reason: access.reason }, 'sign-in refused');
        return back(access.reason);
      }
      const player = await upsertUser(db, user, member, access.role);
      const sessionId = await createSession(db, player.id, config.sessionDays);
      reply.setCookie(SESSION_COOKIE, sessionId, {
        path: '/', httpOnly: true, secure, sameSite: 'lax', maxAge: config.sessionDays * 24 * 60 * 60,
      });
      req.log.info({ userId: player.id }, 'signed in');
      return reply.redirect('/');
    } catch (err) {
      req.log.error(err, 'sign-in failed');
      return back('failed');
    }
  });

  // Step one of unlinking: the page has shown what will be deleted and the player typed UNLINK.
  // Answers with the Discord address to send them to; the callback above does the rest.
  app.post<{ Body: { confirm?: unknown } | undefined }>('/auth/discord/unlink', async (req, reply) => {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    if (req.body?.confirm !== UNLINK_CONFIRMATION) return reply.code(400).send({ error: `Type ${UNLINK_CONFIRMATION} to confirm.` });
    const state = UNLINK_STATE_PREFIX + randomBytes(24).toString('base64url');
    reply.setCookie(STATE_COOKIE, state, { path: '/auth', httpOnly: true, secure, sameSite: 'lax', maxAge: 600 });
    return { url: authorizeUrl(config.discord.clientId, redirectUri, state) };
  });

  app.post('/auth/logout', async (req, reply) => {
    const sessionId = req.cookies[SESSION_COOKIE];
    if (sessionId) await deleteSession(db, sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
