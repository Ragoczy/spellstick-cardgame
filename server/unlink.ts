// "Unlink my Discord account": deletes a player's Spellstick data.
//
// What we hold about a player (see the migrations): their users row (Discord ID, username,
// avatar, Discord account and server-join dates, manager name, role), their sign-in sessions,
// and their part in matches. Matches are shared with the other player, so those are kept for
// the other player's history; the leaving player becomes an empty placeholder row that shows
// as "Former player". A player with no matches is deleted outright.
//
// The Discord side (revoking the token) happens in auth/routes.ts, before this runs.

import type pg from 'pg';
import { inTransaction, leaveAllMatches, type ClockNotice } from './matches';

/** Deletes the player's data. Returns match changes to tell their opponents about. */
export async function unlinkAccount(db: pg.Pool, userId: number): Promise<ClockNotice[]> {
  return inTransaction(db, async (client) => {
    // Matches in progress count as resigned; open challenges are turned down.
    const notices = await leaveAllMatches(client, userId);

    // Signs them out everywhere.
    await client.query('delete from sessions where user_id = $1', [userId]);

    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from matches where player_a = $1 or player_b = $1`,
      [userId],
    );
    if (rows[0]!.n === 0) {
      await client.query('delete from users where id = $1', [userId]);
    } else {
      // Other players' matches point at this row, so wipe it instead. The times are reset so
      // the row says nothing about when the player was around.
      await client.query(
        `update users set discord_id = null, discord_username = null, discord_avatar = null,
           discord_created_at = null, joined_server_at = null, display_name = null,
           role = 'player', trade_frozen = false,
           created_at = now(), last_sign_in_at = now(), last_seen_at = now(), unlinked_at = now()
         where id = $1`,
        [userId],
      );
    }

    // The audit log: when, and nothing about who.
    await client.query(`insert into account_events (event) values ('account unlinked')`);
    return notices;
  });
}
