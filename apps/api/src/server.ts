import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { buildApp } from './app.js';

const db = createPool();
if (process.env.MIGRATE_ON_START !== 'false') {
  const ran = await migrate(db);
  if (ran.length) console.log(`Applied migrations: ${ran.join(', ')}`);
}

const app = await buildApp({ db, webDist: process.env.WEB_DIST, logger: { level: process.env.LOG_LEVEL ?? 'info' } });
const port = Number(process.env.API_PORT ?? 3000);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
}
