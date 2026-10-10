// Sign-in rules that don't need a database: who may sign in, names, and Discord details.

import { describe, expect, it } from 'vitest';
import { authorizeUrl, checkAccess, discordCreatedAt } from '../../server/auth/discord';
import { readConfig } from '../../server/config';
import { checkDisplayName, normalizeDisplayName } from '../../server/users';

const rules = { allowedRoleIds: ['beta'], adminDiscordIds: ['owner'] };
const member = (roles: string[]) => ({ roles, joinedAt: '2025-01-01T00:00:00Z' });

describe('who may sign in', () => {
  it('lets in members with an allowed role', () => {
    expect(checkAccess('p1', member(['other', 'beta']), rules)).toBe('allowed');
  });

  it('turns away members without an allowed role', () => {
    expect(checkAccess('p1', member(['other']), rules)).toBe('no-role');
  });

  it('turns away people who are not in the server', () => {
    expect(checkAccess('p1', null, rules)).toBe('not-member');
  });

  it('lets in any member when no roles are set', () => {
    expect(checkAccess('p1', member([]), { ...rules, allowedRoleIds: [] })).toBe('allowed');
    expect(checkAccess('p1', null, { ...rules, allowedRoleIds: [] })).toBe('not-member');
  });

  it('always lets admins in, even without the role (a server owner may not hold it)', () => {
    expect(checkAccess('owner', member([]), rules)).toBe('allowed');
    expect(checkAccess('owner', null, rules)).toBe('allowed');
  });
});

describe('Discord details', () => {
  it('works out when a Discord account was made from its ID', () => {
    // Discord's documented example: ID 175928847299117063 was made on 2016-04-30.
    expect(discordCreatedAt('175928847299117063').toISOString()).toBe('2016-04-30T11:18:25.796Z');
  });

  it('asks Discord only for identity and server membership', () => {
    const url = new URL(authorizeUrl('app', 'https://x.test/auth/discord/callback', 'st'));
    expect(url.origin).toBe('https://discord.com');
    expect(url.searchParams.get('scope')).toBe('identify guilds.members.read');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.test/auth/discord/callback');
  });
});

describe('manager names', () => {
  it('accepts ordinary names', () => {
    for (const name of ['Riverside Ravens', "O'Brien & Sons", 'Team 7', 'Jean-Luc', 'Équipe Ünited']) {
      expect(checkDisplayName(name)).toBeNull();
    }
  });

  it('refuses names that are too short, too long, or have odd characters', () => {
    expect(checkDisplayName('ab')).not.toBeNull();
    expect(checkDisplayName('x'.repeat(25))).not.toBeNull();
    expect(checkDisplayName('<script>')).not.toBeNull();
    expect(checkDisplayName('-dash first')).not.toBeNull();
    expect(checkDisplayName('emoji 🎉 team')).not.toBeNull();
  });

  it('tidies extra spaces', () => {
    expect(normalizeDisplayName('  The   Hexes ')).toBe('The Hexes');
  });
});

describe('settings', () => {
  const base = {
    PUBLIC_URL: 'https://example.test/',
    DATABASE_URL: 'postgres://x',
    DISCORD_CLIENT_ID: 'id',
    DISCORD_CLIENT_SECRET: 'secret',
    DISCORD_GUILD_ID: 'guild',
  };

  it('reads role and admin lists, and allows an empty role list', () => {
    const config = readConfig({ ...base, DISCORD_ALLOWED_ROLE_IDS: ' r1, r2 ', ADMIN_DISCORD_IDS: 'a1' });
    expect(config.discord.allowedRoleIds).toEqual(['r1', 'r2']);
    expect(config.adminDiscordIds).toEqual(['a1']);
    expect(config.publicUrl).toBe('https://example.test');
    expect(readConfig(base).discord.allowedRoleIds).toEqual([]);
  });

  it('names the missing setting', () => {
    expect(() => readConfig({ ...base, DISCORD_CLIENT_SECRET: '' })).toThrow(/DISCORD_CLIENT_SECRET/);
  });

  it('uses the managed identity when there is no connection string', () => {
    const { DATABASE_URL: _, ...rest } = base;
    const config = readConfig({ ...rest, DB_HOST: 'h', DB_NAME: 'spellstick', DB_USER: 'id-spellstick', AZURE_CLIENT_ID: 'c' });
    expect(config.database).toEqual({ entra: { host: 'h', database: 'spellstick', user: 'id-spellstick', clientId: 'c' } });
  });
});
