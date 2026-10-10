// The signed-in player's own details.
//
//   GET  /api/me       who you are (401 if not signed in)
//   POST /api/me/name  pick your manager name: { "name": "..." }

import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { currentUser } from '../auth/current-user';
import { checkDisplayName, normalizeDisplayName, setDisplayName, type User } from '../users';

/** What the browser gets back. The Discord handle is the player's own, so it's fine to show them. */
export interface MeResponse {
  displayName: string | null;
  /** Shown to the player only when they report a problem, so the admin can find their account. */
  discordId: string;
  discordUsername: string;
  avatarUrl: string | null;
  role: User['role'];
}

function toResponse(user: User): MeResponse {
  return {
    displayName: user.displayName,
    discordId: user.discordId,
    discordUsername: user.discordUsername,
    avatarUrl: user.discordAvatar ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.png?size=64` : null,
    role: user.role,
  };
}

export function meRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/me', async (req, reply) => {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    return toResponse(user);
  });

  app.post<{ Body: { name?: unknown } }>('/api/me/name', async (req, reply) => {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    const raw = req.body?.name;
    if (typeof raw !== 'string') return reply.code(400).send({ error: 'Please enter a name.' });
    const name = normalizeDisplayName(raw);
    const problem = checkDisplayName(name);
    if (problem) return reply.code(400).send({ error: problem });
    if (!(await setDisplayName(db, user.id, name))) return reply.code(409).send({ error: 'Someone already has that name.' });
    return toResponse({ ...user, displayName: name });
  });
}
