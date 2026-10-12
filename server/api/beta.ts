// Beta readiness: problem reports from players' browsers, and the moderator dashboard.
//
//   POST /api/matches/:id/problems        a player's browser reports a problem: { kind, detail }
//   GET  /api/admin/beta                  moderators and admins: progress to the gate, problems, recent matches
//   POST /api/admin/beta/check            moderators and admins: replay every match now and look for problems
//   POST /api/admin/problems/:id/resolve  moderators and admins: mark a problem dealt with

import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { currentUser, staffUser } from '../auth/current-user';
import { betaOverview, checkAllMatches, reportProblem, resolveProblem } from '../beta';

export function betaRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.post<{ Params: { id: string }; Body: { kind?: unknown; detail?: unknown } | undefined }>('/api/matches/:id/problems', async (req, reply) => {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    const ok = await reportProblem(db, user.id, Number(req.params.id), req.body?.kind, req.body?.detail);
    return ok ? reply.code(204).send() : reply.code(400).send({ error: "That report wasn't accepted." });
  });

  app.get('/api/admin/beta', async (req, reply) => {
    if (!(await staffUser(db, req, reply))) return;
    return betaOverview(db);
  });

  app.post('/api/admin/beta/check', async (req, reply) => {
    if (!(await staffUser(db, req, reply))) return;
    return checkAllMatches(db);
  });

  app.post<{ Params: { id: string } }>('/api/admin/problems/:id/resolve', async (req, reply) => {
    if (!(await staffUser(db, req, reply))) return;
    await resolveProblem(db, Number(req.params.id));
    return betaOverview(db);
  });
}
