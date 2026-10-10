// Server settings, read once from environment variables.
//
// Locally these come from server/.env (see server/.env.example). In Azure they are set on the
// container app, and the Discord secret comes from Key Vault.

export interface DatabaseConfig {
  /** A normal connection string with a password (local Postgres and tests). */
  url?: string;
  /** Or: sign in to Azure Postgres with the app's managed identity instead of a password. */
  entra?: { host: string; database: string; user: string; clientId?: string };
}

export interface Config {
  port: number;
  /** The address players use, for example http://localhost:5173. Used for the Discord return address and cookie settings. */
  publicUrl: string;
  /** Folder with the built browser game. */
  staticDir: string;
  /** Folder with the numbered .sql migration files. */
  migrationsDir: string;
  database: DatabaseConfig;
  /**
   * Discord settings. Everything except allowedRoleIds is shared by all Darkspace games and
   * comes from Key Vault (Integrations--Discord--*); see infra/README.md.
   */
  discord: {
    clientId: string;
    clientSecret: string;
    /** Our Discord server. Players must be members to sign in. */
    guildId: string;
    /** Discord roles that make someone a player, moderator, or admin in every game. */
    playerRoleIds: string[];
    moderatorRoleIds: string[];
    adminRoleIds: string[];
    /**
     * This game only: roles allowed to sign in instead of the player roles (for example a beta
     * role). Empty means the player roles. Moderators and admins can always sign in.
     */
    allowedRoleIds: string[];
  };
  /**
   * The Discord app that runs the game inside Discord (a Discord Activity; see
   * docs/discord-activity.md). For now this is the shared sign-in app above. Setting
   * DISCORD_ACTIVITY_CLIENT_ID and DISCORD_ACTIVITY_CLIENT_SECRET switches to its own app.
   * Null (the Activity is off) when only the ID is set: a warning, not a crash.
   */
  discordActivity: { clientId: string; clientSecret: string } | null;
  /** Discord user IDs that are always allowed in as admins, even without a role (so the owner can't be locked out). */
  adminDiscordIds: string[];
  sessionDays: number;
  /** How often to look for time banks that have run out, in milliseconds (0: never, for tests). */
  clockCheckMs: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing setting ${name}. See server/.env.example.`);
  return value;
}

function list(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** The Discord Activity settings. Half set up turns the Activity off, so the rest of the game keeps running. */
function readActivity(env: NodeJS.ProcessEnv, shared: { clientId: string; clientSecret: string }, warn: (message: string) => void): Config['discordActivity'] {
  const clientId = env.DISCORD_ACTIVITY_CLIENT_ID?.trim();
  const clientSecret = env.DISCORD_ACTIVITY_CLIENT_SECRET?.trim();
  if (!clientId) return shared;
  if (!clientSecret) {
    warn('DISCORD_ACTIVITY_CLIENT_ID is set but DISCORD_ACTIVITY_CLIENT_SECRET is missing, so the game is off inside Discord. Everything else works. See docs/discord-activity.md.');
    return null;
  }
  return { clientId, clientSecret };
}

/** warn: told about settings that are wrong but not serious enough to stop the server. */
export function readConfig(env: NodeJS.ProcessEnv = process.env, warn: (message: string) => void = console.warn): Config {
  const database: DatabaseConfig = env.DATABASE_URL
    ? { url: env.DATABASE_URL }
    : {
        entra: {
          host: required(env, 'DB_HOST'),
          database: required(env, 'DB_NAME'),
          user: required(env, 'DB_USER'),
          clientId: env.AZURE_CLIENT_ID,
        },
      };

  const discordClientId = required(env, 'DISCORD_CLIENT_ID');
  const discordClientSecret = required(env, 'DISCORD_CLIENT_SECRET');

  return {
    port: Number(env.PORT ?? 8080),
    publicUrl: required(env, 'PUBLIC_URL').replace(/\/$/, ''),
    staticDir: env.STATIC_DIR ?? 'dist',
    migrationsDir: env.MIGRATIONS_DIR ?? 'server/migrations',
    database,
    discord: {
      clientId: discordClientId,
      clientSecret: discordClientSecret,
      guildId: required(env, 'DISCORD_GUILD_ID'),
      playerRoleIds: list(env.DISCORD_PLAYER_ROLE_IDS),
      moderatorRoleIds: list(env.DISCORD_MODERATOR_ROLE_IDS),
      adminRoleIds: list(env.DISCORD_ADMIN_ROLE_IDS),
      allowedRoleIds: list(env.DISCORD_ALLOWED_ROLE_IDS),
    },
    discordActivity: readActivity(env, { clientId: discordClientId, clientSecret: discordClientSecret }, warn),
    adminDiscordIds: list(env.ADMIN_DISCORD_IDS),
    sessionDays: Number(env.SESSION_DAYS ?? 7),
    clockCheckMs: Number(env.CLOCK_CHECK_MS ?? 30_000),
  };
}
