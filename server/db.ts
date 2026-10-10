// The Postgres connection pool.
//
// Locally we connect with a password. In Azure the database has passwords turned off, so the
// app signs in with its managed identity: it asks Azure for a short-lived token and uses that
// as the password. node-postgres calls the password function for each new connection.

import pg from 'pg';
import type { DatabaseConfig } from './config';

/** The Azure resource that Postgres tokens are issued for. */
const POSTGRES_RESOURCE = 'https://ossrdbms-aad.database.windows.net';

export function createPool(config: DatabaseConfig, options: { searchPath?: string } = {}): pg.Pool {
  // Lets tests run in their own schema without touching other data.
  const pgOptions = options.searchPath ? `-c search_path=${options.searchPath}` : undefined;
  if (config.url) {
    return new pg.Pool({ connectionString: config.url, options: pgOptions, max: 10 });
  }
  const entra = config.entra!;
  return new pg.Pool({
    host: entra.host,
    database: entra.database,
    user: entra.user,
    password: managedIdentityToken(entra.clientId),
    ssl: true,
    options: pgOptions,
    max: 10,
  });
}

/** Returns a function that gets (and caches) an Azure token from the container's identity endpoint. */
function managedIdentityToken(clientId: string | undefined): () => Promise<string> {
  let cached: { token: string; expiresAt: number } | null = null;
  return async () => {
    // Reuse the token until five minutes before it expires.
    if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
    const endpoint = process.env.IDENTITY_ENDPOINT;
    const header = process.env.IDENTITY_HEADER;
    if (!endpoint || !header) throw new Error('No managed identity here. Set DATABASE_URL to use a password instead.');
    const url = new URL(endpoint);
    url.searchParams.set('resource', POSTGRES_RESOURCE);
    url.searchParams.set('api-version', '2019-08-01');
    if (clientId) url.searchParams.set('client_id', clientId);
    const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': header } });
    if (!res.ok) throw new Error(`Managed identity token request failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_on: string };
    cached = { token: body.access_token, expiresAt: Number(body.expires_on) * 1000 };
    return cached.token;
  };
}
