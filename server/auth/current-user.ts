// Who is making a request, from their session cookie.

import type { FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { userForSession, type User } from '../users';
import type { RoleCheck } from './role-check';
import { SESSION_COOKIE } from './routes';

declare module 'fastify' {
  interface FastifyInstance {
    /** Re-checks signed-in players' Discord roles every so often. Null when it's off (no bot token). */
    roleCheck: RoleCheck | null;
  }
}

/** The signed-in player, or null (including when their Discord roles no longer let them play). */
export async function currentUser(db: pg.Pool, req: FastifyRequest): Promise<User | null> {
  const sessionId = req.cookies[SESSION_COOKIE];
  const user = sessionId ? await userForSession(db, sessionId) : null;
  if (!user || !req.server.roleCheck) return user;
  return req.server.roleCheck.recheck(user);
}

/**
 * The signed-in moderator or admin (roles come from Discord). Anyone else gets a 401 or 403 sent
 * for them, and null back.
 */
export async function staffUser(db: pg.Pool, req: FastifyRequest, reply: FastifyReply): Promise<User | null> {
  const user = await currentUser(db, req);
  if (!user) {
    reply.code(401).send({ error: 'Not signed in.' });
    return null;
  }
  if (user.role !== 'moderator' && user.role !== 'admin') {
    reply.code(403).send({ error: 'Only moderators can see this.' });
    return null;
  }
  return user;
}
