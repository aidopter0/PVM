/**
 * A small demo dataset: grocery categories, products with real-world
 * dimensions, a few stores and a merchandised cereal planogram.
 */
import { randomUUID } from 'node:crypto';
import { compactShelf, generateBay, toLookup, type Bay, type Product } from '@pvm/shared';
import { withTransaction, type Db } from './pool.js';
import { replaceLayout } from './planograms.js';

type SeedProduct = [sku: string, name: string, brand: string, w: number, h: number, d: number, price: number, color: string];

const catalog: Record<string, SeedProduct[]> = {
  'Breakfast Cereal': [
    ['CER-001', 'Corn Flakes 500g', 'Morning Farm', 195, 290, 70, 3.49, '#f2b134'],
    ['CER-002', 'Corn Flakes 750g', 'Morning Farm', 225, 330, 80, 4.59, '#f2b134'],
    ['CER-003', 'Honey Oat Clusters 450g', 'Morning Farm', 190, 280, 70, 3.99, '#d98e04'],
    ['CER-004', 'Choco Puffs 375g', 'Kiddo', 190, 270, 65, 3.79, '#6b3e26'],
    ['CER-005', 'Fruity Rings 400g', 'Kiddo', 190, 275, 65, 3.89, '#e2445c'],
    ['CER-006', 'Bran Flakes 500g', 'Good Grain', 195, 290, 70, 2.99, '#a0522d'],
    ['CER-007', 'Muesli No Added Sugar 750g', 'Good Grain', 160, 250, 95, 4.29, '#8fbc8f'],
    ['CER-008', 'Porridge Oats 1kg', 'Good Grain', 150, 230, 95, 1.99, '#e8d8b0'],
    ['CER-009', 'Granola Berry 500g', 'Nordic Bake', 130, 250, 80, 4.99, '#9b2d5f'],
    ['CER-010', 'Wheat Biscuits 24pk', 'Nordic Bake', 225, 190, 120, 3.29, '#c19a6b'],
    ['CER-011', 'Store Brand Corn Flakes 500g', 'Value', 195, 290, 70, 1.49, '#ffd966'],
    ['CER-012', 'Store Brand Rice Pops 440g', 'Value', 190, 280, 65, 1.59, '#9fc5e8'],
  ],
  'Soft Drinks': [
    ['SDR-001', 'Cola 2L', 'Fizz Co', 105, 330, 105, 1.99, '#b22222'],
    ['SDR-002', 'Cola Zero 2L', 'Fizz Co', 105, 330, 105, 1.99, '#222222'],
    ['SDR-003', 'Lemon Lime 2L', 'Fizz Co', 105, 330, 105, 1.89, '#7cc242'],
    ['SDR-004', 'Orange Soda 1.5L', 'Sunny', 95, 310, 95, 1.59, '#ff8c00'],
    ['SDR-005', 'Sparkling Water 1.5L', 'Pure Spring', 95, 310, 95, 0.89, '#87ceeb'],
    ['SDR-006', 'Cola Cans 6x330ml', 'Fizz Co', 200, 125, 135, 3.49, '#b22222'],
  ],
  Yogurt: [
    ['YOG-001', 'Greek Yogurt Plain 500g', 'Alpine Dairy', 110, 95, 110, 2.49, '#f5f5f5'],
    ['YOG-002', 'Strawberry Yogurt 4x125g', 'Alpine Dairy', 130, 80, 130, 1.99, '#ff9aa2'],
    ['YOG-003', 'Vanilla Yogurt 500g', 'Meadow', 110, 95, 110, 2.19, '#fff2cc'],
    ['YOG-004', 'Kids Yogurt Tubes 8pk', 'Kiddo', 150, 60, 110, 2.79, '#b4a7d6'],
  ],
  Snacks: [
    ['SNK-001', 'Salted Crisps 150g', 'Crunchy', 200, 290, 70, 1.79, '#4f81bd'],
    ['SNK-002', 'Cheese & Onion Crisps 150g', 'Crunchy', 200, 290, 70, 1.79, '#2e8b57'],
    ['SNK-003', 'Tortilla Chips 200g', 'Olé', 210, 300, 80, 1.99, '#ffcc00'],
    ['SNK-004', 'Salted Pretzels 175g', 'Twist', 180, 260, 70, 1.49, '#8b4513'],
  ],
};

