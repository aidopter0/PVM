import './env.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { seedDemo } from './db/demo.js';
import { buildApp } from './app.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run `npm run setup` to create .env and a Postgres database.');
  process.exit(1);
}
const db = createPool();
if (process.env.MIGRATE_ON_START !== 'false') {
  const ran = await migrate(db);
  if (ran.length) console.log(`Applied migrations: ${ran.join(', ')}`);
}
// SEED_DEMO=true loads the demo data into an empty database at startup.
if (process.env.SEED_DEMO === 'true' && (await seedDemo(db))) console.log('Loaded demo data.');

// The built web app sits next to the API in the repo; Docker sets WEB_DIST explicitly.
const repoWebDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
const webDist = process.env.WEB_DIST ?? (existsSync(repoWebDist) ? repoWebDist : undefined);

const app = await buildApp({ db, webDist, logger: { level: process.env.LOG_LEVEL ?? 'info' } });
const port = Number(process.env.API_PORT ?? 3000);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
console.log(webDist ? `PVM is running at http://localhost:${port}` : `API listening on http://localhost:${port} (web app not built)`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
}
