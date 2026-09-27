import type { Bay, Issue, Planogram, Position, Product, Shelf } from './types.js';

export type ProductLookup = ReadonlyMap<string, Product>;

export function toLookup(products: readonly Product[]): ProductLookup {
  return new Map(products.map((p) => [p.id, p]));
}

/** Linear width a position occupies on the shelf. */
export function positionWidth(product: Product, position: Pick<Position, 'facings'>): number {
  return product.width * position.facings;
}

/** Units that fit front to back on a shelf of the given depth. */
export function unitsDeep(product: Product, shelfDepth: number): number {
  if (product.depth <= 0) return 0;
  return Math.max(0, Math.floor(shelfDepth / product.depth));
}

/** Total units a position holds when fully stocked. */
export function positionCapacity(product: Product, position: Position, shelf: Pick<Shelf, 'depth'>): number {
  return position.facings * position.stack * unitsDeep(product, shelf.depth);
}

/** Linear millimetres used on a shelf. */
export function shelfUsedWidth(shelf: Shelf, products: ProductLookup): number {
  return shelf.positions.reduce((sum, pos) => {
    const product = products.get(pos.productId);
    return product ? sum + positionWidth(product, pos) : sum;
  }, 0);
}

/** Fraction (0..1+) of the shelf width that is merchandised. */
export function shelfFill(shelf: Shelf, bayWidth: number, products: ProductLookup): number {
  if (bayWidth <= 0) return 0;
  return shelfUsedWidth(shelf, products) / bayWidth;
}

/** Checks a single shelf for physical placement problems. */
export function validateShelf(shelf: Shelf, bayWidth: number, products: ProductLookup): Issue[] {
  const issues: Issue[] = [];
  const spans: { pos: Position; start: number; end: number }[] = [];

  for (const pos of shelf.positions) {
    const product = products.get(pos.productId);
    if (!product) {
      issues.push({ code: 'UNKNOWN_PRODUCT', shelfId: shelf.id, positionId: pos.id, message: 'Product no longer exists' });
      continue;
    }
    const start = pos.x;
    const end = pos.x + positionWidth(product, pos);
    spans.push({ pos, start, end });

    if (start < 0) {
      issues.push({ code: 'OUT_OF_BOUNDS', shelfId: shelf.id, positionId: pos.id, message: `${product.name} starts before the shelf edge` });
    }
    if (end > bayWidth) {
      issues.push({
        code: 'OVERFLOW',
        shelfId: shelf.id,
        positionId: pos.id,
        message: `${product.name} overhangs the shelf by ${end - bayWidth} mm`,
      });
    }
    const stackedHeight = product.height * pos.stack;
    if (stackedHeight > shelf.clearance) {
      issues.push({
        code: 'TOO_TALL',
        shelfId: shelf.id,
        positionId: pos.id,
        message: `${product.name} is ${stackedHeight} mm tall but the shelf clearance is ${shelf.clearance} mm`,
      });
    }
    if (product.depth > shelf.depth) {
      issues.push({
        code: 'TOO_DEEP',
        shelfId: shelf.id,
        positionId: pos.id,
        message: `${product.name} is deeper than the shelf (${product.depth} > ${shelf.depth} mm)`,
      });
    }
  }

  spans.sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i++) {
    const prev = spans[i - 1]!;
    const cur = spans[i]!;
    if (cur.start < prev.end) {
      issues.push({
        code: 'OVERLAP',
        shelfId: shelf.id,
        positionId: cur.pos.id,
        message: `Overlaps the previous product by ${prev.end - cur.start} mm`,
      });
    }
  }

  return issues;
}

export function validatePlanogram(planogram: Pick<Planogram, 'bays'>, products: ProductLookup): Issue[] {
  return planogram.bays.flatMap((bay) => bay.shelves.flatMap((shelf) => validateShelf(shelf, bay.width, products)));
}

/**
 * Packs positions left to right with no gaps, keeping their current order.
 * Returns new position objects; the input is not mutated.
 */
export function compactShelf(positions: readonly Position[], products: ProductLookup): Position[] {
  let x = 0;
  return [...positions]
    .sort((a, b) => a.x - b.x)
    .map((pos) => {
      const product = products.get(pos.productId);
      const next = { ...pos, x };
      x += product ? positionWidth(product, pos) : 0;
      return next;
    });
}

/**
 * Finds the x closest to `preferredX` where a block of `width` fits on the
 * shelf without overlapping other positions. Returns null if there is no room.
 */
