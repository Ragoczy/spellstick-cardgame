// Who is making a request, from their session cookie.

import type { FastifyRequest } from 'fastify';
import type pg from 'pg';
import { userForSession, type User } from '../users';
import { SESSION_COOKIE } from './routes';

/** The signed-in player, or null. */
export async function currentUser(db: pg.Pool, req: FastifyRequest): Promise<User | null> {
  const sessionId = req.cookies[SESSION_COOKIE];
  return sessionId ? userForSession(db, sessionId) : null;
}
