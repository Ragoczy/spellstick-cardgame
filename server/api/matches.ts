// Online matches between two signed-in players. The rules live in ../matches.ts; this file only
// reads requests and sends answers.
//
//   GET  /api/players?name=Riv           players to challenge (names starting with the text)
//   GET  /api/matches                    your matches
//   POST /api/matches                    challenge someone: { opponentId, lanes, team, pace, players: 'draft' | 'dealt' }
//   GET  /api/matches/:id?since=n        one match: your view, your legal moves, and events after move n
//   POST /api/matches/:id/accept         accept a challenge
//   POST /api/matches/:id/decline        turn down a challenge, or withdraw your own
//   POST /api/matches/:id/resign         give up a match in progress
//   POST /api/matches/:id/moves          make a move: { action, seen } (seen = the match's moveCount)
//   GET  /api/live                       live updates: an event each time one of your matches changes

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app';
import { currentUser } from '../auth/current-user';
import {
  acceptChallenge, createChallenge, declineChallenge, findPlayers, getMatch, listMatches, makeMove, MatchError, resign, settleOverdue,
  type MatchDetail, type MatchSummary,
} from '../matches';
import type { LiveHub } from '../live';
import type { User } from '../users';

type IdParams = { Params: { id: string } };

export function matchRoutes(app: FastifyInstance, deps: AppDeps, live: LiveHub): void {
  const { db } = deps;

  /** Tells both players' open pages that the match changed, then passes the answer on. */
  function changed<T extends MatchSummary | MatchDetail>(user: User, result: T): T {
    const match: MatchSummary = 'match' in result ? result.match : (result as MatchSummary);
    live.matchChanged([user.id, match.opponent.id], { matchId: match.id, status: match.status, moveCount: match.moveCount });
    return result;
  }

  /** Deals with any time banks that have run out, and tells the players. */
  async function settleClocks(): Promise<void> {
    for (const notice of await settleOverdue(db)) live.matchChanged(notice.playerIds, notice.change);
  }

  // Check the clocks every so often. (Requests check too, so a deadline is kept even when the
  // server was asleep at the time.)
  if (deps.config.clockCheckMs > 0) {
    const timer = setInterval(() => {
      settleClocks().catch((err) => app.log.error(err, 'clock check failed'));
    }, deps.config.clockCheckMs);
    app.addHook('onClose', async () => clearInterval(timer));
  }

  /** Runs a handler for a signed-in player, turning MatchErrors into plain-language answers. */
  async function signedIn<T>(req: FastifyRequest, reply: FastifyReply, handler: (user: User) => Promise<T>) {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    await settleClocks();
    try {
      return await handler(user);
    } catch (err) {
      if (err instanceof MatchError) return reply.code(err.status).send({ error: err.message, ...(err.code ? { code: err.code } : {}) });
      throw err;
    }
  }

  app.get<{ Querystring: { name?: string } }>('/api/players', (req, reply) =>
    signedIn(req, reply, (user) => findPlayers(db, user, String(req.query.name ?? '').slice(0, 24))));

  app.get('/api/matches', (req, reply) => signedIn(req, reply, (user) => listMatches(db, user)));

  app.post<{ Body: { opponentId?: unknown; lanes?: unknown; team?: unknown; pace?: unknown; players?: unknown } | undefined }>('/api/matches', (req, reply) =>
    signedIn(req, reply, async (user) => {
      const body = req.body ?? {};
      const match = await createChallenge(db, user, { opponentId: body.opponentId, lanes: body.lanes, team: body.team, pace: body.pace, players: body.players });
      return reply.code(201).send(changed(user, match));
    }));

  app.get<IdParams & { Querystring: { since?: string } }>('/api/matches/:id', (req, reply) =>
    signedIn(req, reply, (user) => {
      const since = req.query.since === undefined ? -1 : Number(req.query.since);
      return getMatch(db, user, Number(req.params.id), Number.isInteger(since) ? since : -1);
    }));

  app.post<IdParams>('/api/matches/:id/accept', (req, reply) =>
    signedIn(req, reply, async (user) => changed(user, await acceptChallenge(db, user, Number(req.params.id)))));

  app.post<IdParams>('/api/matches/:id/decline', (req, reply) =>
    signedIn(req, reply, async (user) => changed(user, await declineChallenge(db, user, Number(req.params.id)))));

  app.post<IdParams>('/api/matches/:id/resign', (req, reply) =>
    signedIn(req, reply, async (user) => changed(user, await resign(db, user, Number(req.params.id)))));

  app.post<IdParams & { Body: { action?: unknown; seen?: unknown } | undefined }>('/api/matches/:id/moves', (req, reply) =>
    signedIn(req, reply, async (user) => changed(user, await makeMove(db, user, Number(req.params.id), req.body?.action, req.body?.seen))));

  app.get('/api/live', async (req, reply) => {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    live.open(user.id, reply);
  });
}
