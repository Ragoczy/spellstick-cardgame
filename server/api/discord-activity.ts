// The game running inside Discord, as a Discord Activity (see docs/discord-activity.md).
//
//   POST /api/discord/signin   { code }  ->  { access_token, signedIn: true } and a session cookie,
//                                         or { access_token, signedIn: false, reason }
//
// When Discord launches the game, the page asks the Discord app for a one-time code, once, for
// everything the game needs: showing "Playing Spellstick" on the player's profile, who they are,
// and their membership and roles in our server. That's the flow Discord's own guide uses.
// Only the server knows the app's secret, so the page sends the code here and we:
// - trade it for an access token, which goes back to the page for the profile details;
// - run the same checks as browser sign-in (membership and an allowed role), and if they pass,
//   set a session cookie that works inside Discord's frame. Online play needs no extra step.
// We don't store the token. Someone who may not play online still gets the token, so the
// profile details work and they can play the computer.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app';
import { admit, SESSION_COOKIE, sessionCookieOptions } from '../auth/routes';
import { deleteSession } from '../users';

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
  app.post<{ Body: { code?: unknown } | undefined }>(ACTIVITY_SIGN_IN_PATH, async (req, reply) => {
    const code = takeCode(req, reply);
    if (code === null) return reply;
    reply.header('Cache-Control', 'no-store');

    let accessToken: string;
    try {
      accessToken = await deps.discord.exchangeActivityCode(code);
    } catch (err) {
      req.log.warn(err, 'Discord Activity: code exchange failed');
      return reply.code(502).send({ error: 'Discord turned the code down.' });
    }

    // Each launch signs in afresh, so roles are checked again. The session this page had
    // before, if any, is replaced (or ended, if they may no longer play).
    const previous = req.cookies[SESSION_COOKIE];
    try {
      const result = await admit(deps, accessToken, req.log);
      if (previous) await deleteSession(deps.db, previous);
      if (!result.allowed) return { access_token: accessToken, signedIn: false, reason: result.reason };
      const maxAge = deps.config.sessionDays * 24 * 60 * 60;
      reply.setCookie(SESSION_COOKIE, result.sessionId, { ...sessionCookieOptions(true, true), maxAge });
      return { access_token: accessToken, signedIn: true };
    } catch (err) {
      // Discord or the database had trouble. Keep any earlier session; presence still works.
      req.log.error(err, 'Discord Activity: sign-in failed');
      return { access_token: accessToken, signedIn: false, reason: 'failed' };
    }
  });
}
