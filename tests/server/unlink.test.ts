// "Unlink my Discord account": revoking Discord's token, deleting the player's data, and keeping
// other players' match history with the leaving player shown as "Deleted player".

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { buildApp } from '../../server/app';
import { discordApi } from '../../server/auth/discord';
import type { MatchDetail, MatchSummary, PlayerListing } from '../../server/matches';
import { PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

describe("revoking Discord's token", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the token to Discord as a form, with the app as Basic auth', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await discordApi({ clientId: 'id', clientSecret: 'secret' }, null).revokeToken('the-token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/v10/oauth2/token/revoke');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);
    const body = new URLSearchParams(String(init.body));
    expect(body.get('token')).toBe('the-token');
    expect(body.get('token_type_hint')).toBe('access_token');
  });

  it('throws when Discord says no', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    await expect(discordApi({ clientId: 'id', clientSecret: 'secret' }, null).revokeToken('t')).rejects.toThrow(/401/);
  });
});

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('unlinking a Discord account', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  // Distinctive details, so the scan for leftovers can't match anything by accident.
  const people = {
    alice: { discordId: '900000000000000001', username: 'alice_unlinks', name: 'Alice Unlinkable' },
    bob: { discordId: '900000000000000002', username: 'bob_stays', name: 'Bob Stays' },
    carol: { discordId: '900000000000000003', username: 'carol_no_matches', name: 'Carol Alone' },
    dave: { discordId: '900000000000000004', username: 'dave_careful', name: 'Dave Careful' },
    erin: { discordId: '900000000000000005', username: 'erin_offline', name: 'Erin Offline' },
  };
  type Who = keyof typeof people;
  const discord = fakeDiscord(Object.fromEntries(
    Object.entries(people).map(([code, p]) => [code, person(p.discordId, p.username, [PLAYERS_ROLE])]),
  ));
  const matches: Record<'finished' | 'active' | 'aliceChallenge' | 'bobChallenge', number> = {} as never;

  const api = (who: Who, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });

  const challenge = async (from: Who, to: Who) =>
    (await api(from, 'POST', '/api/matches', { opponentId: ids[to], lanes: 2, team: 'A' })).json<MatchSummary>().id;

  /** Makes some moves, each by whichever player the match is waiting on. */
  const playSome = async (id: number, count: number) => {
    for (let i = 0; i < count; i++) {
      for (const who of ['alice', 'bob'] as const) {
        const detail = (await api(who, 'GET', `/api/matches/${id}`)).json<MatchDetail>();
        if (detail.game?.legal.length) {
          const res = await api(who, 'POST', `/api/matches/${id}/moves`, { action: detail.game.legal[0], seen: detail.match.moveCount });
          expect(res.statusCode).toBe(200);
          break;
        }
      }
    }
  };

  /** Walks through unlinking like a browser: confirm, go to Discord, come back with a code. */
  const unlink = async (who: Who, options: { code?: string; error?: string } = {}) => {
    const start = await api(who, 'POST', '/auth/discord/unlink', { confirm: 'UNLINK' });
    expect(start.statusCode).toBe(200);
    const state = new URL(start.json<{ url: string }>().url).searchParams.get('state')!;
    const stateCookie = start.cookies.find((c) => c.name === 'spellstick_oauth_state')!;
    const query = options.error ? `error=${options.error}` : `code=${options.code ?? who}`;
    return app.inject({
      method: 'GET',
      url: `/auth/discord/callback?${query}&state=${state}`,
      cookies: { spellstick_oauth_state: stateCookie.value, spellstick_session: cookies[who]! },
    });
  };

  /** Every row in every table, as text, to search for anything left behind. */
  const everything = async (): Promise<string> => {
    const { rows: tables } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE'`,
    );
    let all = '';
    for (const { table_name } of tables) all += JSON.stringify((await db.query(`select * from ${table_name}`)).rows);
    return all;
  };

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    app = await buildApp({ config: testConfig(), db, discord });
    for (const who of Object.keys(people) as Who[]) {
      cookies[who] = (await signIn(app, who)).cookie!;
      await api(who, 'POST', '/api/me/name', { name: people[who].name });
      ids[who] = Number((await db.query('select id from users where discord_username = $1', [people[who].username])).rows[0].id);
    }

    // Alice and Bob: a finished match with moves by both, one in progress, and a challenge each way.
    matches.finished = await challenge('alice', 'bob');
    await api('bob', 'POST', `/api/matches/${matches.finished}/accept`);
    await playSome(matches.finished, 6);
    await api('bob', 'POST', `/api/matches/${matches.finished}/resign`);
    matches.active = await challenge('alice', 'bob');
    await api('bob', 'POST', `/api/matches/${matches.active}/accept`);
    await playSome(matches.active, 4);
    matches.aliceChallenge = await challenge('alice', 'bob');
    matches.bobChallenge = await challenge('bob', 'alice');
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('needs sign-in and the typed confirmation', async () => {
    expect((await app.inject({ method: 'POST', url: '/auth/discord/unlink', payload: { confirm: 'UNLINK' } })).statusCode).toBe(401);
    expect((await api('alice', 'POST', '/auth/discord/unlink', {})).statusCode).toBe(400);
    expect((await api('alice', 'POST', '/auth/discord/unlink', { confirm: 'yes' })).statusCode).toBe(400);
  });

  it('deletes nothing when Discord is signed in to someone else', async () => {
    const res = await unlink('dave', { code: 'bob' });
    expect(res.headers.location).toBe('/?unlink=wrong-account');
    expect(discord.revoked).toEqual([]);
    expect((await api('dave', 'GET', '/api/me')).statusCode).toBe(200);
    expect((await db.query('select 1 from users where discord_id = $1', [people.dave.discordId])).rowCount).toBe(1);
  });

  it('deletes nothing when the player cancels at Discord', async () => {
    const res = await unlink('dave', { error: 'access_denied' });
    expect(res.headers.location).toBe('/?unlink=cancelled');
    expect((await api('dave', 'GET', '/api/me')).statusCode).toBe(200);
  });

  it("revokes Discord's token, signs the player out, and leaves no trace of who they were", async () => {
    const before = await everything();
    expect(before).toContain(people.alice.discordId);

    const res = await unlink('alice');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/?unlinked=1');
    expect(discord.revoked).toEqual(['token-for-alice']);
    // The browser's cookie is cleared, and the old one no longer works anywhere.
    expect(res.cookies.find((c) => c.name === 'spellstick_session')?.value).toBe('');
    expect((await api('alice', 'GET', '/api/me')).statusCode).toBe(401);
    expect((await db.query('select 1 from sessions where user_id = $1', [ids.alice])).rowCount).toBe(0);

    // No row anywhere holds Alice's Discord ID, username, or name.
    expect((await db.query('select 1 from users where discord_id = $1', [people.alice.discordId])).rowCount).toBe(0);
    const after = await everything();
    expect(after).not.toContain(people.alice.discordId);
    expect(after).not.toContain(people.alice.username);
    expect(after).not.toContain(people.alice.name);

    // Her placeholder row keeps nothing but its number.
    const { rows } = await db.query('select * from users where id = $1', [ids.alice]);
    expect(rows[0]).toMatchObject({
      discord_id: null, discord_username: null, discord_avatar: null, discord_created_at: null,
      joined_server_at: null, display_name: null, role: 'player', trade_frozen: false,
    });
    expect(rows[0].unlinked_at).not.toBeNull();
  });

  it('writes an audit entry with only the time and what happened', async () => {
    const { rows, fields } = await db.query('select * from account_events');
    expect(fields.map((f) => f.name).sort()).toEqual(['at', 'event', 'id']);
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('account unlinked');
  });

  it("keeps the other player's history, with the leaver shown as Deleted player", async () => {
    const list = (await api('bob', 'GET', '/api/matches')).json<MatchSummary[]>();
    const byId = new Map(list.map((m) => [m.id, m]));
    for (const id of Object.values(matches)) expect(byId.get(id)?.opponent.name).toBe('Deleted player');

    // The finished match is unchanged, and can still be replayed.
    expect(byId.get(matches.finished)).toMatchObject({ status: 'finished', result: { outcome: 'lost', reason: 'resigned' } });
    const replay = (await api('bob', 'GET', `/api/matches/${matches.finished}`)).json<MatchDetail>();
    expect(replay.game?.events.length).toBeGreaterThan(1);
    expect((await db.query('select 1 from match_events where match_id = $1 and player_id = $2', [matches.finished, ids.alice])).rowCount).toBeGreaterThan(0);

    // The match in progress counts as resigned, so Bob wins. Open challenges are turned down.
    expect(byId.get(matches.active)).toMatchObject({ status: 'finished', result: { outcome: 'won', reason: 'resigned' } });
    expect(byId.get(matches.aliceChallenge)?.status).toBe('declined');
    expect(byId.get(matches.bobChallenge)?.status).toBe('declined');
  });

  it("can't be found or challenged after leaving", async () => {
    const found = (await api('bob', 'GET', '/api/players')).json<PlayerListing[]>();
    expect(found.some((p) => p.id === ids.alice)).toBe(false);
    const res = await api('bob', 'POST', '/api/matches', { opponentId: ids.alice, lanes: 2, team: 'A' });
    expect(res.statusCode).toBe(404);
  });

  it('deletes a player with no matches outright', async () => {
    expect((await unlink('carol')).headers.location).toBe('/?unlinked=1');
    expect((await db.query('select 1 from users where id = $1', [ids.carol])).rowCount).toBe(0);
    expect(await everything()).not.toContain(people.carol.discordId);
  });

  it("still deletes the player's data if Discord can't revoke the token", async () => {
    discord.failRevoke = true;
    try {
      expect((await unlink('erin')).headers.location).toBe('/?unlinked=1');
    } finally {
      discord.failRevoke = false;
    }
    expect((await db.query('select 1 from users where discord_id = $1', [people.erin.discordId])).rowCount).toBe(0);
  });

  it('starts fresh when the player signs in again', async () => {
    const { cookie } = await signIn(app, 'alice');
    const me = await app.inject({ method: 'GET', url: '/api/me', cookies: { spellstick_session: cookie! } });
    expect(me.json()).toMatchObject({ displayName: null, discordUsername: people.alice.username });
    const { rows } = await db.query('select id from users where discord_id = $1', [people.alice.discordId]);
    expect(Number(rows[0].id)).not.toBe(ids.alice);
    const list = await app.inject({ method: 'GET', url: '/api/matches', cookies: { spellstick_session: cookie! } });
    expect(list.json()).toEqual([]);
  });
});
