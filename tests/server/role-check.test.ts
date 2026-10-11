// Re-checking signed-in players' Discord roles (server/auth/role-check.ts), against a real
// (test) database with a fake bot. Also the real bot's member lookup, with Discord faked.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { buildApp } from '../../server/app';
import type { DiscordMember } from '../../server/auth/discord';
import { discordBot, type DiscordBot } from '../../server/notify';
import { ADMIN_ID, MODS_ROLE, PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

const haveDb = await databaseAvailable();

const member = (roles: string[]): DiscordMember => ({ roles, joinedAt: '2025-01-01T00:00:00.000Z' });

describe.skipIf(!haveDb)('Discord role re-check', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  /** What the bot sees in our Discord server now, by Discord ID. 'down' = Discord doesn't answer. */
  const server = new Map<string, DiscordMember | null | 'down'>();
  const lookups: string[] = [];
  const bot: DiscordBot = {
    async sendDm() {
      return true;
    },
    async getMember(_guildId, discordUserId) {
      lookups.push(discordUserId);
      const now = server.get(discordUserId);
      if (now === 'down') throw new Error('Discord is down');
      return now ?? null;
    },
  };
  const discord = fakeDiscord({
    alice: person('111', 'alice', [PLAYERS_ROLE]),
    owner: person(ADMIN_ID, 'paul', []),
  });

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    app = await buildApp({ config: testConfig(), db, discord, bot });
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  beforeEach(() => {
    lookups.length = 0;
    server.clear();
  });

  const me = (cookie: string) => app.inject({ method: 'GET', url: '/api/me', cookies: { spellstick_session: cookie } });
  /** Pretends the last check was an hour ago, longer than the 15 minutes between checks. */
  const timePasses = () => db.query("update users set roles_checked_at = now() - interval '1 hour'");
  const signedInAlice = async () => (await signIn(app, 'alice')).cookie!;

  it("doesn't ask Discord again right after sign-in", async () => {
    const cookie = await signedInAlice();
    expect((await me(cookie)).statusCode).toBe(200);
    expect(lookups).toEqual([]);
  });

  it('lets a player who still has the role carry on, and waits before asking again', async () => {
    const cookie = await signedInAlice();
    server.set('111', member([PLAYERS_ROLE]));
    await timePasses();
    expect((await me(cookie)).statusCode).toBe(200);
    expect((await me(cookie)).statusCode).toBe(200);
    expect(lookups).toEqual(['111']);
  });

  it('signs out a player whose role was taken away, on every device', async () => {
    const phone = await signedInAlice();
    const laptop = await signedInAlice();
    server.set('111', member(['some-other-role']));
    await timePasses();
    expect((await me(phone)).statusCode).toBe(401);
    expect((await me(laptop)).statusCode).toBe(401);
    const { rows } = await db.query("select count(*)::int as n from sessions s join users u on u.id = s.user_id where u.discord_id = '111'");
    expect(rows[0].n).toBe(0);
  });

  it('signs out a player who left the server', async () => {
    const cookie = await signedInAlice();
    server.set('111', null);
    await timePasses();
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it('picks up a new role without signing in again', async () => {
    const cookie = await signedInAlice();
    server.set('111', member([PLAYERS_ROLE, MODS_ROLE]));
    await timePasses();
    expect((await me(cookie)).json()).toMatchObject({ role: 'moderator' });
    expect((await me(cookie)).json()).toMatchObject({ role: 'moderator' });
  });

  it("keeps players signed in when Discord doesn't answer", async () => {
    const cookie = await signedInAlice();
    server.set('111', 'down');
    await timePasses();
    expect((await me(cookie)).statusCode).toBe(200);
  });

  it('always keeps the owner in, even without a role', async () => {
    const cookie = (await signIn(app, 'owner')).cookie!;
    server.set(ADMIN_ID, null);
    await timePasses();
    expect((await me(cookie)).json()).toMatchObject({ role: 'admin' });
  });

  it('asks Discord once when several requests arrive together', async () => {
    const cookie = await signedInAlice();
    server.set('111', member([PLAYERS_ROLE]));
    await timePasses();
    const answers = await Promise.all([me(cookie), me(cookie), me(cookie), me(cookie)]);
    expect(answers.map((a) => a.statusCode)).toEqual([200, 200, 200, 200]);
    expect(lookups).toEqual(['111']);
  });

  it('is off without a bot: roles are checked only at sign-in', async () => {
    const noBot = await buildApp({ config: testConfig(), db, discord, bot: null });
    try {
      const { cookie } = await signIn(noBot, 'alice');
      server.set('111', null);
      await timePasses();
      const res = await noBot.inject({ method: 'GET', url: '/api/me', cookies: { spellstick_session: cookie! } });
      expect(res.statusCode).toBe(200);
      expect(lookups).toEqual([]);
    } finally {
      await noBot.close();
    }
  });
});

describe("the bot's member lookup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Pretends Discord answers with this status and body. */
  const discordAnswers = (status: number, body: object) => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(body), { status });
    });
    return asked;
  };

  it("reads the player's roles", async () => {
    const asked = discordAnswers(200, { roles: ['r1', 'r2'], joined_at: '2025-01-01T00:00:00.000Z' });
    expect(await discordBot('token').getMember('guild', '111')).toEqual({ roles: ['r1', 'r2'], joinedAt: '2025-01-01T00:00:00.000Z' });
    expect(asked).toEqual(['https://discord.com/api/v10/guilds/guild/members/111']);
  });

  it('says "not a member" only for Discord\'s Unknown Member answer', async () => {
    discordAnswers(404, { message: 'Unknown Member', code: 10007 });
    expect(await discordBot('token').getMember('guild', '111')).toBeNull();
  });

  it("throws, instead of saying \"not a member\", when the bot isn't in the server or Discord has trouble", async () => {
    discordAnswers(404, { message: 'Unknown Guild', code: 10004 });
    await expect(discordBot('token').getMember('guild', '111')).rejects.toThrow();
    discordAnswers(403, { message: 'Missing Access', code: 50001 });
    await expect(discordBot('token').getMember('guild', '111')).rejects.toThrow();
    discordAnswers(500, {});
    await expect(discordBot('token').getMember('guild', '111')).rejects.toThrow();
  });
});