export function findFreeX(
  shelf: Shelf,
  bayWidth: number,
  width: number,
  products: ProductLookup,
  preferredX = 0,
  ignorePositionId?: string,
): number | null {
  const occupied = shelf.positions
    .filter((p) => p.id !== ignorePositionId)
    .map((p) => {
      const product = products.get(p.productId);
      return { start: p.x, end: p.x + (product ? positionWidth(product, p) : 0) };
    })
    .sort((a, b) => a.start - b.start);

  const fits = (x: number) => x >= 0 && x + width <= bayWidth && occupied.every((o) => x + width <= o.start || x >= o.end);

  const preferred = Math.max(0, Math.round(preferredX));
  // Any free slot is either at the preferred point or flush against a shelf edge or a neighbour.
  const candidates = [preferred, 0, bayWidth - width, ...occupied.flatMap((o) => [o.end, o.start - width])];
  let best: number | null = null;
  for (const x of candidates) {
    if (!fits(x)) continue;
    const dist = Math.abs(x - preferred);
    const bestDist = best === null ? Infinity : Math.abs(best - preferred);
    // On a tie, favour the slot to the right of the drop point.
    if (dist < bestDist || (dist === bestDist && best !== null && x > best)) best = x;
  }
  return best;
}

export interface SpaceShareRow {
  key: string;
  linearMm: number;
  facings: number;
  skuCount: number;
  share: number;
}

/**
 * Linear space share grouped by an attribute of the product (brand, category…).
 * This is the core KPI category managers use to compare space against sales share.
 */
export function spaceShare(
  bays: readonly Bay[],
  products: ProductLookup,
  groupBy: (product: Product) => string,
): SpaceShareRow[] {
  const rows = new Map<string, { linearMm: number; facings: number; skus: Set<string> }>();
  let total = 0;
  for (const bay of bays) {
    for (const shelf of bay.shelves) {
      for (const pos of shelf.positions) {
        const product = products.get(pos.productId);
        if (!product) continue;
        const key = groupBy(product);
        const row = rows.get(key) ?? { linearMm: 0, facings: 0, skus: new Set<string>() };
        const width = positionWidth(product, pos);
        row.linearMm += width;
        row.facings += pos.facings;
        row.skus.add(product.id);
        rows.set(key, row);
        total += width;
      }
    }
  }
  return [...rows.entries()]
    .map(([key, r]) => ({
      key,
      linearMm: r.linearMm,
      facings: r.facings,
      skuCount: r.skus.size,
      share: total === 0 ? 0 : r.linearMm / total,
    }))
    .sort((a, b) => b.linearMm - a.linearMm);
}

export interface PlanogramSummary {
  bayCount: number;
  shelfCount: number;
  skuCount: number;
  totalFacings: number;
  totalCapacity: number;
  linearAvailableMm: number;
  linearUsedMm: number;
  fill: number;
}

export function summarize(bays: readonly Bay[], products: ProductLookup): PlanogramSummary {
  const skus = new Set<string>();
  let shelfCount = 0;
  let totalFacings = 0;
  let totalCapacity = 0;
  let linearAvailableMm = 0;
  let linearUsedMm = 0;
  for (const bay of bays) {
    for (const shelf of bay.shelves) {
      shelfCount++;
      linearAvailableMm += bay.width;
      for (const pos of shelf.positions) {
        const product = products.get(pos.productId);
        if (!product) continue;
        skus.add(product.id);
        totalFacings += pos.facings;
        totalCapacity += positionCapacity(product, pos, shelf);
        linearUsedMm += positionWidth(product, pos);
      }
    }
  }
  return {
    bayCount: bays.length,
    shelfCount,
    skuCount: skus.size,
    totalFacings,
    totalCapacity,
    linearAvailableMm,
    linearUsedMm,
    fill: linearAvailableMm === 0 ? 0 : linearUsedMm / linearAvailableMm,
  };
}

/** Height of the base deck above the floor and thickness of a shelf, in mm. */
export const BASE_DECK_HEIGHT = 150;
export const SHELF_THICKNESS = 30;

/**
 * Builds an empty bay with shelves evenly spaced between the base deck and the
 * top of the fixture. Ids come from `newId` so client and server can share this.
 */
export function generateBay(
  opts: { width: number; height: number; depth: number; shelfCount: number; index?: number },
  newId: () => string,
): Bay {
  const count = Math.max(1, Math.floor(opts.shelfCount));
  const usable = Math.max(0, opts.height - BASE_DECK_HEIGHT);
  const pitch = Math.floor(usable / count);
  const shelves: Shelf[] = Array.from({ length: count }, (_, i) => {
    const y = BASE_DECK_HEIGHT + i * pitch;
    const clearance = i === count - 1 ? opts.height - y : pitch - SHELF_THICKNESS;
    return { id: newId(), index: i, y, clearance: Math.max(1, clearance), depth: opts.depth, positions: [] };
  });
  return { id: newId(), index: opts.index ?? 0, width: opts.width, height: opts.height, depth: opts.depth, shelves };
}

/**
 * Recomputes each shelf's clearance from the shelf above it (or the top of the
 * bay), so moving a shelf up or down keeps the vertical limits consistent.
 */
export function recomputeClearances(bay: Bay): Bay {
  const sorted = [...bay.shelves].sort((a, b) => a.y - b.y);
  const shelves = sorted.map((shelf, i) => {
    const above = sorted[i + 1];
    const limit = above ? above.y - SHELF_THICKNESS : bay.height;
    return { ...shelf, index: i, clearance: Math.max(1, limit - shelf.y) };
  });
  return { ...bay, shelves };
}
