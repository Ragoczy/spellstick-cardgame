// The game running inside Discord, as a Discord Activity (see docs/discord-activity.md).
//
//   POST /api/discord/token   { code }  ->  { access_token }
//
// Inside Discord, the page asks the Discord app for a one-time code. Only the server knows the
// app's secret, so the page sends the code here and we trade it for an access token. The page
// uses the token to show "Playing Spellstick" details on the player's Discord profile. We don't
// store the token, and this doesn't sign anyone in to the online game.

import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

export const ACTIVITY_TOKEN_PATH = '/api/discord/token';

/** The address the game has inside Discord: Discord serves it from <client id>.discordsays.com. */
export function activityOrigin(clientId: string): string {
  return `https://${clientId}.discordsays.com`;
}

export function discordActivityRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post<{ Body: { code?: unknown } | undefined }>(ACTIVITY_TOKEN_PATH, async (req, reply) => {
    const code = req.body?.code;
    // Discord's codes are short. Anything else isn't worth sending on to Discord.
    if (typeof code !== 'string' || code.length === 0 || code.length > 200) {
      return reply.code(400).send({ error: 'Missing code.' });
    }
    try {
      const accessToken = await deps.discord.exchangeActivityCode(code);
      reply.header('Cache-Control', 'no-store');
      return { access_token: accessToken };
    } catch (err) {
      req.log.warn(err, 'Discord Activity token exchange failed');
      return reply.code(502).send({ error: 'Discord turned the code down.' });
    }
  });
}
