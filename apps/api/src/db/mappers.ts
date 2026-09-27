import type { Product } from '@pvm/shared';

export interface ProductRow {
  id: string;
  sku: string;
  gtin: string | null;
  name: string;
  brand: string | null;
  category_id: string | null;
  width: number;
  height: number;
  depth: number;
  price: number | null;
  color: string | null;
  image_url: string | null;
}

export const PRODUCT_COLUMNS =
  'id, sku, gtin, name, brand, category_id, width, height, depth, price, color, image_url';

export function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    sku: r.sku,
    gtin: r.gtin,
    name: r.name,
    brand: r.brand,
    categoryId: r.category_id,
    width: r.width,
    height: r.height,
    depth: r.depth,
    price: r.price,
    color: r.color,
    imageUrl: r.image_url,
  };
}
