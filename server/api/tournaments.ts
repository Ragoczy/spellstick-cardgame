// Tournaments and redeem codes. The rules live in ../tournaments.ts and ../codes.ts; this file
// only reads requests and sends answers.
//
//   GET  /api/tournaments                       tournaments open for entry, under way, and finished
//   GET  /api/tournaments/:id                   one tournament: standings, pairings, and how you're doing
//   POST /api/tournaments/:id/enter             enter: { teamId } for a saved-team event
//   POST /api/tournaments/:id/leave             before the start, withdraw; after it, drop out
//   POST /api/redeem                            use a redeem code: { code }
//   POST /api/admin/tournaments                 admins: set one up (TournamentInput)
//   POST /api/admin/tournaments/:id/start       admins: close entries and pair round 1
//   POST /api/admin/tournaments/:id/cancel      admins: call it off
//   POST /api/admin/tournaments/:id/prize-sent  admins: the top prize is on its way
//   GET  /api/admin/codes                       admins: recent redeem codes
//   POST /api/admin/codes                       admins: make a batch of codes (RedeemCodeInput)

import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { AppDeps } from '../app';
import { currentUser } from '../auth/current-user';
import { CodeError, createCodes, listCodes, redeemCode } from '../codes';
import type { LiveHub } from '../live';
import { inTransaction, type ClockNotice } from '../matches';
import type { Notifier } from '../notify';
import {
  advanceTournaments, cancelTournament, createTournament, enterTournament, getTournament, leaveTournament, listTournaments,
  markPrizeSent, startTournament, TournamentError,
} from '../tournaments';
import type { User } from '../users';

type IdParams = { Params: { id: string } };

/** Wrong redeem codes a player can try in an hour, so codes can't be guessed. */
export const CODE_TRIES_PER_HOUR = 10;

/**
 * Keeps tournaments moving: pairs the next round once a round is over, and settles matches at
 * the round deadline. Runs every so often, and soon after any tournament match ends.
 */
export class TournamentRunner {
  private running: Promise<void> | null = null;
  private again = false;

  constructor(private db: pg.Pool, private live: LiveHub, private notifier: Notifier, private log: FastifyBaseLogger) {}

  /** Tells the players of matches that started or changed. */
  tell(notices: ClockNotice[]): void {
    for (const notice of notices) {
      this.live.matchChanged(notice.playerIds, notice.change);
      if (notice.change.status === 'active') this.notifier.later(this.notifier.matchWaiting(notice.change.matchId));
    }
  }

  /** Brings every tournament up to date. If a run is already going, one more follows it. */
  run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        this.tell(await advanceTournaments(this.db));
      } while (this.again);
    })().finally(() => { this.running = null; });
    return this.running;
  }

  /** run(), without waiting for it. */
  soon(): void {
    this.run().catch((err) => this.log.error(err, 'tournament update failed'));
  }
}

export function tournamentRoutes(app: FastifyInstance, deps: AppDeps, runner: TournamentRunner): void {
  const { db } = deps;

  if (deps.config.clockCheckMs > 0) {
    const timer = setInterval(() => runner.soon(), deps.config.clockCheckMs);
    app.addHook('onClose', async () => clearInterval(timer));
  }

  /** Runs a handler for a signed-in player (admins only if asked), turning problems into plain answers. */
  async function signedIn<T>(req: FastifyRequest, reply: FastifyReply, handler: (user: User) => Promise<T>, adminOnly = false) {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    if (adminOnly && user.role !== 'admin') return reply.code(403).send({ error: 'Only admins can do this.' });
    try {
      return await handler(user);
    } catch (err) {
      if (err instanceof TournamentError || err instanceof CodeError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  }

  /** Brings tournaments up to date first, so a page shows the latest round. */
  const fresh = async () => {
    await runner.run();
  };

  app.get('/api/tournaments', (req, reply) =>
    signedIn(req, reply, async (user) => {
      await fresh();
      return listTournaments(db, user);
    }));

  app.get<IdParams>('/api/tournaments/:id', (req, reply) =>
    signedIn(req, reply, async (user) => {
      await fresh();
      return getTournament(db, user, Number(req.params.id));
    }));

  app.post<IdParams & { Body: { teamId?: unknown } | undefined }>('/api/tournaments/:id/enter', (req, reply) =>
    signedIn(req, reply, async (user) => {
      await inTransaction(db, (client) => enterTournament(client, user, Number(req.params.id), req.body?.teamId));
      return getTournament(db, user, Number(req.params.id));
    }));

  app.post<IdParams>('/api/tournaments/:id/leave', (req, reply) =>
    signedIn(req, reply, async (user) => {
      runner.tell(await inTransaction(db, (client) => leaveTournament(client, user, Number(req.params.id))));
      await fresh();
      return getTournament(db, user, Number(req.params.id));
    }));

  // Wrong codes per player in the last hour (kept in memory: a restart forgets them, which is fine).
  const wrongCodes = new Map<number, number[]>();
  app.post<{ Body: { code?: unknown } | undefined }>('/api/redeem', (req, reply) =>
    signedIn(req, reply, async (user) => {
      const hourAgo = Date.now() - 3_600_000;
      const recent = (wrongCodes.get(user.id) ?? []).filter((at) => at > hourAgo);
      if (recent.length >= CODE_TRIES_PER_HOUR) {
        return reply.code(429).send({ error: 'Too many codes that didn\'t work. Try again in an hour.' });
      }
      try {
        return await inTransaction(db, (client) => redeemCode(client, user, req.body?.code));
      } catch (err) {
        if (err instanceof CodeError && err.status === 404) wrongCodes.set(user.id, [...recent, Date.now()]);
        throw err;
      }
    }));

  app.post<{ Body: Record<string, unknown> | undefined }>('/api/admin/tournaments', (req, reply) =>
    signedIn(req, reply, async (user) => reply.code(201).send(await inTransaction(db, (client) => createTournament(client, user, req.body ?? {}))), true));

  app.post<IdParams>('/api/admin/tournaments/:id/start', (req, reply) =>
    signedIn(req, reply, async (user) => {
      runner.tell(await inTransaction(db, (client) => startTournament(client, user, Number(req.params.id))));
      return getTournament(db, user, Number(req.params.id));
    }, true));

  app.post<IdParams>('/api/admin/tournaments/:id/cancel', (req, reply) =>
    signedIn(req, reply, async (user) => {
      await inTransaction(db, (client) => cancelTournament(client, user, Number(req.params.id)));
      return getTournament(db, user, Number(req.params.id));
    }, true));

  app.post<IdParams>('/api/admin/tournaments/:id/prize-sent', (req, reply) =>
    signedIn(req, reply, async (user) => {
      await inTransaction(db, (client) => markPrizeSent(client, user, Number(req.params.id)));
      return getTournament(db, user, Number(req.params.id));
    }, true));

  app.get('/api/admin/codes', (req, reply) => signedIn(req, reply, () => listCodes(db), true));

  app.post<{ Body: Record<string, unknown> | undefined }>('/api/admin/codes', (req, reply) =>
    signedIn(req, reply, async (user) => reply.code(201).send(await inTransaction(db, (client) => createCodes(client, user, req.body ?? {}))), true));
}
