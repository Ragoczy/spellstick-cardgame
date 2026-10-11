// The game running inside Discord, as a Discord Activity (see docs/discord-activity.md).
//
//   POST /api/discord/token    { code }  ->  { access_token }
//   POST /api/discord/signin   { code }  ->  { ok: true } and a session cookie, or 403 { error, reason }
//
// Inside Discord, the page asks the Discord app for a one-time code. Only the server knows the
// app's secret, so the page sends the code here and we trade it for an access token.
//
// token: the page uses the token to show "Playing Spellstick" details on the player's Discord
// profile. We don't store the token, and this doesn't sign anyone in.
//
// signin: signing in to online play from inside Discord, where the browser's full-page trip to
// Discord can't happen. The same checks as browser sign-in (membership and roles in our
// server), then a session cookie set up to work inside Discord's frame. The token is used for
// the checks and thrown away.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app';
import { admit, SESSION_COOKIE, sessionCookieOptions } from '../auth/routes';

export const ACTIVITY_TOKEN_PATH = '/api/discord/token';
export const ACTIVITY_SIGN_IN_PATH = '/api/discord/signin';

/** The address the game has inside Discord: Discord serves it from <client id>.discordsays.com. */
export function activityOrigin(clientId: string): string {
  return `https://${clientId}.discordsays.com`;
}

type CodeRequest = FastifyRequest<{ Body: { code?: unknown } | undefined }>;

/** The one-time code from the page, or null (after answering 400) if it's missing or odd. */
function takeCode(req: CodeRequest, reply: FastifyReply): string | null {
  const code = req.body?.code;
  // Discord's codes are short. Anything else isn't worth sending on to Discord.
  if (typeof code !== 'string' || code.length === 0 || code.length > 200) {
    void reply.code(400).send({ error: 'Missing code.' });
    return null;
  }
  return code;
}

export function discordActivityRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post<{ Body: { code?: unknown } | undefined }>(ACTIVITY_TOKEN_PATH, async (req, reply) => {
    const code = takeCode(req, reply);
    if (code === null) return reply;
    try {
      const accessToken = await deps.discord.exchangeActivityCode(code);
      reply.header('Cache-Control', 'no-store');
      return { access_token: accessToken };
    } catch (err) {
      req.log.warn(err, 'Discord Activity token exchange failed');
      return reply.code(502).send({ error: 'Discord turned the code down.' });
    }
  });

  app.post<{ Body: { code?: unknown } | undefined }>(ACTIVITY_SIGN_IN_PATH, async (req, reply) => {
    const code = takeCode(req, reply);
    if (code === null) return reply;
    reply.header('Cache-Control', 'no-store');
    let accessToken: string;
    try {
      accessToken = await deps.discord.exchangeActivityCode(code);
    } catch (err) {
      req.log.warn(err, 'Discord Activity sign-in: code exchange failed');
      return reply.code(502).send({ error: 'Discord turned the code down.', reason: 'failed' });
    }
    try {
      const result = await admit(deps, accessToken, req.log);
      if (!result.allowed) return reply.code(403).send({ error: 'Not allowed to play online.', reason: result.reason });
      const maxAge = deps.config.sessionDays * 24 * 60 * 60;
      reply.setCookie(SESSION_COOKIE, result.sessionId, { ...sessionCookieOptions(true, true), maxAge });
      return { ok: true };
    } catch (err) {
      req.log.error(err, 'Discord Activity sign-in failed');
      return reply.code(502).send({ error: 'Sign-in failed.', reason: 'failed' });
    }
  });
}
