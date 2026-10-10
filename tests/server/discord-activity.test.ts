// The game inside Discord (a Discord Activity): the token endpoint, the frame and origin rules,
// and its settings. None of this touches the database, so it runs without Postgres.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { buildApp } from '../../server/app';
import { readConfig } from '../../server/config';
import { ACTIVITY_CLIENT_ID, fakeDiscord, person, PLAYERS_ROLE, testConfig } from './helpers';

const DISCORD_ORIGIN = `https://${ACTIVITY_CLIENT_ID}.discordsays.com`;

describe('Discord Activity token endpoint', () => {
  // A pool that is never used: these routes don't touch the database.
  const db = new pg.Pool({ connectionString: 'postgres://unused@localhost:1/unused' });
  const discord = fakeDiscord({ alice: person('111', 'alice', [PLAYERS_ROLE]) });
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ config: testConfig(), db, discord });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  const post = (body: unknown, origin = DISCORD_ORIGIN) =>
    app.inject({ method: 'POST', url: '/api/discord/token', headers: { origin }, payload: body as object });

  it('trades a code for an access token and returns only the token', async () => {
    const res = await post({ code: 'alice' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ access_token: 'activity-token-for-alice' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.cookies).toHaveLength(0);
  });

  it('refuses a missing or odd code without asking Discord', async () => {
    const before = discord.exchanged.length;
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ code: 42 })).statusCode).toBe(400);
    expect((await post({ code: 'x'.repeat(201) })).statusCode).toBe(400);
    expect(discord.exchanged.length).toBe(before);
  });

  it('reports a code Discord turns down', async () => {
    const res = await post({ code: 'not-a-real-code' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).not.toHaveProperty('access_token');
  });

  it('accepts posts from the game itself too', async () => {
    expect((await post({ code: 'alice' }, 'https://spellstick.test')).statusCode).toBe(200);
  });

  it("allows Discord's address only for the token endpoint", async () => {
    expect((await post({ code: 'alice' }, 'https://evil.test')).statusCode).toBe(403);
    expect((await post({ code: 'alice' }, 'https://999.discordsays.com')).statusCode).toBe(403);
    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: { origin: DISCORD_ORIGIN } });
    expect(logout.statusCode).toBe(403);
  });

  it('lets only this site and Discord show the game in a frame', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['content-security-policy']).toBe(
      `frame-ancestors 'self' https://discord.com https://ptb.discord.com https://canary.discord.com ${DISCORD_ORIGIN}`,
    );
    expect(res.headers['x-frame-options']).toBeUndefined();
  });
});

describe('Discord Activity settings', () => {
  const base = {
    PUBLIC_URL: 'https://example.test',
    DATABASE_URL: 'postgres://x',
    DISCORD_CLIENT_ID: 'shared-id',
    DISCORD_CLIENT_SECRET: 'shared-secret',
    DISCORD_GUILD_ID: 'guild',
  };

  it('uses the shared Discord app when no Activity app is set', () => {
    expect(readConfig(base).discordActivity).toEqual({ clientId: 'shared-id', clientSecret: 'shared-secret' });
  });

  it('uses its own Discord app when one is set', () => {
    const config = readConfig({ ...base, DISCORD_ACTIVITY_CLIENT_ID: 'activity-id', DISCORD_ACTIVITY_CLIENT_SECRET: 'activity-secret' });
    expect(config.discordActivity).toEqual({ clientId: 'activity-id', clientSecret: 'activity-secret' });
    expect(config.discord.clientId).toBe('shared-id');
  });

  it('warns and turns the Activity off, instead of stopping the server, when the secret is missing', () => {
    const warnings: string[] = [];
    const config = readConfig({ ...base, DISCORD_ACTIVITY_CLIENT_ID: 'activity-id' }, (m) => warnings.push(m));
    expect(config.discordActivity).toBeNull();
    expect(config.discord).toMatchObject({ clientId: 'shared-id', clientSecret: 'shared-secret' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/DISCORD_ACTIVITY_CLIENT_SECRET/);
  });
});

describe('Discord Activity off', () => {
  const db = new pg.Pool({ connectionString: 'postgres://unused@localhost:1/unused' });
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ config: testConfig({ discordActivity: null }), db, discord: fakeDiscord({}) });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it('serves the game as before: no token endpoint, and only this site may frame it', async () => {
    const token = await app.inject({ method: 'POST', url: '/api/discord/token', payload: { code: 'x' } });
    expect(token.statusCode).toBe(404);
    const health = await app.inject({ method: 'GET', url: '/healthz' });
    expect(health.statusCode).toBe(200);
    expect(health.headers['content-security-policy']).toBe("frame-ancestors 'self'");
  });
});
