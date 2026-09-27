import { useMemo, useState, type FormEvent } from 'react';
import type { Product } from '@pvm/shared';
import { api, type Category, type ProductInput } from '../api';
import { useAsync } from '../hooks/useAsync';
import { productColor } from '../format';

const emptyProduct: ProductInput = {
  sku: '',
  gtin: null,
  name: '',
  brand: null,
  categoryId: null,
  width: 100,
  height: 200,
  depth: 80,
  price: null,
  color: null,
  imageUrl: null,
};

export function ProductsPage() {
  const data = useAsync(() => Promise.all([api.products(), api.categories()]));
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string>();

  const [products, categories] = data.data ?? [[], []];
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? products.filter((p) => [p.name, p.sku, p.brand ?? '', p.gtin ?? ''].some((v) => v.toLowerCase().includes(n))) : products;
  }, [products, q]);

  const remove = async (p: Product) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    try {
      await api.deleteProduct(p.id);
      await data.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Products</h1>
        <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => setImporting((v) => !v)}>Import CSV</button>
        <button className="primary" onClick={() => setEditing('new')}>
          New product
        </button>
      </div>
      {importing && <ImportPanel onDone={() => data.reload()} />}
      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          categories={categories}
          onCategoriesChange={() => data.reload()}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await data.reload();
          }}
        />
      )}
      {(error || data.error) && <p className="error">{error ?? data.error}</p>}
      <p className="muted small">{filtered.length} products · dimensions in mm (W×H×D)</p>
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>SKU</th>
            <th>Name</th>
            <th>Brand</th>
            <th>Category</th>
            <th className="num">W×H×D</th>
            <th className="num">Price</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="swatch" style={{ background: productColor(p) }} />
              </td>
              <td>{p.sku}</td>
              <td>{p.name}</td>
              <td>{p.brand ?? '—'}</td>
              <td>{(p.categoryId && categoryName.get(p.categoryId)) || '—'}</td>
              <td className="num">
                {p.width}×{p.height}×{p.depth}
              </td>
              <td className="num">{p.price?.toFixed(2) ?? '—'}</td>
              <td className="row-actions">
                <button className="link" onClick={() => setEditing(p)}>
                  Edit
                </button>
                <button className="link danger" onClick={() => remove(p)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductForm({
  product,
  categories,
  onCategoriesChange,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  onCategoriesChange: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ProductInput>(product ? { ...product } : emptyProduct);
  const [error, setError] = useState<string>();

  const text = (key: 'sku' | 'gtin' | 'name' | 'brand' | 'imageUrl', required = false) => ({
    required,
    value: form[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value || (required ? '' : null) }),
  });
  const num = (key: 'width' | 'height' | 'depth') => ({
    type: 'number',
    min: 1,
    required: true,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: Number(e.target.value) }),
  });

  const addCategory = async () => {
    const name = prompt('New category name');
    if (!name) return;
    const c = await api.createCategory(name);
    setForm((f) => ({ ...f, categoryId: c.id }));
    onCategoriesChange();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (product) await api.updateProduct(product.id, form);
      else await api.createProduct(form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="card form-grid" onSubmit={submit}>
      <h2 className="span-2">{product ? 'Edit product' : 'New product'}</h2>
      <label>
        SKU
        <input {...text('sku', true)} autoFocus />
      </label>
      <label>
        GTIN / barcode
        <input {...text('gtin')} />
      </label>
      <label className="span-2">
        Name
        <input {...text('name', true)} />
      </label>
      <label>
        Brand
        <input {...text('brand')} />
      </label>
      <label>
        Category
        <span className="inline">
          <select value={form.categoryId ?? ''} onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={addCategory} title="Add category">
            +
          </button>
        </span>
      </label>
      <label>
        Width (mm)
        <input {...num('width')} />
      </label>
      <label>
        Height (mm)
        <input {...num('height')} />
      </label>
      <label>
        Depth (mm)
        <input {...num('depth')} />
      </label>
      <label>
        Price
        <input
          type="number"
          min={0}
          step="0.01"
          value={form.price ?? ''}
          onChange={(e) => setForm({ ...form, price: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </label>
      <label>
        Colour on planogram
        <span className="inline">
          <input type="color" value={form.color ?? '#cccccc'} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          {form.color && (
            <button type="button" className="link" onClick={() => setForm({ ...form, color: null })}>
              auto
            </button>
          )}
        </span>
      </label>
      <label>
        Image URL
        <input {...text('imageUrl')} type="url" />
      </label>
      {error && <p className="error span-2">{error}</p>}
      <div className="actions span-2">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="primary">Save</button>
      </div>
    </form>
  );
}

function ImportPanel({ onDone }: { onDone: () => void }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.importProducts>>>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      setResult(await api.importProducts(await file.text()));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Import products from CSV</h2>
      <p className="small">
        Columns: <code>sku, name, width, height, depth</code> (required, mm) and optionally <code>gtin, brand, category, price, color, image_url</code>.
        Existing SKUs are updated; unknown categories are created. <a href="/sample-products.csv">Download a sample</a>.
      </p>
      <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
      {error && <p className="error">{error}</p>}
      {result && (
        <div>
          <p>
            Created {result.created}, updated {result.updated}
            {result.errors.length > 0 && `, ${result.errors.length} row(s) skipped`}.
          </p>
          {result.errors.length > 0 && (
            <ul className="issues">
              {result.errors.map((e) => (
                <li key={e.row}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
