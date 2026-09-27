import '../env.js';
import { createPool } from './pool.js';
import { migrate } from './migrate.js';
import { seedDemo } from './demo.js';

const db = createPool();
try {
  await migrate(db);
  console.log((await seedDemo(db)) ? 'Loaded demo data.' : 'Database already has products; skipping demo data.');
} finally {
  await db.end();
}
