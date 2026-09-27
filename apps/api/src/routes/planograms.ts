import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateBay, spaceShare, summarize, toLookup, validatePlanogram, type Bay } from '@pvm/shared';
import type { Db } from '../db/pool.js';
import { withTransaction } from '../db/pool.js';
import { loadPlanogram, productsForPlanogram, replaceLayout } from '../db/planograms.js';
import { HttpError, notFound } from '../errors.js';

const mm = z.number().int().positive().max(20_000);
const status = z.enum(['DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED']);
const fixtureType = z.enum(['SHELVING', 'CHILLER', 'FREEZER', 'PEGBOARD', 'END_CAP']);

const positionSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  x: z.number().int().min(-20_000).max(20_000),
  facings: z.number().int().min(1).max(200),
  stack: z.number().int().min(1).max(50),
});

const shelfSchema = z.object({
  id: z.uuid(),
  index: z.number().int().min(0),
  y: z.number().int().min(0).max(20_000),
  clearance: mm,
  depth: mm,
  positions: z.array(positionSchema).max(500),
});

const baySchema = z.object({
  id: z.uuid(),
  index: z.number().int().min(0),
  width: mm,
  height: mm,
  depth: mm,
  shelves: z.array(shelfSchema).max(50),
});

const meta = z.object({
  name: z.string().trim().min(1).max(200),
  fixtureType: fixtureType.default('SHELVING'),
  categoryId: z.uuid().nullish(),
  notes: z.string().max(5000).nullish(),
});

const createBody = meta.extend({
  template: z
    .object({
      bays: z.number().int().min(1).max(40).default(3),
      bayWidth: mm.default(1000),
      bayHeight: mm.default(1950),
      bayDepth: mm.default(450),
      shelvesPerBay: z.number().int().min(1).max(20).default(5),
    })
    .default({ bays: 3, bayWidth: 1000, bayHeight: 1950, bayDepth: 450, shelvesPerBay: 5 }),
});

const updateBody = meta.extend({
  bays: z.array(baySchema).max(40),
  /** Optimistic concurrency: the updatedAt the client last loaded. */
  updatedAt: z.string().optional(),
});

const idParams = z.object({ id: z.uuid() });

