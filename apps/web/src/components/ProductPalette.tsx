import { useMemo, useState } from 'react';
import type { Product } from '@pvm/shared';
import type { Category } from '../api';
import { productColor } from '../format';

interface Props {
  products: Product[];
  categories: Category[];
  /** Product ids already on the planogram, shown with a tick. */
  placed: ReadonlySet<string>;
  disabled: boolean;
  defaultCategoryId: string | null;
  onDragStart: (productId: string) => void;
  onDragEnd: () => void;
}

export function ProductPalette({ products, categories, placed, disabled, defaultCategoryId, onDragStart, onDragEnd }: Props) {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? '');
  const [hidePlaced, setHidePlaced] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!categoryId || p.categoryId === categoryId) &&
        (!hidePlaced || !placed.has(p.id)) &&
        (!needle || [p.name, p.sku, p.brand ?? '', p.gtin ?? ''].some((v) => v.toLowerCase().includes(needle))),
    );
  }, [products, q, categoryId, hidePlaced, placed]);

  return (
    <aside className="palette no-print">
      <h3>Products</h3>
      <input type="search" placeholder="Search name, SKU, brand, GTIN" value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <label className="checkbox">
        <input type="checkbox" checked={hidePlaced} onChange={(e) => setHidePlaced(e.target.checked)} /> Hide placed
      </label>
      <p className="muted small">{disabled ? 'Read-only: duplicate this planogram to edit.' : 'Drag a product onto a shelf.'}</p>
      <ul>
        {filtered.map((p) => (
          <li
            key={p.id}
            draggable={!disabled}
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-pvm-product', p.id);
              e.dataTransfer.effectAllowed = 'copy';
              onDragStart(p.id);
            }}
            onDragEnd={onDragEnd}
            className={disabled ? 'disabled' : ''}
          >
            <span className="swatch" style={{ background: productColor(p) }} />
            <span className="grow">
              <strong>{p.name}</strong>
              <small>
                {p.sku} · {p.brand ?? '—'} · {p.width}×{p.height}×{p.depth}
              </small>
            </span>
            {placed.has(p.id) && <span title="On this planogram">✓</span>}
          </li>
        ))}
        {filtered.length === 0 && <li className="muted">No matching products</li>}
      </ul>
    </aside>
  );
}
