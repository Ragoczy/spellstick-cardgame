// Ratings and the leaderboard. The sums live in ../ratings.ts.
//
//   GET  /api/ratings                     the leaderboard, and where you stand
//   POST /api/admin/ratings/recalculate   admins: work every rating out again from the ranked matches
//   POST /api/admin/ratings/reset         admins: start ratings over (for example after the beta)

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app';
import { currentUser } from '../auth/current-user';
import { inTransaction } from '../matches';
import { ratingsBoard, recalculateRatings, resetRatings } from '../ratings';

export function ratingRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Only admins (roles come from Discord at sign-in). */
  async function adminOnly(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const user = await currentUser(db, req);
    if (!user) {
      reply.code(401).send({ error: 'Not signed in.' });
      return false;
    }
    if (user.role !== 'admin') {
      reply.code(403).send({ error: 'Only admins can do this.' });
      return false;
    }
    return true;
  }

  app.get('/api/ratings', async (req, reply) => {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    return ratingsBoard(db, user);
  });

  app.post('/api/admin/ratings/recalculate', async (req, reply) => {
    if (!(await adminOnly(req, reply))) return;
    const matches = await inTransaction(db, (client) => recalculateRatings(client));
    return { matches };
  });

  app.post('/api/admin/ratings/reset', async (req, reply) => {
    if (!(await adminOnly(req, reply))) return;
    await inTransaction(db, (client) => resetRatings(client));
    return { ok: true };
  });
}
