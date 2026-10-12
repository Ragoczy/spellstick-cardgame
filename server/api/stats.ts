// The stats dashboard: how the online game is going.
//
//   GET /api/admin/stats   moderators and admins: players, matches, activity, teams, draft picks, ratings

import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { staffUser } from '../auth/current-user';
import { statsOverview } from '../stats';

export function statsRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/admin/stats', async (req, reply) => {
    if (!(await staffUser(db, req, reply))) return;
    return statsOverview(db);
  });
}
