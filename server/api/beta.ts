// Beta readiness: problem reports from players' browsers, and the moderator dashboard.
//
//   POST /api/matches/:id/problems        a player's browser reports a problem: { kind, detail }
//   GET  /api/admin/beta                  moderators and admins: progress to the gate, problems, recent matches
//   POST /api/admin/beta/check            moderators and admins: replay every match now and look for problems
//   POST /api/admin/problems/:id/resolve  moderators and admins: mark a problem dealt with

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app';
import { currentUser } from '../auth/current-user';
import { betaOverview, checkAllMatches, reportProblem, resolveProblem } from '../beta';

export function betaRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Only moderators and admins (roles come from Discord at sign-in). */
  async function staffOnly(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const user = await currentUser(db, req);
    if (!user) {
      reply.code(401).send({ error: 'Not signed in.' });
      return false;
    }
    if (user.role !== 'moderator' && user.role !== 'admin') {
      reply.code(403).send({ error: 'Only moderators can see this.' });
      return false;
    }
    return true;
  }

  app.post<{ Params: { id: string }; Body: { kind?: unknown; detail?: unknown } | undefined }>('/api/matches/:id/problems', async (req, reply) => {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    const ok = await reportProblem(db, user.id, Number(req.params.id), req.body?.kind, req.body?.detail);
    return ok ? reply.code(204).send() : reply.code(400).send({ error: "That report wasn't accepted." });
  });

  app.get('/api/admin/beta', async (req, reply) => {
    if (!(await staffOnly(req, reply))) return;
    return betaOverview(db);
  });

  app.post('/api/admin/beta/check', async (req, reply) => {
    if (!(await staffOnly(req, reply))) return;
    return checkAllMatches(db);
  });

  app.post<{ Params: { id: string } }>('/api/admin/problems/:id/resolve', async (req, reply) => {
    if (!(await staffOnly(req, reply))) return;
    await resolveProblem(db, Number(req.params.id));
    return betaOverview(db);
  });
}
