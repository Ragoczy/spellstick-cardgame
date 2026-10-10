// Test helpers for the game server: a throwaway database schema and a fake Discord.

import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../../server/app';
import type { DiscordApi, DiscordMember, DiscordUser } from '../../server/auth/discord';
import type { Config } from '../../server/config';
import { createPool } from '../../server/db';
import { migrate } from '../../server/migrate';

/** The local docker compose database (npm run db:up). CI sets TEST_DATABASE_URL to its own. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://spellstick:spellstick@localhost:5433/spellstick';

/** True if the test database is reachable. Database tests are skipped (with a warning) when it isn't. */
export async function databaseAvailable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    console.warn(`Skipping database tests: no Postgres at ${TEST_DATABASE_URL}. Run "npm run db:up" to include them.`);
    return false;
  }
}

/** A fresh, empty schema with all migrations applied. Call drop() when done. */
export async function testDatabase(): Promise<{ db: pg.Pool; drop: () => Promise<void> }> {
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create schema ${schema}`);
  await admin.end();
  const db = createPool({ url: TEST_DATABASE_URL }, { searchPath: schema });
  await migrate(db, 'server/migrations');
  return {
    db,
    drop: async () => {
      await db.end();
      const cleanup = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await cleanup.connect();
      await cleanup.query(`drop schema ${schema} cascade`);
      await cleanup.end();
    },
  };
}

export const GUILD_ID = '1000';
export const PLAYERS_ROLE = '2000';
export const MODS_ROLE = '2001';
export const ADMINS_ROLE = '2002';
export const ADMIN_ID = '771010532458233888';
export const ACTIVITY_CLIENT_ID = '3000';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    publicUrl: 'https://spellstick.test',
    staticDir: 'no-such-folder',
    migrationsDir: 'server/migrations',
    database: { url: TEST_DATABASE_URL },
    discord: {
      clientId: 'client-id', clientSecret: 'client-secret', guildId: GUILD_ID,
      playerRoleIds: [PLAYERS_ROLE], moderatorRoleIds: [MODS_ROLE], adminRoleIds: [ADMINS_ROLE], allowedRoleIds: [],
    },
    discordActivity: { clientId: ACTIVITY_CLIENT_ID, clientSecret: 'activity-secret' },
    adminDiscordIds: [ADMIN_ID],
    sessionDays: 7,
    // Tests run the clock checks themselves.
    clockCheckMs: 0,
    ...overrides,
  };
}

/** A pretend Discord person: who they are, and their membership in our server (null = not a member). */
export interface FakePerson {
  user: DiscordUser;
  member: DiscordMember | null;
}

export function person(id: string, username: string, roles: string[] | null): FakePerson {
  return {
    user: { id, username, globalName: null, avatar: null },
    member: roles === null ? null : { roles, joinedAt: '2025-01-01T00:00:00.000Z' },
  };
}

/** A fake Discord where each one-time code belongs to one pretend person. */
export function fakeDiscord(codes: Record<string, FakePerson>): DiscordApi & { exchanged: string[] } {
  const exchanged: string[] = [];
  return {
    exchanged,
    async exchangeCode(code) {
      exchanged.push(code);
      if (!codes[code]) throw new Error('bad code');
      return `token-for-${code}`;
    },
    async getUser(token) {
      return codes[token.replace('token-for-', '')]!.user;
    },
    async getMember(token) {
      return codes[token.replace('token-for-', '')]!.member;
    },
    async exchangeActivityCode(code) {
      exchanged.push(code);
      if (!codes[code]) throw new Error('bad code');
      return `activity-token-for-${code}`;
    },
  };
}

/** Builds the app and walks through sign-in with a code, like a browser would. Returns the session cookie (if any) and where we ended up. */
export async function signIn(app: Awaited<ReturnType<typeof buildApp>>, code: string): Promise<{ cookie: string | null; location: string }> {
  const login = await app.inject({ method: 'GET', url: '/auth/discord/login' });
  const state = new URL(login.headers.location as string).searchParams.get('state')!;
  const stateCookie = login.cookies.find((c) => c.name === 'spellstick_oauth_state')!;
  const callback = await app.inject({
    method: 'GET',
    url: `/auth/discord/callback?code=${code}&state=${state}`,
    cookies: { spellstick_oauth_state: stateCookie.value },
  });
  const session = callback.cookies.find((c) => c.name === 'spellstick_session' && c.value);
  return { cookie: session?.value ?? null, location: callback.headers.location as string };
}
