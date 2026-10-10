// Live updates (GET /api/live): players' open pages hear about changes to their own matches at
// once, never about other people's, and never get game details. Uses a real listening server,
// since a stream that stays open can't be tested with fake requests.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { MatchChange, MatchDetail, MatchSummary } from '../../src/shared/matchApi';
import { buildApp } from '../../server/app';
import { PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

const haveDb = await databaseAvailable();

/** An open live connection, collecting the match changes it hears about. */
interface Listener {
  status: number;
  changes: MatchChange[];
  /** Waits until at least n changes have arrived (or fails after 3 seconds). */
  waitFor(n: number): Promise<MatchChange[]>;
  /** Resolves when the server ends the connection. */
  ended: Promise<void>;
  close(): void;
}

async function listen(baseUrl: string, cookie: string | null): Promise<Listener> {
  const abort = new AbortController();
  const res = await fetch(`${baseUrl}/api/live`, { headers: cookie ? { cookie: `spellstick_session=${cookie}` } : {}, signal: abort.signal });
  const changes: MatchChange[] = [];
  let ended: Promise<void> = Promise.resolve();
  if (res.ok) {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    ended = (async () => {
      let buffer = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = block.split('\n').find((l) => l.startsWith('data: '));
            if (block.includes('event: match') && data) changes.push(JSON.parse(data.slice(6)));
          }
        }
      } catch {
        // Closed by us.
      }
    })();
  }
  return {
    status: res.status,
    changes,
    ended,
    close: () => abort.abort(),
    async waitFor(n) {
      const until = Date.now() + 3000;
      while (changes.length < n) {
        if (Date.now() > until) throw new Error(`Only ${changes.length} of ${n} live updates arrived.`);
        await new Promise((r) => setTimeout(r, 10));
      }
      return changes;
    },
  };
}

describe.skipIf(!haveDb)('live updates', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let baseUrl: string;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const discord = fakeDiscord({
    alice: person('111', 'alice', [PLAYERS_ROLE]),
    bob: person('222', 'bob', [PLAYERS_ROLE]),
    dave: person('444', 'dave', [PLAYERS_ROLE]),
  });

  const api = (who: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    app = await buildApp({ config: testConfig(), db, discord });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    for (const [who, name] of [['alice', 'Alice Hexes'], ['bob', 'Bob Wands'], ['dave', 'Dave']]) {
      cookies[who!] = (await signIn(app, who!)).cookie!;
      await api(who!, 'POST', '/api/me/name', { name });
      ids[who!] = Number((await db.query('select id from users where discord_username = $1', [who])).rows[0].id);
    }
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('needs sign-in', async () => {
    expect((await listen(baseUrl, null)).status).toBe(401);
  });

  it("tells both players about each change to their match, and nobody else", async () => {
    const alice = await listen(baseUrl, cookies.alice!);
    const bob = await listen(baseUrl, cookies.bob!);
    const dave = await listen(baseUrl, cookies.dave!);
    try {
      const challenge = (await api('alice', 'POST', '/api/matches', { opponentId: ids.bob, lanes: 2, team: 'A' })).json<MatchSummary>();
      expect(await bob.waitFor(1)).toEqual([{ matchId: challenge.id, status: 'challenged', moveCount: 0 }]);

      await api('bob', 'POST', `/api/matches/${challenge.id}/accept`);
      expect((await alice.waitFor(2))[1]).toEqual({ matchId: challenge.id, status: 'active', moveCount: 0 });

      const legal = (await api('alice', 'GET', `/api/matches/${challenge.id}`)).json<MatchDetail>().game!.legal;
      await api('alice', 'POST', `/api/matches/${challenge.id}/moves`, { action: legal[0], seen: 0 });
      expect((await bob.waitFor(3))[2]).toEqual({ matchId: challenge.id, status: 'active', moveCount: 1 });

      // A refused move changes nothing, so nobody is told.
      await api('bob', 'POST', `/api/matches/${challenge.id}/moves`, { action: { type: 'shoot', side: 'B' }, seen: 1 });
      await api('alice', 'POST', `/api/matches/${challenge.id}/resign`);
      const bobHeard = await bob.waitFor(4);
      expect(bobHeard[3]).toEqual({ matchId: challenge.id, status: 'finished', moveCount: 1 });
      expect(bobHeard).toHaveLength(4);
      // Dave isn't in the match and hears nothing.
      expect(dave.changes).toEqual([]);
    } finally {
      for (const l of [alice, bob, dave]) l.close();
    }
  });

  it('keeps at most five pages per player, closing the oldest', async () => {
    const pages = [];
    for (let i = 0; i < 6; i++) pages.push(await listen(baseUrl, cookies.dave!));
    await pages[0]!.ended; // the server closed the oldest
    for (const page of pages) page.close();
  });

  it('ends live connections at shutdown, so a deploy is not held up', async () => {
    const other = await buildApp({ config: testConfig(), db, discord });
    const url = await other.listen({ port: 0, host: '127.0.0.1' });
    const page = await listen(url, cookies.alice!);
    const closed = await Promise.race([
      other.close().then(() => 'closed'),
      new Promise((r) => setTimeout(() => r('still open'), 3000)),
    ]);
    expect(closed).toBe('closed');
    await page.ended;
  });
});
