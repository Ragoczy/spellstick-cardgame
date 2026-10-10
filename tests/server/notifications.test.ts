// Discord notifications, against a real (test) database with a fake bot: nothing is sent unless
// the player turned that kind on, and alerts are spaced out and skipped when not needed.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { MatchDetail, MatchSummary } from '../../src/shared/matchApi';
import { buildApp } from '../../server/app';
import { DM_FOOTER, type DiscordBot } from '../../server/notify';
import { PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('Discord notifications', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const sent: { to: string; text: string }[] = [];
  const bot: DiscordBot = {
    async sendDm(to, text) {
      sent.push({ to, text });
      return true;
    },
  };
  const discord = fakeDiscord({ alice: person('111', 'alice', [PLAYERS_ROLE]), bob: person('222', 'bob', [PLAYERS_ROLE]) });

  const api = (who: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });
  const turnOn = (who: string, kind: string, enabled = true) => api(who, 'POST', '/api/me/notifications', { kind, enabled });
  /** Notifications go out just after the request; give them a moment. */
  const settle = () => new Promise((r) => setTimeout(r, 150));
  const challenge = async () => {
    const res = await api('alice', 'POST', '/api/matches', { opponentId: ids.bob, lanes: 2, team: 'A' });
    return res.json<MatchSummary>().id;
  };
  const playFirst = async (who: string, id: number) => {
    const d = (await api(who, 'GET', `/api/matches/${id}`)).json<MatchDetail>();
    return api(who, 'POST', `/api/matches/${id}/moves`, { action: d.game!.legal[0], seen: d.match.moveCount });
  };

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    app = await buildApp({ config: testConfig(), db, discord, bot });
    for (const [who, name] of [['alice', 'Alice Hexes'], ['bob', 'Bob Wands']] as const) {
      cookies[who] = (await signIn(app, who)).cookie!;
      await api(who, 'POST', '/api/me/name', { name });
      ids[who] = Number((await db.query('select id from users where discord_username = $1', [who])).rows[0].id);
    }
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('every kind starts off, and nothing is sent', async () => {
    const settings = (await api('bob', 'GET', '/api/me/notifications')).json();
    expect(settings.available).toBe(true);
    expect(settings.kinds.map((k: { kind: string; enabled: boolean }) => [k.kind, k.enabled])).toEqual([
      ['challenge', false], ['your_turn', false], ['time_low', false],
    ]);
    await challenge();
    await settle();
    expect(sent).toEqual([]);
  });

  it('a challenge alert, once turned on, names the challenger, links the match, and says how to turn it off', async () => {
    await turnOn('bob', 'challenge');
    const id = await challenge();
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('222');
    expect(sent[0]!.text).toContain('Alice Hexes challenged you');
    expect(sent[0]!.text).toContain(`/?match=${id}`);
    expect(sent[0]!.text.endsWith(DM_FOOTER)).toBe(true);
    // Turning it off again stops it.
    await turnOn('bob', 'challenge', false);
    await challenge();
    await settle();
    expect(sent).toHaveLength(1);
  });

  it('"your move" goes to the waiting player, at most once every 30 minutes per match', async () => {
    sent.length = 0;
    await turnOn('alice', 'your_turn');
    await turnOn('bob', 'your_turn');
    const id = await challenge();
    await api('bob', 'POST', `/api/matches/${id}/accept`); // now waiting on Alice (she chooses a goalie first)
    await settle();
    expect(sent.map((m) => m.to)).toEqual(['111']);
    expect(sent[0]!.text).toContain('your move against Bob Wands');
    await playFirst('alice', id); // now waiting on Bob
    await settle();
    expect(sent.map((m) => m.to)).toEqual(['111', '222']);
    await playFirst('bob', id); // back to Alice, but she had one a moment ago
    await settle();
    expect(sent).toHaveLength(2);
  });

  it('a player with the game open gets no "your move" alert', async () => {
    sent.length = 0;
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    const abort = new AbortController();
    const live = await fetch(`${baseUrl}/api/live`, { headers: { cookie: `spellstick_session=${cookies.alice}` }, signal: abort.signal });
    expect(live.status).toBe(200);
    const id = await challenge();
    await api('bob', 'POST', `/api/matches/${id}/accept`);
    await settle();
    expect(sent).toEqual([]);
    abort.abort();
  });

  it('warns once when 6 hours are left in an async time bank', async () => {
    sent.length = 0;
    await turnOn('alice', 'time_low');
    const id = await challenge();
    await api('bob', 'POST', `/api/matches/${id}/accept`);
    await settle();
    sent.length = 0;
    await db.query(`update matches set waiting_due = now() + interval '5 hours' where id = $1`, [id]);
    const { Notifier } = await import('../../server/notify');
    const { LiveHub } = await import('../../server/live');
    const notifier = new Notifier(db, bot, new LiveHub(), 'https://spellstick.test', () => {});
    await notifier.checkTimeBanks();
    await notifier.checkTimeBanks();
    const warnings = sent.filter((m) => m.text.includes('6 hours are left'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.to).toBe('111');
  });

  it('refuses unknown kinds', async () => {
    expect((await turnOn('alice', 'newsletter')).statusCode).toBe(400);
    expect((await api('alice', 'POST', '/api/me/notifications', { kind: 'challenge', enabled: 'yes' })).statusCode).toBe(400);
  });
});
