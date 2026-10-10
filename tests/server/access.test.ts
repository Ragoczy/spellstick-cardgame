// Sign-in rules that don't need a database: who may sign in, names, and Discord details.

import { describe, expect, it } from 'vitest';
import { accessRules, authorizeUrl, checkAccess, discordCreatedAt } from '../../server/auth/discord';
import { readConfig } from '../../server/config';
import { checkDisplayName, normalizeDisplayName } from '../../server/users';

const shared = { playerRoleIds: ['players'], moderatorRoleIds: ['mods'], adminRoleIds: ['admins'], allowedRoleIds: [] };
const rules = accessRules(shared, ['owner']);
const member = (roles: string[]) => ({ roles, joinedAt: '2025-01-01T00:00:00Z' });

describe('who may sign in, and as what', () => {
  it('lets in members with the Players role, as players', () => {
    expect(checkAccess('p1', member(['other', 'players']), rules)).toEqual({ allowed: true, role: 'player' });
  });

  it('makes Mods moderators and Admins admins, even without the Players role', () => {
    expect(checkAccess('p1', member(['mods']), rules)).toEqual({ allowed: true, role: 'moderator' });
    expect(checkAccess('p1', member(['admins']), rules)).toEqual({ allowed: true, role: 'admin' });
    expect(checkAccess('p1', member(['players', 'mods', 'admins']), rules)).toEqual({ allowed: true, role: 'admin' });
  });

  it('turns away members without any of the roles', () => {
    expect(checkAccess('p1', member(['other']), rules)).toEqual({ allowed: false, reason: 'no-role' });
  });

  it('turns away people who are not in the server', () => {
    expect(checkAccess('p1', null, rules)).toEqual({ allowed: false, reason: 'not-member' });
  });

  it("uses this game's own allowed roles instead of Players when it has them (a beta)", () => {
    const beta = accessRules({ ...shared, allowedRoleIds: ['beta'] }, ['owner']);
    expect(checkAccess('p1', member(['beta']), beta)).toEqual({ allowed: true, role: 'player' });
    expect(checkAccess('p1', member(['players']), beta)).toEqual({ allowed: false, reason: 'no-role' });
    expect(checkAccess('p1', member(['mods']), beta)).toEqual({ allowed: true, role: 'moderator' });
  });

  it('lets in any member when no player roles are set', () => {
    const open = accessRules({ ...shared, playerRoleIds: [] }, []);
    expect(checkAccess('p1', member([]), open)).toEqual({ allowed: true, role: 'player' });
    expect(checkAccess('p1', null, open)).toEqual({ allowed: false, reason: 'not-member' });
  });

  it('always lets the emergency admin IDs in, so the owner is never locked out', () => {
    expect(checkAccess('owner', member([]), rules)).toEqual({ allowed: true, role: 'admin' });
    expect(checkAccess('owner', null, rules)).toEqual({ allowed: true, role: 'admin' });
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

  it('reads the role and admin lists, and allows empty ones', () => {
    const config = readConfig({
      ...base,
      DISCORD_PLAYER_ROLE_IDS: ' p1, p2 ', DISCORD_MODERATOR_ROLE_IDS: 'm1', DISCORD_ADMIN_ROLE_IDS: 'x1',
      DISCORD_ALLOWED_ROLE_IDS: 'b1', ADMIN_DISCORD_IDS: 'a1',
    });
    expect(config.discord).toMatchObject({ playerRoleIds: ['p1', 'p2'], moderatorRoleIds: ['m1'], adminRoleIds: ['x1'], allowedRoleIds: ['b1'] });
    expect(config.adminDiscordIds).toEqual(['a1']);
    expect(config.publicUrl).toBe('https://example.test');
    expect(readConfig(base).discord).toMatchObject({ playerRoleIds: [], allowedRoleIds: [] });
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
