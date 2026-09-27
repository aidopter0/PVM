import { existsSync } from 'node:fs';
import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { Db } from './db/pool.js';
import { HttpError } from './errors.js';
import { catalogRoutes } from './routes/catalog.js';
import { planogramRoutes } from './routes/planograms.js';
import { storeRoutes } from './routes/stores.js';

export interface AppOptions {
  db: Db;
  /** Directory with the built web app to serve at /. Skipped when missing. */
  webDist?: string;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ db, webDist, logger = false }: AppOptions) {
  const app = Fastify({ logger, bodyLimit: 10 * 1024 * 1024 });

  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? false });
  app.addContentTypeParser(['text/csv', 'text/plain'], { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', details: err.issues });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '23505') return reply.code(409).send({ error: 'A record with that value already exists' });
    if (pgCode === '23503') return reply.code(409).send({ error: 'This record is still referenced elsewhere' });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  app.get('/api/health', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });

  catalogRoutes(app, db);
  storeRoutes(app, db);
  planogramRoutes(app, db);

  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    // Client-side routing: unknown non-API page paths (no file extension) get the SPA shell.
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0]!;
      if (req.method === 'GET' && !path.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(path)) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  return app;
}
