// Player accounts and sign-in sessions in the database.

import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { discordCreatedAt, type DiscordMember, type DiscordUser, type Role } from './auth/discord';

export type { Role };

export interface User {
  id: number;
  discordId: string;
  discordUsername: string;
  discordAvatar: string | null;
  displayName: string | null;
  role: Role;
}

interface UserRow {
  id: string;
  discord_id: string;
  discord_username: string;
  discord_avatar: string | null;
  display_name: string | null;
  role: Role;
}

function toUser(row: UserRow): User {
  return {
    id: Number(row.id),
    discordId: row.discord_id,
    discordUsername: row.discord_username,
    discordAvatar: row.discord_avatar,
    displayName: row.display_name,
    role: row.role,
  };
}

const USER_COLUMNS = 'u.id, u.discord_id, u.discord_username, u.discord_avatar, u.display_name, u.role';

/**
 * Creates the player on first sign-in, or refreshes their Discord details. Their role comes
 * from their Discord roles at each sign-in, so changing roles in Discord takes effect the next
 * time they sign in.
 */
export async function upsertUser(db: pg.Pool, discord: DiscordUser, member: DiscordMember | null, role: Role): Promise<User> {
  const { rows } = await db.query<UserRow>(
    `insert into users as u (discord_id, discord_username, discord_avatar, discord_created_at, joined_server_at, role)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (discord_id) do update set
       discord_username = excluded.discord_username,
       discord_avatar = excluded.discord_avatar,
       joined_server_at = excluded.joined_server_at,
       last_sign_in_at = now(),
       role = excluded.role
     returning ${USER_COLUMNS}`,
    [discord.id, discord.username, discord.avatar, discordCreatedAt(discord.id), member?.joinedAt ?? null, role],
  );
  return toUser(rows[0]!);
}

// ---- Sessions ----
// The cookie holds a random value; the database holds only its hash.

function hash(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

export async function createSession(db: pg.Pool, userId: number, days: number): Promise<string> {
  const sessionId = randomBytes(32).toString('base64url');
  await db.query(
    `insert into sessions (id_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [hash(sessionId), userId, days],
  );
  // Tidy up: expired sessions are useless.
  await db.query('delete from sessions where expires_at < now()');
  return sessionId;
}

export async function userForSession(db: pg.Pool, sessionId: string): Promise<User | null> {
  const { rows } = await db.query<UserRow>(
    `update users u set last_seen_at = now()
     from sessions s
     where s.id_hash = $1 and s.expires_at > now() and s.user_id = u.id
     returning ${USER_COLUMNS}`,
    [hash(sessionId)],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function deleteSession(db: pg.Pool, sessionId: string): Promise<void> {
  await db.query('delete from sessions where id_hash = $1', [hash(sessionId)]);
}

// ---- Display names ----

export const NAME_MIN = 3;
export const NAME_MAX = 24;

/** Returns an error message for a bad name, or null if it's fine. */
export function checkDisplayName(name: string): string | null {
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `Names are ${NAME_MIN} to ${NAME_MAX} characters long.`;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '.&-]*$/u.test(name)) return 'Use letters, numbers, spaces, and \' . & - only, starting with a letter or number.';
  return null;
}

/** Tidies spacing, so "  The  Hexes " becomes "The Hexes". */
export function normalizeDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Sets the player's name. Returns false if someone else already has it. */
export async function setDisplayName(db: pg.Pool, userId: number, name: string): Promise<boolean> {
  try {
    await db.query('update users set display_name = $1 where id = $2', [name, userId]);
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return false; // unique_violation
    throw err;
  }
}
