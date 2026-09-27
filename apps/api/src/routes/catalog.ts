import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/pool.js';
import { withTransaction } from '../db/pool.js';
import { PRODUCT_COLUMNS, toProduct, type ProductRow } from '../db/mappers.js';
import { parseCsv } from '../csv.js';
import { HttpError, notFound } from '../errors.js';

const mm = z.number().int().positive().max(10_000);

const productBody = z.object({
  sku: z.string().trim().min(1).max(64),
  gtin: z.string().trim().max(32).nullish(),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(100).nullish(),
  categoryId: z.uuid().nullish(),
  width: mm,
  height: mm,
  depth: mm,
  price: z.number().nonnegative().nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish(),
  imageUrl: z.url().nullish(),
});

const categoryBody = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.uuid().nullish(),
});

const idParams = z.object({ id: z.uuid() });

export function catalogRoutes(app: FastifyInstance, db: Db) {
  app.get('/api/categories', async () => {
    const { rows } = await db.query('SELECT id, name, parent_id FROM categories ORDER BY name');
    return rows.map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id }));
  });

  app.post('/api/categories', async (req, reply) => {
    const body = categoryBody.parse(req.body);
    const { rows } = await db.query('INSERT INTO categories (name, parent_id) VALUES ($1, $2) RETURNING id, name, parent_id', [
      body.name,
      body.parentId ?? null,
    ]);
    const r = rows[0];
    return reply.code(201).send({ id: r.id, name: r.name, parentId: r.parent_id });
  });

  app.delete('/api/categories/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { rowCount } = await db.query('DELETE FROM categories WHERE id = $1', [id]);
    if (!rowCount) throw notFound('Category');
    return reply.code(204).send();
  });

  app.get('/api/products', async (req) => {
    const query = z
      .object({ q: z.string().optional(), categoryId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(5000).default(1000) })
      .parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`);
      where.push(`(lower(name) LIKE $${params.length} OR lower(sku) LIKE $${params.length} OR lower(coalesce(brand, '')) LIKE $${params.length} OR gtin LIKE $${params.length})`);
    }
    if (query.categoryId) {
      params.push(query.categoryId);
      where.push(`category_id = $${params.length}`);
    }
    params.push(query.limit);
    const { rows } = await db.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM products ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY name LIMIT $${params.length}`,
      params,
    );
    return rows.map(toProduct);
  });

  app.get('/api/products/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const { rows } = await db.query<ProductRow>(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`, [id]);
    if (!rows[0]) throw notFound('Product');
    return toProduct(rows[0]);
  });

  app.post('/api/products', async (req, reply) => {
    const b = productBody.parse(req.body);
    const { rows } = await db.query<ProductRow>(
      `INSERT INTO products (sku, gtin, name, brand, category_id, width, height, depth, price, color, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${PRODUCT_COLUMNS}`,
      [b.sku, b.gtin ?? null, b.name, b.brand ?? null, b.categoryId ?? null, b.width, b.height, b.depth, b.price ?? null, b.color ?? null, b.imageUrl ?? null],
    );
    return reply.code(201).send(toProduct(rows[0]!));
  });

  app.put('/api/products/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const b = productBody.parse(req.body);
    const { rows } = await db.query<ProductRow>(
      `UPDATE products SET sku = $2, gtin = $3, name = $4, brand = $5, category_id = $6, width = $7, height = $8,
              depth = $9, price = $10, color = $11, image_url = $12, updated_at = now()
        WHERE id = $1 RETURNING ${PRODUCT_COLUMNS}`,
      [id, b.sku, b.gtin ?? null, b.name, b.brand ?? null, b.categoryId ?? null, b.width, b.height, b.depth, b.price ?? null, b.color ?? null, b.imageUrl ?? null],
    );
    if (!rows[0]) throw notFound('Product');
    return toProduct(rows[0]);
  });

  app.delete('/api/products/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { rowCount } = await db.query('DELETE FROM products WHERE id = $1', [id]);
    if (!rowCount) throw notFound('Product');
    return reply.code(204).send();
  });

  /**
   * Bulk upsert from CSV (text/csv body). Required columns: sku, name, width, height, depth.
   * Optional: gtin, brand, category (created by name when missing), price, color, image_url.
   */
  app.post('/api/products/import', async (req) => {
    if (typeof req.body !== 'string') throw new HttpError(400, 'Send the CSV as a text/csv request body');
    const records = parseCsv(req.body);
    if (records.length === 0) throw new HttpError(400, 'CSV has no data rows');

    const errors: { row: number; message: string }[] = [];
    const valid: { row: number; data: z.infer<typeof productBody>; category: string | null }[] = [];
    records.forEach((rec, i) => {
      const num = (v: string | undefined) => (v === undefined || v === '' ? undefined : Number(v));
      const parsed = productBody.safeParse({
        sku: rec.sku,
        gtin: rec.gtin || null,
        name: rec.name,
        brand: rec.brand || null,
        width: num(rec.width),
        height: num(rec.height),
        depth: num(rec.depth),
        price: num(rec.price) ?? null,
        color: rec.color || null,
        imageUrl: rec.image_url || null,
      });
      // Row numbers are 1-based and count the header line, matching what a spreadsheet shows.
      if (parsed.success) valid.push({ row: i + 2, data: parsed.data, category: rec.category || null });
      else errors.push({ row: i + 2, message: parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') });
    });

    let created = 0;
    let updated = 0;
    await withTransaction(db, async (client) => {
      const categoryIds = new Map<string, string>();
      for (const { data, category } of valid) {
        let categoryId: string | null = null;
        if (category) {
          categoryId = categoryIds.get(category) ?? null;
          if (!categoryId) {
            const existing = await client.query('SELECT id FROM categories WHERE name = $1 AND parent_id IS NULL', [category]);
            categoryId =
              existing.rows[0]?.id ??
              (await client.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [category])).rows[0].id;
            categoryIds.set(category, categoryId!);
          }
        }
        const { rows } = await client.query<{ inserted: boolean }>(
          `INSERT INTO products (sku, gtin, name, brand, category_id, width, height, depth, price, color, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (sku) DO UPDATE SET gtin = EXCLUDED.gtin, name = EXCLUDED.name, brand = EXCLUDED.brand,
             category_id = COALESCE(EXCLUDED.category_id, products.category_id), width = EXCLUDED.width,
             height = EXCLUDED.height, depth = EXCLUDED.depth, price = EXCLUDED.price,
             color = COALESCE(EXCLUDED.color, products.color), image_url = COALESCE(EXCLUDED.image_url, products.image_url),
             updated_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [data.sku, data.gtin ?? null, data.name, data.brand ?? null, categoryId, data.width, data.height, data.depth, data.price ?? null, data.color ?? null, data.imageUrl ?? null],
        );
        if (rows[0]?.inserted) created++;
        else updated++;
      }
    });

    return { created, updated, errors };
  });
}
