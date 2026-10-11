// Re-checking a signed-in player's Discord roles.
//
// Sign-in checks membership and roles in our Discord server (checkAccess in discord.ts). A
// session lasts several days, so without a re-check, taking a role away in Discord would only
// take effect at the player's next sign-in. Instead, every ROLE_CHECK_MINUTES while they use the
// game, the server asks Discord again:
// - still allowed: carry on, with their role updated if it changed (for example, made a moderator);
// - no longer allowed (role taken away, or left the server): signed out on every device;
// - Discord didn't answer: carry on, and try again next time. An outage shouldn't sign everyone out.
//
// The server keeps no Discord tokens of its own, so it asks as the bot (DISCORD_BOT_TOKEN).
// Without a bot token, roles are checked only at sign-in, as before.

import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import type { DiscordBot } from '../notify';
import type { User } from '../users';
import { checkAccess, type AccessRules } from './discord';

export class RoleCheck {
  constructor(
    private readonly db: pg.Pool,
    private readonly bot: DiscordBot,
    private readonly guildId: string,
    private readonly rules: AccessRules,
    private readonly everyMinutes: number,
    /** Told when a player is signed out, so their open pages can be closed. */
    private readonly onSignedOut: (userId: number) => void,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** The player, possibly with a new role, or null if they may no longer play (now signed out). */
  async recheck(user: User): Promise<User | null> {
    if (Date.now() - user.rolesCheckedAt.getTime() < this.everyMinutes * 60_000) return user;

    // Many requests can arrive at once. Only the one that moves the time on does the check;
    // the rest carry on with what we know.
    const claimed = await this.db.query(
      `update users set roles_checked_at = now()
       where id = $1 and roles_checked_at < now() - make_interval(secs => $2)`,
      [user.id, this.everyMinutes * 60],
    );
    if (claimed.rowCount === 0) return user;

    let member;
    try {
      member = await this.bot.getMember(this.guildId, user.discordId);
    } catch (err) {
      this.log.warn(err, 'role re-check: Discord did not answer');
      return user;
    }

    const access = checkAccess(user.discordId, member, this.rules);
    if (!access.allowed) {
      await this.db.query('delete from sessions where user_id = $1', [user.id]);
      this.onSignedOut(user.id);
      this.log.info({ userId: user.id, reason: access.reason }, 'role re-check: signed out');
      return null;
    }
    if (access.role !== user.role) {
      await this.db.query('update users set role = $2 where id = $1', [user.id, access.role]);
      this.log.info({ userId: user.id, role: access.role }, 'role re-check: role changed');
      return { ...user, role: access.role };
    }
    return user;
  }
}