export function planogramRoutes(app: FastifyInstance, db: Db) {
  app.get('/api/planograms', async (req) => {
    const q = z.object({ status: status.optional(), categoryId: z.uuid().optional() }).parse(req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (q.status) {
      params.push(q.status);
      where.push(`p.status = $${params.length}`);
    }
    if (q.categoryId) {
      params.push(q.categoryId);
      where.push(`p.category_id = $${params.length}`);
    }
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.status, p.fixture_type AS "fixtureType", p.category_id AS "categoryId",
              p.updated_at AS "updatedAt",
              (SELECT count(*)::int FROM bays b WHERE b.planogram_id = p.id) AS "bayCount",
              (SELECT coalesce(sum(b.width), 0)::int FROM bays b WHERE b.planogram_id = p.id) AS "totalWidth",
              (SELECT count(DISTINCT pos.product_id)::int FROM positions pos
                 JOIN shelves s ON s.id = pos.shelf_id JOIN bays b ON b.id = s.bay_id
                WHERE b.planogram_id = p.id) AS "skuCount",
              (SELECT count(*)::int FROM store_planograms sp WHERE sp.planogram_id = p.id) AS "storeCount"
         FROM planograms p ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.updated_at DESC`,
      params,
    );
    return rows;
  });

  app.post('/api/planograms', async (req, reply) => {
    const b = createBody.parse(req.body);
    const bays: Bay[] = Array.from({ length: b.template.bays }, (_, index) =>
      generateBay(
        { width: b.template.bayWidth, height: b.template.bayHeight, depth: b.template.bayDepth, shelfCount: b.template.shelvesPerBay, index },
        randomUUID,
      ),
    );
    const id = await withTransaction(db, async (client) => {
      const { rows } = await client.query(
        'INSERT INTO planograms (name, fixture_type, category_id, notes) VALUES ($1, $2, $3, $4) RETURNING id',
        [b.name, b.fixtureType, b.categoryId ?? null, b.notes ?? null],
      );
      await replaceLayout(client, rows[0].id, bays);
      return rows[0].id as string;
    });
    return reply.code(201).send(await loadPlanogram(db, id));
  });

  app.get('/api/planograms/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const planogram = await loadPlanogram(db, id);
    if (!planogram) throw notFound('Planogram');
    return { planogram, products: await productsForPlanogram(db, planogram) };
  });

  /** Saves metadata and the full layout in one transaction. */
  app.put('/api/planograms/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const b = updateBody.parse(req.body);
    await withTransaction(db, async (client) => {
      const { rows } = await client.query('SELECT status, updated_at FROM planograms WHERE id = $1 FOR UPDATE', [id]);
      const current = rows[0];
      if (!current) throw notFound('Planogram');
      if (current.status === 'PUBLISHED' || current.status === 'ARCHIVED') {
        throw new HttpError(409, `A ${current.status.toLowerCase()} planogram is read-only; duplicate it to make changes`);
      }
      if (b.updatedAt && new Date(b.updatedAt).getTime() !== (current.updated_at as Date).getTime()) {
        throw new HttpError(409, 'This planogram was changed by someone else. Reload to see the latest version.');
      }
      await client.query(
        'UPDATE planograms SET name = $2, fixture_type = $3, category_id = $4, notes = $5, updated_at = now() WHERE id = $1',
        [id, b.name, b.fixtureType, b.categoryId ?? null, b.notes ?? null],
      );
      await replaceLayout(client, id, b.bays);
    });
    const planogram = await loadPlanogram(db, id);
    return { planogram, products: await productsForPlanogram(db, planogram!) };
  });

  app.patch('/api/planograms/:id/status', async (req) => {
    const { id } = idParams.parse(req.params);
    const b = z.object({ status }).parse(req.body);
    if (b.status === 'APPROVED' || b.status === 'PUBLISHED') {
      const planogram = await loadPlanogram(db, id);
      if (!planogram) throw notFound('Planogram');
      const issues = validatePlanogram(planogram, toLookup(await productsForPlanogram(db, planogram)));
      if (issues.length > 0) {
        throw new HttpError(422, `Fix ${issues.length} placement issue(s) before moving to ${b.status.toLowerCase()}`);
      }
    }
    const { rows } = await db.query(
      'UPDATE planograms SET status = $2, updated_at = now() WHERE id = $1 RETURNING id, status, updated_at AS "updatedAt"',
      [id, b.status],
    );
    if (!rows[0]) throw notFound('Planogram');
    return rows[0];
  });

  app.post('/api/planograms/:id/duplicate', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const source = await loadPlanogram(db, id);
    if (!source) throw notFound('Planogram');
    const bays: Bay[] = source.bays.map((bay) => ({
      ...bay,
      id: randomUUID(),
      shelves: bay.shelves.map((shelf) => ({
        ...shelf,
        id: randomUUID(),
        positions: shelf.positions.map((p) => ({ ...p, id: randomUUID() })),
      })),
    }));
    const newId = await withTransaction(db, async (client) => {
      const { rows } = await client.query(
        'INSERT INTO planograms (name, fixture_type, category_id, notes) VALUES ($1, $2, $3, $4) RETURNING id',
        [`${source.name} (copy)`, source.fixtureType, source.categoryId, source.notes],
      );
      await replaceLayout(client, rows[0].id, bays);
      return rows[0].id as string;
    });
    return reply.code(201).send(await loadPlanogram(db, newId));
  });

  app.delete('/api/planograms/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { rowCount } = await db.query('DELETE FROM planograms WHERE id = $1', [id]);
    if (!rowCount) throw notFound('Planogram');
    return reply.code(204).send();
  });

  app.get('/api/planograms/:id/report', async (req) => {
    const { id } = idParams.parse(req.params);
    const planogram = await loadPlanogram(db, id);
    if (!planogram) throw notFound('Planogram');
    const products = await productsForPlanogram(db, planogram);
    const lookup = toLookup(products);
    const { rows: categories } = await db.query<{ id: string; name: string }>('SELECT id, name FROM categories');
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    return {
      summary: summarize(planogram.bays, lookup),
      issues: validatePlanogram(planogram, lookup),
      byBrand: spaceShare(planogram.bays, lookup, (p) => p.brand ?? 'Unbranded'),
      byCategory: spaceShare(planogram.bays, lookup, (p) => (p.categoryId && categoryName.get(p.categoryId)) || 'Uncategorised'),
    };
  });

  app.get('/api/planograms/:id/stores', async (req) => {
    const { id } = idParams.parse(req.params);
    const { rows } = await db.query(
      `SELECT s.id, s.code, s.name, sp.effective_from AS "effectiveFrom"
         FROM store_planograms sp JOIN stores s ON s.id = sp.store_id
        WHERE sp.planogram_id = $1 ORDER BY s.code`,
      [id],
    );
    return rows;
  });

  /** Replaces the set of stores this planogram is assigned to. */
  app.put('/api/planograms/:id/stores', async (req) => {
    const { id } = idParams.parse(req.params);
    const b = z
      .object({ storeIds: z.array(z.uuid()).max(10_000), effectiveFrom: z.iso.date().optional() })
      .parse(req.body);
    await withTransaction(db, async (client) => {
      const exists = await client.query('SELECT 1 FROM planograms WHERE id = $1', [id]);
      if (!exists.rowCount) throw notFound('Planogram');
      await client.query('DELETE FROM store_planograms WHERE planogram_id = $1 AND NOT (store_id = ANY($2::uuid[]))', [id, b.storeIds]);
      await client.query(
        `INSERT INTO store_planograms (store_id, planogram_id, effective_from)
         SELECT unnest($2::uuid[]), $1, coalesce($3::date, CURRENT_DATE)
         ON CONFLICT (store_id, planogram_id) DO UPDATE SET effective_from = coalesce($3::date, store_planograms.effective_from)`,
        [id, b.storeIds, b.effectiveFrom ?? null],
      );
    });
    return { assigned: b.storeIds.length };
  });
}
