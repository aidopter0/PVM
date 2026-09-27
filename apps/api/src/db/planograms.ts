import type { Bay, FixtureType, Planogram, PlanogramStatus, Product } from '@pvm/shared';
import type { Queryable } from './pool.js';
import { PRODUCT_COLUMNS, toProduct, type ProductRow } from './mappers.js';

interface PlanogramRow {
  id: string;
  name: string;
  status: PlanogramStatus;
  fixture_type: FixtureType;
  category_id: string | null;
  notes: string | null;
  updated_at: Date;
}

export async function loadPlanogram(db: Queryable, id: string): Promise<Planogram | null> {
  const { rows } = await db.query<PlanogramRow>(
    'SELECT id, name, status, fixture_type, category_id, notes, updated_at FROM planograms WHERE id = $1',
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const [bays, shelves, positions] = await Promise.all([
    db.query('SELECT id, idx, width, height, depth FROM bays WHERE planogram_id = $1 ORDER BY idx', [id]),
    db.query(
      `SELECT s.id, s.bay_id, s.idx, s.y, s.clearance, s.depth
         FROM shelves s JOIN bays b ON b.id = s.bay_id
        WHERE b.planogram_id = $1 ORDER BY s.idx`,
      [id],
    ),
    db.query(
      `SELECT p.id, p.shelf_id, p.product_id, p.x, p.facings, p.stack
         FROM positions p JOIN shelves s ON s.id = p.shelf_id JOIN bays b ON b.id = s.bay_id
        WHERE b.planogram_id = $1 ORDER BY p.x`,
      [id],
    ),
  ]);

  const byShelf = new Map<string, Bay['shelves'][number]['positions']>();
  for (const p of positions.rows) {
    const list = byShelf.get(p.shelf_id) ?? [];
    list.push({ id: p.id, productId: p.product_id, x: p.x, facings: p.facings, stack: p.stack });
    byShelf.set(p.shelf_id, list);
  }
  const byBay = new Map<string, Bay['shelves']>();
  for (const s of shelves.rows) {
    const list = byBay.get(s.bay_id) ?? [];
    list.push({ id: s.id, index: s.idx, y: s.y, clearance: s.clearance, depth: s.depth, positions: byShelf.get(s.id) ?? [] });
    byBay.set(s.bay_id, list);
  }

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    fixtureType: row.fixture_type,
    categoryId: row.category_id,
    notes: row.notes,
    updatedAt: row.updated_at.toISOString(),
    bays: bays.rows.map((b) => ({
      id: b.id,
      index: b.idx,
      width: b.width,
      height: b.height,
      depth: b.depth,
      shelves: byBay.get(b.id) ?? [],
    })),
  };
}

/** Replaces the entire bay/shelf/position tree of a planogram. Call inside a transaction. */
export async function replaceLayout(db: Queryable, planogramId: string, bays: Bay[]): Promise<void> {
  await db.query('DELETE FROM bays WHERE planogram_id = $1', [planogramId]);
  for (const [bi, bay] of bays.entries()) {
    await db.query('INSERT INTO bays (id, planogram_id, idx, width, height, depth) VALUES ($1, $2, $3, $4, $5, $6)', [
      bay.id,
      planogramId,
      bi,
      bay.width,
      bay.height,
      bay.depth,
    ]);
    for (const [si, shelf] of bay.shelves.entries()) {
      await db.query('INSERT INTO shelves (id, bay_id, idx, y, clearance, depth) VALUES ($1, $2, $3, $4, $5, $6)', [
        shelf.id,
        bay.id,
        si,
        shelf.y,
        shelf.clearance,
        shelf.depth,
      ]);
      for (const pos of shelf.positions) {
        await db.query(
          'INSERT INTO positions (id, shelf_id, product_id, x, facings, stack) VALUES ($1, $2, $3, $4, $5, $6)',
          [pos.id, shelf.id, pos.productId, pos.x, pos.facings, pos.stack],
        );
      }
    }
  }
}

export async function productsForPlanogram(db: Queryable, planogram: Planogram): Promise<Product[]> {
  const ids = [...new Set(planogram.bays.flatMap((b) => b.shelves.flatMap((s) => s.positions.map((p) => p.productId))))];
  if (ids.length === 0) return [];
  const { rows } = await db.query<ProductRow>(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ANY($1::uuid[])`, [ids]);
  return rows.map(toProduct);
}
