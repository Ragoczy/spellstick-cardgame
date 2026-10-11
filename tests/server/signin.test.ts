// Signing in with Discord, sessions, and picking a name, against a real (test) database.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { buildApp } from '../../server/app';
import { migrate } from '../../server/migrate';
import {
  ACTIVITY_CLIENT_ID, ADMIN_ID, ADMINS_ROLE, MODS_ROLE, PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase,
} from './helpers';

/** The game's address inside Discord. */
const DISCORD_ORIGIN = `https://${ACTIVITY_CLIENT_ID}.discordsays.com`;

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('sign-in with Discord', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const discord = fakeDiscord({
    alice: person('111', 'alice', [PLAYERS_ROLE]),
    bob: person('222', 'bob', [PLAYERS_ROLE]),
    norole: person('333', 'norole', ['some-other-role']),
    outsider: person('444', 'outsider', null),
    owner: person(ADMIN_ID, 'paul', []),
    mod: person('555', 'mod', [MODS_ROLE]),
    boss: person('666', 'boss', [ADMINS_ROLE]),
    // The same person before and after a moderator role is added in Discord.
    carolPlayer: person('777', 'carol', [PLAYERS_ROLE]),
    carolMod: person('777', 'carol', [PLAYERS_ROLE, MODS_ROLE]),
  });

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    app = await buildApp({ config: testConfig(), db, discord });
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  const me = (cookie: string | null) =>
    app.inject({ method: 'GET', url: '/api/me', cookies: cookie ? { spellstick_session: cookie } : {} });
  const setName = (cookie: string, name: unknown) =>
    app.inject({ method: 'POST', url: '/api/me/name', cookies: { spellstick_session: cookie }, payload: { name } });

  it('sends the player to Discord with a state check', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/discord/login' });
    expect(res.statusCode).toBe(302);
    const target = new URL(res.headers.location as string);
    expect(target.host).toBe('discord.com');
    expect(target.searchParams.get('redirect_uri')).toBe('https://spellstick.test/auth/discord/callback');
    const cookie = res.cookies.find((c) => c.name === 'spellstick_oauth_state')!;
    expect(cookie.value).toBe(target.searchParams.get('state'));
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(true);
  });

  it('signs in a member with the role, with a safe session cookie', async () => {
    const login = await app.inject({ method: 'GET', url: '/auth/discord/login' });
    const state = new URL(login.headers.location as string).searchParams.get('state')!;
    const res = await app.inject({
      method: 'GET',
      url: `/auth/discord/callback?code=alice&state=${state}`,
      cookies: { spellstick_oauth_state: state },
    });
    expect(res.headers.location).toBe('/');
    const session = res.cookies.find((c) => c.name === 'spellstick_session')!;
    expect(session.httpOnly).toBe(true);
    expect(session.secure).toBe(true);
    expect(session.sameSite).toBe('Lax');
    expect(session.maxAge).toBe(7 * 24 * 60 * 60);

    const body = (await me(session.value)).json();
    expect(body).toMatchObject({ displayName: null, discordUsername: 'alice', role: 'player' });
  });

  it('stores only a hash of the session, not the cookie value', async () => {
    const { cookie } = await signIn(app, 'alice');
    const { rows } = await db.query('select id_hash from sessions');
    expect(rows.some((r) => r.id_hash === cookie)).toBe(false);
  });

  it('turns away members without the role', async () => {
    expect(await signIn(app, 'norole')).toEqual({ cookie: null, location: '/?signin=no-role' });
  });

  it('turns away people who are not in the server', async () => {
    expect(await signIn(app, 'outsider')).toEqual({ cookie: null, location: '/?signin=not-member' });
  });

  it('lets the admin in without the role, as an admin', async () => {
    const { cookie } = await signIn(app, 'owner');
    expect((await me(cookie)).json()).toMatchObject({ role: 'admin' });
  });

  it('takes moderator and admin roles from Discord', async () => {
    expect((await me((await signIn(app, 'mod')).cookie)).json()).toMatchObject({ role: 'moderator' });
    expect((await me((await signIn(app, 'boss')).cookie)).json()).toMatchObject({ role: 'admin' });
  });

  it('updates the role when Discord roles change, at the next sign-in', async () => {
    expect((await me((await signIn(app, 'carolPlayer')).cookie)).json()).toMatchObject({ role: 'player' });
    expect((await me((await signIn(app, 'carolMod')).cookie)).json()).toMatchObject({ role: 'moderator' });
    expect((await me((await signIn(app, 'carolPlayer')).cookie)).json()).toMatchObject({ role: 'player' });
  });

  it('refuses a callback whose state does not match (a forged sign-in)', async () => {
    await app.inject({ method: 'GET', url: '/auth/discord/login' });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/discord/callback?code=alice&state=forged',
      cookies: { spellstick_oauth_state: 'the-real-one' },
    });
    expect(res.headers.location).toBe('/?signin=failed');
    const none = await app.inject({ method: 'GET', url: '/auth/discord/callback?code=alice&state=x' });
    expect(none.headers.location).toBe('/?signin=failed');
  });

  it('handles the player pressing Cancel on Discord', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/discord/callback?error=access_denied&state=x' });
    expect(res.headers.location).toBe('/?signin=cancelled');
  });

  it('handles Discord failing', async () => {
    expect((await signIn(app, 'unknown-code')).location).toBe('/?signin=failed');
  });

  it('says 401 when not signed in, or with a made-up cookie', async () => {
    expect((await me(null)).statusCode).toBe(401);
    expect((await me('made-up')).statusCode).toBe(401);
  });

  it('lets a player pick a unique manager name', async () => {
    const alice = (await signIn(app, 'alice')).cookie!;
    const bob = (await signIn(app, 'bob')).cookie!;

    const saved = await setName(alice, '  Riverside   Ravens ');
    expect(saved.statusCode).toBe(200);
    expect(saved.json().displayName).toBe('Riverside Ravens');
    expect((await me(alice)).json().displayName).toBe('Riverside Ravens');

    const taken = await setName(bob, 'riverside ravens');
    expect(taken.statusCode).toBe(409);

    expect((await setName(bob, 'x')).statusCode).toBe(400);
    expect((await setName(bob, 42)).statusCode).toBe(400);
  });

  it('keeps the same account when the player signs in again', async () => {
    await signIn(app, 'bob');
    const { rows } = await db.query("select count(*)::int as n from users where discord_id = '222'");
    expect(rows[0].n).toBe(1);
  });

  it('signs out', async () => {
    const { cookie } = await signIn(app, 'alice');
    const res = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { spellstick_session: cookie! } });
    expect(res.statusCode).toBe(200);
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it('refuses posts from other websites', async () => {
    const { cookie } = await signIn(app, 'alice');
    const res = await app.inject({
      method: 'POST', url: '/api/me/name', cookies: { spellstick_session: cookie! },
      headers: { origin: 'https://evil.example' }, payload: { name: 'Hijacked' },
    });
    expect(res.statusCode).toBe(403);
  });

  describe('inside Discord', () => {
    const signInHere = (code: string) =>
      app.inject({ method: 'POST', url: '/api/discord/signin', headers: { origin: DISCORD_ORIGIN }, payload: { code } });

    it('signs in a member with the role, with a cookie that works inside Discord’s frame', async () => {
      const res = await signInHere('alice');
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toMatch(/^spellstick_session=/);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/Secure/);
      expect(setCookie).toMatch(/SameSite=None/);
      expect(setCookie).toMatch(/Partitioned/);
      expect(setCookie).toMatch(/Max-Age=604800/);
      const session = res.cookies.find((c) => c.name === 'spellstick_session')!;
      expect((await me(session.value)).json()).toMatchObject({ discordUsername: 'alice', role: 'player' });
    });

    it('is the same account as signing in from the browser', async () => {
      await signIn(app, 'bob');
      await signInHere('bob');
      const { rows } = await db.query("select count(*)::int as n from users where discord_id = '222'");
      expect(rows[0].n).toBe(1);
    });

    it('turns away people without the role or not in the server, and says why', async () => {
      const noRole = await signInHere('norole');
      expect(noRole.statusCode).toBe(403);
      expect(noRole.json()).toMatchObject({ reason: 'no-role' });
      expect(noRole.cookies).toHaveLength(0);
      const outsider = await signInHere('outsider');
      expect(outsider.statusCode).toBe(403);
      expect(outsider.json()).toMatchObject({ reason: 'not-member' });
    });

    it('takes the role from Discord, as browser sign-in does', async () => {
      const res = await signInHere('mod');
      const session = res.cookies.find((c) => c.name === 'spellstick_session')!;
      expect((await me(session.value)).json()).toMatchObject({ role: 'moderator' });
    });

    it('lets the signed-in player act from Discord’s address, and sign out', async () => {
      const res = await signInHere('alice');
      const cookie = res.cookies.find((c) => c.name === 'spellstick_session')!.value;
      const named = await app.inject({
        method: 'POST', url: '/api/me/name', cookies: { spellstick_session: cookie },
        headers: { origin: DISCORD_ORIGIN }, payload: { name: 'Discord Dragons' },
      });
      expect(named.statusCode).toBe(200);
      const out = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { spellstick_session: cookie }, headers: { origin: DISCORD_ORIGIN } });
      expect(out.statusCode).toBe(200);
      expect((await me(cookie)).statusCode).toBe(401);
    });
  });

  it('does not let expired sessions in', async () => {
    const { cookie } = await signIn(app, 'alice');
    await db.query("update sessions set expires_at = now() - interval '1 minute'");
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it('runs each migration only once', async () => {
    expect(await migrate(db, 'server/migrations')).toEqual([]);
  });

  it('answers the health check', async () => {
    expect((await app.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({ ok: true });
  });
});
