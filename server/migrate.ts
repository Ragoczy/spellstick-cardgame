// Applies database changes in order.
//
// Each change is a numbered .sql file in server/migrations (001_..., 002_...). A file runs once,
// inside a transaction, and is then recorded in schema_migrations. Never edit a file that has
// already run in Azure: add a new one instead.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';

export async function migrate(pool: pg.Pool, dir: string): Promise<string[]> {
  const client = await pool.connect();
  try {
    // Only one server at a time may migrate (a deploy can briefly run two copies).
    await client.query('select pg_advisory_lock(717171)');
    await client.query(`create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(dir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
        applied.push(file);
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    return applied;
  } finally {
    await client.query('select pg_advisory_unlock(717171)').catch(() => {});
    client.release();
  }
}
