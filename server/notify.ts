// Discord notifications: direct messages about a player's own matches.
//
// The rules (docs/spellstick-multiplayer-design.md, "Notifications (Discord bot)"):
// - every kind is opt-in and off by default; the setting is checked right before each send,
//   and a missing setting means "don't send";
// - messages are about the game only;
// - every message ends with how to turn it off.
// This is the only file that sends Discord messages (tests/discord-messages.test.ts checks).
//
// Nothing is sent unless the server has a bot token (DISCORD_BOT_TOKEN).

import type pg from 'pg';
import type { LiveHub } from './live';

export const NOTIFICATION_KINDS = [
  { kind: 'challenge', label: 'Challenges', description: 'When another player challenges you to a match.' },
  { kind: 'your_turn', label: 'Your move', description: "When a match is waiting on you and you don't have the game open. At most one every 30 minutes for each match." },
  { kind: 'time_low', label: 'Time running low', description: 'Once a match, when 6 hours are left in your time bank (matches at your own pace).' },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]['kind'];

export const DM_FOOTER = 'Turn off these alerts in Spellstick → Settings → Notifications.';

/** "Your move" alerts for the same match are at least this far apart. */
const YOUR_TURN_GAP_MS = 30 * 60_000;
/** "Time running low" is sent when this much is left (async matches only). */
export const TIME_LOW_MS = 6 * 60 * 60_000;

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordBot {
  /** Sends a direct message. Returns false if Discord refused (for example, DMs closed). */
  sendDm(discordUserId: string, content: string): Promise<boolean>;
}

/** The real bot, signed in with the bot token. */
export function discordBot(token: string): DiscordBot {
  return {
    async sendDm(discordUserId, content) {
      const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
      const open = await fetch(`${DISCORD_API}/users/@me/channels`, {
        method: 'POST', headers, body: JSON.stringify({ recipient_id: discordUserId }),
      });
      if (!open.ok) return false;
      const channel = (await open.json()) as { id: string };
      const sent = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
        method: 'POST', headers,
        // No pings: names in the message never notify anyone.
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      });
      return sent.ok;
    },
  };
}

export function isNotificationKind(value: unknown): value is NotificationKind {
  return NOTIFICATION_KINDS.some((k) => k.kind === value);
}

export class Notifier {
  constructor(
    private readonly db: pg.Pool,
    private readonly bot: DiscordBot | null,
    private readonly live: LiveHub,
    private readonly publicUrl: string,
    private readonly logError: (err: unknown) => void,
  ) {}

  /** False when the server has no bot token, so nothing can be sent. */
  get available(): boolean {
    return this.bot !== null;
  }

  async settingsFor(userId: number): Promise<Record<NotificationKind, boolean>> {
    const { rows } = await this.db.query<{ kind: NotificationKind; enabled: boolean }>(
      'select kind, enabled from notification_settings where user_id = $1', [userId],
    );
    const settings = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.kind, false])) as Record<NotificationKind, boolean>;
    for (const row of rows) settings[row.kind] = row.enabled;
    return settings;
  }

  async setSetting(userId: number, kind: NotificationKind, enabled: boolean): Promise<void> {
    await this.db.query(
      `insert into notification_settings (user_id, kind, enabled) values ($1, $2, $3)
       on conflict (user_id, kind) do update set enabled = excluded.enabled, updated_at = now()`,
      [userId, kind, enabled],
    );
  }

  /** A new challenge: tell the player who was challenged. */
  async challengeReceived(matchId: number): Promise<void> {
    const match = await this.matchInfo(matchId);
    if (!match || match.status !== 'challenged') return;
    await this.send(Number(match.player_b), 'challenge', matchId,
      `**Spellstick:** ${match.a_name ?? 'Another player'} challenged you to a match. Accept or decline it here: ${this.link(matchId)}`);
  }

  /** A match changed: if it's now waiting on a player (other than the one who acted), maybe tell them. */
  async matchWaiting(matchId: number, actingUserId?: number): Promise<void> {
    const match = await this.matchInfo(matchId);
    if (!match || match.status !== 'active' || match.waiting_on === null) return;
    const waitingOn = Number(match.waiting_on);
    if (waitingOn === actingUserId) return;
    // Someone with the game open already sees it.
    if (this.live.isConnected(waitingOn)) return;
    const opponent = waitingOn === Number(match.player_a) ? match.b_name : match.a_name;
    await this.send(waitingOn, 'your_turn', matchId, `**Spellstick:** your move against ${opponent ?? 'your opponent'}. ${this.link(matchId)}`);
  }

  /** Warns players whose bank in an async match has dropped to 6 hours (once per match). */
  async checkTimeBanks(): Promise<void> {
    const { rows } = await this.db.query<{ id: string; waiting_on: string; opponent: string | null }>(
      `select m.id, m.waiting_on, case when m.waiting_on = m.player_a then ub.display_name else ua.display_name end as opponent
       from matches m join users ua on ua.id = m.player_a join users ub on ub.id = m.player_b
       where m.status = 'active' and m.pace = 'async' and m.waiting_due > now()
         and m.waiting_due <= now() + make_interval(secs => $1 / 1000.0)
         and not exists (select 1 from notifications_sent n where n.user_id = m.waiting_on and n.kind = 'time_low' and n.match_id = m.id)`,
      [TIME_LOW_MS],
    );
    for (const row of rows) {
      await this.send(Number(row.waiting_on), 'time_low', Number(row.id),
        `**Spellstick:** 6 hours are left in your time bank against ${row.opponent ?? 'your opponent'}. ` +
        `If it runs out, the computer makes your moves for the rest of the match. ${this.link(Number(row.id))}`);
    }
  }

  /** Runs a notification without holding up the request that caused it. */
  later(work: Promise<void>): void {
    work.catch(this.logError);
  }

  private link(matchId: number): string {
    return `${this.publicUrl}/?match=${matchId}`;
  }

  private async matchInfo(matchId: number) {
    const { rows } = await this.db.query<{
      status: string; player_a: string; player_b: string; waiting_on: string | null; a_name: string | null; b_name: string | null;
    }>(
      `select m.status, m.player_a, m.player_b, m.waiting_on, ua.display_name as a_name, ub.display_name as b_name
       from matches m join users ua on ua.id = m.player_a join users ub on ub.id = m.player_b where m.id = $1`,
      [matchId],
    );
    return rows[0] ?? null;
  }

  /** Sends one DM, only if the player turned this kind on. */
  private async send(userId: number, kind: NotificationKind, matchId: number, text: string): Promise<void> {
    if (!this.bot) return;
    const { rows } = await this.db.query<{ discord_id: string | null; enabled: boolean | null; recent: boolean }>(
      `select u.discord_id, s.enabled,
         exists (select 1 from notifications_sent n where n.user_id = u.id and n.kind = $2 and n.match_id = $3
                 and n.sent_at > now() - make_interval(secs => $4 / 1000.0)) as recent
       from users u left join notification_settings s on s.user_id = u.id and s.kind = $2
       where u.id = $1`,
      [userId, kind, matchId, YOUR_TURN_GAP_MS],
    );
    const user = rows[0];
    // Opt-in: no setting, or turned off, means no message. Unlinked players have no Discord ID.
    if (!user || user.enabled !== true || !user.discord_id) return;
    if (kind === 'your_turn' && user.recent) return;
    const ok = await this.bot.sendDm(user.discord_id, `${text}\n\n${DM_FOOTER}`);
    await this.db.query('insert into notifications_sent (user_id, kind, match_id, ok) values ($1, $2, $3, $4)', [userId, kind, matchId, ok]);
  }
}
