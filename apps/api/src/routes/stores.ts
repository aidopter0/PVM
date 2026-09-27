import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/pool.js';
import { notFound } from '../errors.js';

const storeBody = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(200),
  format: z.string().trim().max(50).nullish(),
  region: z.string().trim().max(100).nullish(),
  address: z.string().trim().max(500).nullish(),
});

const idParams = z.object({ id: z.uuid() });

const COLUMNS = 'id, code, name, format, region, address';

export function storeRoutes(app: FastifyInstance, db: Db) {
  app.get('/api/stores', async () => {
    const { rows } = await db.query(
      `SELECT ${COLUMNS}, (SELECT count(*)::int FROM store_planograms sp WHERE sp.store_id = s.id) AS planogram_count
         FROM stores s ORDER BY code`,
    );
    return rows.map(({ planogram_count, ...r }) => ({ ...r, planogramCount: planogram_count }));
  });

  app.post('/api/stores', async (req, reply) => {
    const b = storeBody.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO stores (code, name, format, region, address) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [b.code, b.name, b.format ?? null, b.region ?? null, b.address ?? null],
    );
    return reply.code(201).send(rows[0]);
  });

  app.put('/api/stores/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const b = storeBody.parse(req.body);
    const { rows } = await db.query(
      `UPDATE stores SET code = $2, name = $3, format = $4, region = $5, address = $6 WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, b.code, b.name, b.format ?? null, b.region ?? null, b.address ?? null],
    );
    if (!rows[0]) throw notFound('Store');
    return rows[0];
  });

  app.delete('/api/stores/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { rowCount } = await db.query('DELETE FROM stores WHERE id = $1', [id]);
    if (!rowCount) throw notFound('Store');
    return reply.code(204).send();
  });

  /** Planograms assigned to a store: the store's "planogram book". */
  app.get('/api/stores/:id/planograms', async (req) => {
    const { id } = idParams.parse(req.params);
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.status, p.fixture_type AS "fixtureType", sp.effective_from AS "effectiveFrom"
         FROM store_planograms sp JOIN planograms p ON p.id = sp.planogram_id
        WHERE sp.store_id = $1 ORDER BY p.name`,
      [id],
    );
    return rows;
  });
}
