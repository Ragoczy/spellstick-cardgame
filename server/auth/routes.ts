// Sign in with Discord, and sign out.
//
//   /auth/discord/login     sends the player to Discord
//   /auth/discord/callback  Discord sends them back here; we check access and start a session
//   /auth/logout            ends the session
//
// When sign-in doesn't work out, the player lands back on the start screen with ?signin=<reason>
// so the page can explain what happened.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { createSession, deleteSession, upsertUser } from '../users';
import { accessRules, authorizeUrl, checkAccess } from './discord';

export const SESSION_COOKIE = 'spellstick_session';
const STATE_COOKIE = 'spellstick_oauth_state';

export type SignInProblem = 'cancelled' | 'failed' | 'not-member' | 'no-role';

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function authRoutes(app: FastifyInstance, deps: AppDeps): void {
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

    if (req.query.error) return back('cancelled');
    const { code, state } = req.query;
    if (!code || !state || !expected || !sameString(state, expected)) return back('failed');

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

  app.post('/auth/logout', async (req, reply) => {
    const sessionId = req.cookies[SESSION_COOKIE];
    if (sessionId) await deleteSession(db, sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
