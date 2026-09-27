import { describe, expect, it } from 'vitest';
import {
  compactShelf,
  findFreeX,
  generateBay,
  positionCapacity,
  recomputeClearances,
  spaceShare,
  summarize,
  toLookup,
  validateShelf,
  type Bay,
  type Product,
  type Shelf,
} from '../src/index.js';

const product = (id: string, width: number, height: number, depth: number, brand = 'Acme'): Product => ({
  id,
  sku: id,
  gtin: null,
  name: `Product ${id}`,
  brand,
  categoryId: null,
  price: null,
  color: null,
  imageUrl: null,
  width,
  height,
  depth,
});

const products = toLookup([product('a', 100, 200, 80), product('b', 50, 300, 60, 'Other')]);

const shelf = (positions: Shelf['positions']): Shelf => ({
  id: 's1',
  index: 0,
  y: 0,
  clearance: 350,
  depth: 400,
  positions,
});

describe('validateShelf', () => {
  it('accepts a valid layout', () => {
    const s = shelf([
      { id: 'p1', productId: 'a', x: 0, facings: 2, stack: 1 },
      { id: 'p2', productId: 'b', x: 200, facings: 3, stack: 1 },
    ]);
    expect(validateShelf(s, 1000, products)).toEqual([]);
  });

  it('flags overflow, overlap and height problems', () => {
    const s = shelf([
      { id: 'p1', productId: 'a', x: 0, facings: 3, stack: 2 },
      { id: 'p2', productId: 'b', x: 250, facings: 2, stack: 1 },
      { id: 'p3', productId: 'a', x: 950, facings: 1, stack: 1 },
    ]);
    const codes = validateShelf(s, 1000, products).map((i) => `${i.code}:${i.positionId}`);
    expect(codes).toContain('TOO_TALL:p1');
    expect(codes).toContain('OVERLAP:p2');
    expect(codes).toContain('OVERFLOW:p3');
  });

  it('flags products deeper than the shelf', () => {
    const s = { ...shelf([{ id: 'p1', productId: 'a', x: 0, facings: 1, stack: 1 }]), depth: 50 };
    expect(validateShelf(s, 1000, products).map((i) => i.code)).toEqual(['TOO_DEEP']);
  });
});

describe('capacity', () => {
  it('multiplies facings, stack and units deep', () => {
    // 400 mm deep shelf / 80 mm deep product = 5 deep
    expect(positionCapacity(products.get('a')!, { id: 'p', productId: 'a', x: 0, facings: 2, stack: 1 }, { depth: 400 })).toBe(10);
  });
});

describe('compactShelf', () => {
  it('removes gaps while keeping order', () => {
    const out = compactShelf(
      [
        { id: 'p2', productId: 'b', x: 500, facings: 1, stack: 1 },
        { id: 'p1', productId: 'a', x: 120, facings: 2, stack: 1 },
      ],
      products,
    );
    expect(out.map((p) => [p.id, p.x])).toEqual([
      ['p1', 0],
      ['p2', 200],
    ]);
  });
});

describe('findFreeX', () => {
  const s = shelf([{ id: 'p1', productId: 'a', x: 100, facings: 2, stack: 1 }]); // occupies 100..300

  it('uses the preferred spot when free', () => {
    expect(findFreeX(s, 1000, 100, products, 400)).toBe(400);
  });

  it('moves past an occupied block', () => {
    expect(findFreeX(s, 1000, 100, products, 150)).toBe(300);
  });

  it('picks the nearest gap and returns null when full', () => {
    expect(findFreeX(s, 400, 100, products, 350)).toBe(300);
    expect(findFreeX(s, 300, 150, products, 0)).toBeNull();
  });
});

describe('spaceShare and summarize', () => {
  const bays: Bay[] = [
    {
      id: 'b1',
      index: 0,
      width: 1000,
      height: 2000,
      depth: 400,
      shelves: [
        shelf([
          { id: 'p1', productId: 'a', x: 0, facings: 3, stack: 1 },
          { id: 'p2', productId: 'b', x: 300, facings: 2, stack: 1 },
        ]),
      ],
    },
  ];

  it('computes share by brand', () => {
    const rows = spaceShare(bays, products, (p) => p.brand ?? 'Unbranded');
    expect(rows.map((r) => [r.key, r.linearMm, Number(r.share.toFixed(2))])).toEqual([
      ['Acme', 300, 0.75],
      ['Other', 100, 0.25],
    ]);
  });

  it('summarizes the planogram', () => {
    const s = summarize(bays, products);
    expect(s).toMatchObject({ bayCount: 1, shelfCount: 1, skuCount: 2, totalFacings: 5, linearUsedMm: 400, fill: 0.4 });
    // a: 3 facings * 5 deep = 15, b: 2 facings * 6 deep = 12
    expect(s.totalCapacity).toBe(27);
  });
});

describe('generateBay', () => {
  it('spaces shelves evenly and leaves the top shelf open to the bay height', () => {
    let n = 0;
    const bay = generateBay({ width: 1000, height: 1950, depth: 450, shelfCount: 4 }, () => `id${n++}`);
    expect(bay.shelves.map((s) => s.y)).toEqual([150, 600, 1050, 1500]);
    expect(bay.shelves.map((s) => s.clearance)).toEqual([420, 420, 420, 450]);
  });

  it('recomputes clearances after a shelf moves', () => {
    let n = 0;
    const bay = generateBay({ width: 1000, height: 1950, depth: 450, shelfCount: 2 }, () => `id${n++}`);
    bay.shelves[1]!.y = 1200;
    expect(recomputeClearances(bay).shelves.map((s) => s.clearance)).toEqual([1020, 750]);
  });
});
