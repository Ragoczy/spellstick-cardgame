// Builds the web server: sign-in, the player API, and the browser game's files.
//
// Kept separate from main.ts so tests can build an app with a test database and a fake Discord.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type pg from 'pg';
import { meRoutes } from './api/me';
import type { DiscordApi } from './auth/discord';
import { authRoutes } from './auth/routes';
import type { Config } from './config';

export interface AppDeps {
  config: Config;
  db: pg.Pool;
  discord: DiscordApi;
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
  app.addHook('onRequest', async (req, reply) => {
    // Refuse form posts from other websites. (The SameSite cookie setting already blocks most of this.)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (origin && origin !== publicOrigin) return reply.code(403).send({ error: 'Wrong origin.' });
    }
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Content-Security-Policy', "frame-ancestors 'self'");
  });

  app.get('/healthz', async () => ({ ok: true }));
  authRoutes(app, deps);
  meRoutes(app, deps);

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
