// Builds the web server: sign-in, the player API, and the browser game's files.
//
// Kept separate from main.ts so tests can build an app with a test database and a fake Discord.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type pg from 'pg';
import { ACTIVITY_TOKEN_PATH, activityOrigin, discordActivityRoutes } from './api/discord-activity';
import { betaRoutes } from './api/beta';
import { matchRoutes } from './api/matches';
import { meRoutes } from './api/me';
import { notificationRoutes } from './api/notifications';
import type { DiscordApi } from './auth/discord';
import { authRoutes } from './auth/routes';
import { LiveHub } from './live';
import type { Config } from './config';
import { discordBot, Notifier, type DiscordBot } from './notify';

export interface AppDeps {
  config: Config;
  db: pg.Pool;
  discord: DiscordApi;
  /** Sends Discord notifications. Tests pass a fake; otherwise it comes from the bot token, if set. */
  bot?: DiscordBot | null;
}

export async function buildApp(deps: AppDeps, logger: FastifyServerOptions['logger'] = false): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger === false ? false : {
      ...(typeof logger === 'object' ? logger : {}),
      // Leave query strings out of the logs: the sign-in return address carries one-time codes.
      serializers: { req: (req) => ({ method: req.method, url: req.url.split('?')[0] }) },
    },
    // Azure's front door handles HTTPS and passes requests on.
    trustProxy: true,
  });

  await app.register(fastifyCookie);

  const publicOrigin = new URL(deps.config.publicUrl).origin;
  // Inside Discord the game is served from Discord's address, so its posts come from there.
  // Null when the Discord Activity is off.
  const activity = deps.config.discordActivity;
  const discordOrigin = activity ? activityOrigin(activity.clientId) : null;
  app.addHook('onRequest', async (req, reply) => {
    // Refuse form posts from other websites. (The SameSite cookie setting already blocks most of this.)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      const fromDiscord = discordOrigin !== null && origin === discordOrigin && req.url.split('?')[0] === ACTIVITY_TOKEN_PATH;
      if (origin && origin !== publicOrigin && !fromDiscord) return reply.code(403).send({ error: 'Wrong origin.' });
    }
  });
  // Only this site and Discord (for the Activity) may show the game inside a frame.
  const frameAncestors = [
    "'self'",
    ...(discordOrigin ? ['https://discord.com', 'https://ptb.discord.com', 'https://canary.discord.com', discordOrigin] : []),
  ].join(' ');
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Content-Security-Policy', `frame-ancestors ${frameAncestors}`);
  });

  app.get('/healthz', async () => ({ ok: true }));
  const live = new LiveHub();
  authRoutes(app, deps, live);
  meRoutes(app, deps);
  if (activity) discordActivityRoutes(app, deps);
  const bot = deps.bot !== undefined ? deps.bot : deps.config.discordBotToken ? discordBot(deps.config.discordBotToken) : null;
  const notifier = new Notifier(deps.db, bot, live, deps.config.publicUrl, (err) => app.log.error(err, 'notification failed'));
  notificationRoutes(app, deps, notifier);
  betaRoutes(app, deps);
  matchRoutes(app, deps, live, notifier);
  // Live connections never end by themselves, so end them first when the server is shutting down.
  app.addHook('preClose', async () => live.closeAll());

  // The built browser game (npm run build:online). Not there during local development, when
  // Vite serves the page instead.
  const staticDir = resolve(deps.config.staticDir);
  if (existsSync(resolve(staticDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: staticDir,
      setHeaders: (res, path) => {
        // Vite gives built files unique names, so they can be cached for good. The page itself can't.
        res.header('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  return app;
}
