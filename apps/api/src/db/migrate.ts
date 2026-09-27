import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { withTransaction, type Db } from './pool.js';

// This module runs from src/db (tsx) or is bundled into dist/*.js or dist/db/*.js,
// so look for the package's migrations folder one or two levels up.
const defaultDir =
  ['../migrations', '../../migrations'].map((rel) => fileURLToPath(new URL(rel, import.meta.url))).find((dir) => existsSync(dir)) ??
  'migrations';

/** Applies any *.sql files in the migrations directory that have not run yet, in name order. */
export async function migrate(db: Db, dir = process.env.MIGRATIONS_DIR ?? defaultDir): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await withTransaction(db, async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    ran.push(file);
  }
  return ran;
}
