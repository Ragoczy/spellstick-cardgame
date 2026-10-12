// Your cards and saved teams. The rules live in ../collection.ts; this file only reads requests
// and sends answers.
//
//   GET  /api/collection         your cards and teams (the first visit gives you the starter set)
//   POST /api/teams              save a new team: { name, spellSet, cards } (cards = instance ids)
//   POST /api/teams/:id          change a team: { name, spellSet, cards }
//   POST /api/teams/:id/delete   delete a team (the cards stay yours)

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app';
import { currentUser } from '../auth/current-user';
import { CollectionError, createTeam, deleteTeam, getCollection, grantStarter, updateTeam } from '../collection';
import { inTransaction } from '../matches';
import type { User } from '../users';

type IdParams = { Params: { id: string } };
type TeamBody = { Body: { name?: unknown; spellSet?: unknown; cards?: unknown } | undefined };

export function collectionRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Runs a handler for a signed-in player, turning CollectionErrors into plain-language answers. */
  async function signedIn<T>(req: FastifyRequest, reply: FastifyReply, handler: (user: User) => Promise<T>) {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    try {
      return await handler(user);
    } catch (err) {
      if (err instanceof CollectionError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  }

  app.get('/api/collection', (req, reply) =>
    signedIn(req, reply, (user) => inTransaction(db, async (client) => {
      await grantStarter(client, user.id);
      return getCollection(client, user);
    })));

  app.post<TeamBody>('/api/teams', (req, reply) =>
    signedIn(req, reply, async (user) => reply.code(201).send(await inTransaction(db, (client) => createTeam(client, user, req.body ?? {})))));

  app.post<IdParams & TeamBody>('/api/teams/:id', (req, reply) =>
    signedIn(req, reply, (user) => inTransaction(db, (client) => updateTeam(client, user, teamId(req.params.id), req.body ?? {}))));

  app.post<IdParams>('/api/teams/:id/delete', (req, reply) =>
    signedIn(req, reply, async (user) => {
      await inTransaction(db, (client) => deleteTeam(client, user, teamId(req.params.id)));
      return { ok: true };
    }));
}

function teamId(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) throw new CollectionError(404, 'No such team.');
  return id;
}