/** Loads the demo data into an empty database. Returns false (and does nothing) if any products exist. */
export async function seedDemo(db: Db): Promise<boolean> {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM products');
  if (rows[0].n > 0) return false;
  await withTransaction(db, async (client) => {
    const products: Product[] = [];
    const categoryIds: Record<string, string> = {};
    for (const [category, items] of Object.entries(catalog)) {
      const cat = await client.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [category]);
      categoryIds[category] = cat.rows[0].id;
      for (const [sku, name, brand, width, height, depth, price, color] of items) {
        const r = await client.query(
          `INSERT INTO products (sku, name, brand, category_id, width, height, depth, price, color)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [sku, name, brand, cat.rows[0].id, width, height, depth, price, color],
        );
        products.push({ id: r.rows[0].id, sku, gtin: null, name, brand, categoryId: cat.rows[0].id, width, height, depth, price, color, imageUrl: null });
      }
    }

    const stores = [
      ['S001', 'Downtown Market', 'Supermarket', 'North'],
      ['S002', 'Riverside Express', 'Convenience', 'North'],
      ['S003', 'Hillside Superstore', 'Hypermarket', 'South'],
    ];
    const storeIds: string[] = [];
    for (const [code, name, format, region] of stores) {
      const r = await client.query('INSERT INTO stores (code, name, format, region) VALUES ($1, $2, $3, $4) RETURNING id', [code, name, format, region]);
      storeIds.push(r.rows[0].id);
    }

    // Cereal aisle: 3 bays x 5 shelves. Kids' brands at child eye level (lower
    // shelves), premium in the middle, value on the bottom.
    const cereal = products.filter((p) => p.sku.startsWith('CER-'));
    const bySku = (sku: string) => cereal.find((p) => p.sku === sku)!;
    const lookup = toLookup(products);
    const bays: Bay[] = [0, 1, 2].map((index) => generateBay({ width: 1000, height: 1950, depth: 450, shelfCount: 5, index }, randomUUID));
    const plan: [bay: number, shelf: number, sku: string, facings: number][] = [
      [0, 0, 'CER-011', 3], [0, 0, 'CER-012', 2],
      [0, 1, 'CER-004', 3], [0, 1, 'CER-005', 2],
      [0, 2, 'CER-001', 3], [0, 2, 'CER-003', 2],
      [0, 3, 'CER-002', 4],
      [0, 4, 'CER-001', 2], [0, 4, 'CER-002', 2],
      [1, 0, 'CER-008', 6],
      [1, 1, 'CER-006', 3], [1, 1, 'CER-003', 2],
      [1, 2, 'CER-009', 4], [1, 2, 'CER-007', 2],
      [1, 3, 'CER-010', 4],
      [1, 4, 'CER-009', 3], [1, 4, 'CER-007', 3],
      [2, 0, 'CER-012', 5],
      [2, 1, 'CER-005', 2], [2, 1, 'CER-004', 3],
      [2, 2, 'CER-001', 5],
      [2, 3, 'CER-003', 5],
      [2, 4, 'CER-006', 5],
    ];
    for (const [b, s, sku, facings] of plan) {
      bays[b]!.shelves[s]!.positions.push({ id: randomUUID(), productId: bySku(sku).id, x: 0, facings, stack: 1 });
    }
    for (const bay of bays) for (const shelf of bay.shelves) shelf.positions = compactShelf(shelf.positions, lookup);

    const pog = await client.query(
      `INSERT INTO planograms (name, fixture_type, category_id, notes) VALUES ($1, 'SHELVING', $2, $3) RETURNING id`,
      ['Cereal - 3 bay standard', categoryIds['Breakfast Cereal'], 'Demo planogram from the sample data.'],
    );
    await replaceLayout(client, pog.rows[0].id, bays);
    for (const storeId of storeIds.slice(0, 2)) {
      await client.query('INSERT INTO store_planograms (store_id, planogram_id) VALUES ($1, $2)', [storeId, pog.rows[0].id]);
    }
  });
  return true;
}
