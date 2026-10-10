// The browser's online client (src/ui/onlineMatch.ts) against the real game server: two players
// play a whole match, and at the end each one's screen agrees exactly with the server. This is
// the "no state disagreements between client and server" check from the online roadmap.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { Action, GameEvent } from '../../src/engine';
import type { MatchDetail, MatchSummary } from '../../src/shared/matchApi';
import { OnlineMatchClient, StaleMatchError, type MatchApi } from '../../src/ui/onlineMatch';
import { buildApp } from '../../server/app';
import { PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('online client against the game server', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};

  /** The client's server calls, made through the test app as one player. */
  const apiFor = (who: string): MatchApi => {
    const send = async <T>(method: 'GET' | 'POST', url: string, payload?: object): Promise<T> => {
      const res = await app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });
      const body = res.json();
      if (res.statusCode === 409 && body.code === 'stale') throw new StaleMatchError(body.error);
      if (res.statusCode >= 400) throw new Error(body.error);
      return body as T;
    };
    return {
      get: (id, since) => send('GET', `/api/matches/${id}${since === undefined ? '' : `?since=${since}`}`),
      move: (id, action: Action, seen) => send('POST', `/api/matches/${id}/moves`, { action, seen }),
      resign: (id) => send<MatchSummary>('POST', `/api/matches/${id}/resign`),
    };
  };

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    const discord = fakeDiscord({ alice: person('111', 'alice', [PLAYERS_ROLE]), bob: person('222', 'bob', [PLAYERS_ROLE]) });
    app = await buildApp({ config: testConfig(), db, discord });
    for (const [who, name] of [['alice', 'Alice Hexes'], ['bob', 'Bob Wands']] as const) {
      cookies[who] = (await signIn(app, who)).cookie!;
      await app.inject({ method: 'POST', url: '/api/me/name', cookies: { spellstick_session: cookies[who] }, payload: { name } });
    }
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('two players finish a match and their screens match the server', { timeout: 120_000 }, async () => {
    const alice = apiFor('alice');
    const bob = apiFor('bob');
    const bobId = (await app.inject({ method: 'GET', url: '/api/players?name=Bob', cookies: { spellstick_session: cookies.alice! } })).json()[0].id;
    const challenge = await app.inject({
      method: 'POST', url: '/api/matches', cookies: { spellstick_session: cookies.alice! }, payload: { opponentId: bobId, lanes: 3, team: 'A' },
    });
    const id = challenge.json<MatchSummary>().id;
    await app.inject({ method: 'POST', url: `/api/matches/${id}/accept`, cookies: { spellstick_session: cookies.bob! } });

    // Each player's client, keeping every event it was given, as the play-by-play would.
    const players = await Promise.all([alice, bob].map(async (api) => {
      const initial = await api.get(id);
      const seen: GameEvent[] = initial.game!.events.flatMap((m) => m.events);
      const problems: string[] = [];
      const client = new OnlineMatchClient(api, initial, {
        onUpdate: (_d, events) => seen.push(...events),
        onSending: () => {},
        onProblem: (p) => { if (p) problems.push(p); },
      });
      return { api, client, seen, problems };
    }));

    for (let guard = 0; guard < 3000; guard++) {
      if (players.every((p) => p.client.seat.waitingFor === 'over')) break;
      for (const p of players) {
        // The player whose decision it is moves (placing the lineup all at once, like the screen
        // does); the other checks for news, as the screen does every few seconds.
        if (p.client.seat.waitingFor === 'human') {
          if (p.client.seat.view.pending.kind === 'placeLineup') p.client.autoPlace();
          else p.client.act(p.client.seat.hint()!);
        } else {
          p.client.refresh();
        }
        await p.client.idle();
      }
    }

    for (const p of players) {
      expect(p.problems).toEqual([]);
      expect(p.client.seat.waitingFor).toBe('over');
      // What the screen shows is exactly what the server says now...
      const fresh: MatchDetail = await p.api.get(id);
      expect(p.client.seat.view).toEqual(fresh.game!.view);
      // ...and the play-by-play got every event once, in order.
      expect(p.seen).toEqual(fresh.game!.events.flatMap((m) => m.events));
    }
    expect(players[0]!.client.detail.match.result).not.toBeNull();
  });
});
