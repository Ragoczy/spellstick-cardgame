// Starts the Spellstick game server.
//
// Locally: npm run server:dev (reads server/.env). In Azure: node dist-server/main.js, with
// settings from the container app.

import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { discordApi } from './auth/discord';
import { readConfig } from './config';
import { createPool } from './db';
import { migrate } from './migrate';

if (existsSync('server/.env')) process.loadEnvFile('server/.env');

const config = readConfig();
const db = createPool(config.database);
const app = await buildApp({ config, db, discord: discordApi(config.discord, config.discordActivity) }, true);

const applied = await migrate(db, config.migrationsDir);
if (applied.length) app.log.info({ applied }, 'database updated');

await app.listen({ port: config.port, host: '0.0.0.0' });

// Azure stops the old copy with SIGTERM during a deploy: finish open requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
}
