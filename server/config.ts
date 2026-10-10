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
  discord: {
    clientId: string;
    clientSecret: string;
    /** Your Discord server. Players must be members to sign in. */
    guildId: string;
    /** Players need at least one of these roles. Empty means any member may sign in. */
    allowedRoleIds: string[];
  };
  /** Discord user IDs that are always allowed in and get the admin role. */
  adminDiscordIds: string[];
  sessionDays: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing setting ${name}. See server/.env.example.`);
  return value;
}

function list(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
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

  return {
    port: Number(env.PORT ?? 8080),
    publicUrl: required(env, 'PUBLIC_URL').replace(/\/$/, ''),
    staticDir: env.STATIC_DIR ?? 'dist',
    migrationsDir: env.MIGRATIONS_DIR ?? 'server/migrations',
    database,
    discord: {
      clientId: required(env, 'DISCORD_CLIENT_ID'),
      clientSecret: required(env, 'DISCORD_CLIENT_SECRET'),
      guildId: required(env, 'DISCORD_GUILD_ID'),
      allowedRoleIds: list(env.DISCORD_ALLOWED_ROLE_IDS),
    },
    adminDiscordIds: list(env.ADMIN_DISCORD_IDS),
    sessionDays: Number(env.SESSION_DAYS ?? 7),
  };
}
