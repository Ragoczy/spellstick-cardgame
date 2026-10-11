// Who is making a request, from their session cookie.

import type { FastifyRequest } from 'fastify';
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
