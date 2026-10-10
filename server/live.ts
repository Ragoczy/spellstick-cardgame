// Live updates: tells a player's open pages the moment one of their matches changes.
//
// Uses Server-Sent Events (a long-running GET that the server writes lines to), which browsers
// support natively through EventSource, reconnecting by themselves if the connection drops.
// Messages carry no game information, only "match 12 changed, it's now at move 40". The page
// then asks for its own view as usual, so hidden cards stay protected by the same code as ever.
//
// This only works with one copy of the server (Azure max replicas = 1). With more, messages
// would need to go through a shared service such as Azure Web PubSub.

import type { FastifyReply } from 'fastify';
import type { MatchChange } from '../src/shared/matchApi';

/** A comment line every so often, so Azure's front door doesn't close a quiet connection (it gives up after 240 seconds). */
const HEARTBEAT_MS = 25_000;
/** Connections are closed after this long; the browser reconnects at once, which re-checks sign-in. */
const MAX_CONNECTION_MS = 30 * 60_000;
/** Open pages per player. Opening one more closes their oldest. */
const MAX_PER_PLAYER = 5;

interface Connection {
  reply: FastifyReply;
  timers: NodeJS.Timeout[];
}

export class LiveHub {
  private readonly byUser = new Map<number, Connection[]>();

  /** Starts a live connection for a signed-in player. The request stays open until one side closes it. */
  open(userId: number, reply: FastifyReply): void {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
      // Ask any proxy along the way not to hold the stream back.
      'X-Accel-Buffering': 'no',
    });
    // How long the browser waits before reconnecting after a drop.
    res.write('retry: 3000\n\n');

    const connection: Connection = { reply, timers: [] };
    connection.timers.push(setInterval(() => res.write(': still here\n\n'), HEARTBEAT_MS));
    connection.timers.push(setTimeout(() => this.close(userId, connection), MAX_CONNECTION_MS));
    reply.request.raw.on('close', () => this.forget(userId, connection));

    const list = this.byUser.get(userId) ?? [];
    list.push(connection);
    this.byUser.set(userId, list);
    while (list.length > MAX_PER_PLAYER) this.close(userId, list[0]!);
  }

  /** Tells these players' open pages that a match changed. */
  matchChanged(userIds: number[], change: MatchChange): void {
    const line = `event: match\ndata: ${JSON.stringify(change)}\n\n`;
    for (const userId of new Set(userIds)) {
      for (const connection of this.byUser.get(userId) ?? []) connection.reply.raw.write(line);
    }
  }

  /** How many pages are connected (for tests and logs). */
  get connectionCount(): number {
    let n = 0;
    for (const list of this.byUser.values()) n += list.length;
    return n;
  }

  /** Ends every connection, so the server can shut down straight away during a deploy. */
  closeAll(): void {
    for (const [userId, list] of this.byUser) for (const connection of [...list]) this.close(userId, connection);
  }

  private close(userId: number, connection: Connection): void {
    this.forget(userId, connection);
    connection.reply.raw.end();
  }

  private forget(userId: number, connection: Connection): void {
    for (const timer of connection.timers) clearTimeout(timer);
    const list = this.byUser.get(userId);
    if (!list) return;
    const i = list.indexOf(connection);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) this.byUser.delete(userId);
  }
}
