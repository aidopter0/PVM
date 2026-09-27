import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { FixtureType } from '@pvm/shared';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { date, metres, statusLabel } from '../format';

const fixtureTypes: { value: FixtureType; label: string; defaults: { height: number; depth: number; shelves: number } }[] = [
  { value: 'SHELVING', label: 'Gondola shelving', defaults: { height: 1950, depth: 450, shelves: 5 } },
  { value: 'CHILLER', label: 'Multideck chiller', defaults: { height: 2000, depth: 600, shelves: 5 } },
  { value: 'FREEZER', label: 'Upright freezer', defaults: { height: 2000, depth: 650, shelves: 5 } },
  { value: 'END_CAP', label: 'End cap', defaults: { height: 1800, depth: 500, shelves: 4 } },
  { value: 'PEGBOARD', label: 'Pegboard', defaults: { height: 1800, depth: 300, shelves: 6 } },
];

export function PlanogramsPage() {
  const list = useAsync(() => Promise.all([api.planograms(), api.categories()]));
  const [creating, setCreating] = useState(false);
  const [planograms, categories] = list.data ?? [[], []];
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="page">
      <div className="page-header">
        <h1>Planograms</h1>
        <button className="primary" onClick={() => setCreating(true)}>
          New planogram
        </button>
      </div>
      {creating && <CreatePlanogramForm categories={categories} onCancel={() => setCreating(false)} />}
      {list.error && <p className="error">{list.error}</p>}
      {list.loading && !list.data ? (
        <p className="muted">Loading…</p>
      ) : planograms.length === 0 ? (
        <p className="empty">No planograms yet. Create one to start merchandising.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Status</th>
              <th className="num">Bays</th>
              <th className="num">Length</th>
              <th className="num">SKUs</th>
              <th className="num">Stores</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {planograms.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/planograms/${p.id}`}>{p.name}</Link>
                </td>
                <td>{(p.categoryId && categoryName.get(p.categoryId)) || '—'}</td>
                <td>
                  <span className={`badge ${p.status.toLowerCase()}`}>{statusLabel[p.status]}</span>
                </td>
                <td className="num">{p.bayCount}</td>
                <td className="num">{metres(p.totalWidth)}</td>
                <td className="num">{p.skuCount}</td>
                <td className="num">{p.storeCount}</td>
                <td className="muted">{date(p.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreatePlanogramForm({ categories, onCancel }: { categories: { id: string; name: string }[]; onCancel: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    fixtureType: 'SHELVING' as FixtureType,
    categoryId: '',
    bays: 3,
    bayWidth: 1000,
    bayHeight: 1950,
    bayDepth: 450,
    shelvesPerBay: 5,
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const setFixture = (value: FixtureType) => {
    const d = fixtureTypes.find((f) => f.value === value)!.defaults;
    setForm((f) => ({ ...f, fixtureType: value, bayHeight: d.height, bayDepth: d.depth, shelvesPerBay: d.shelves }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api.createPlanogram({
        name: form.name,
        fixtureType: form.fixtureType,
        categoryId: form.categoryId || null,
        template: { bays: form.bays, bayWidth: form.bayWidth, bayHeight: form.bayHeight, bayDepth: form.bayDepth, shelvesPerBay: form.shelvesPerBay },
      });
      navigate(`/planograms/${p.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const num = (key: keyof typeof form) => ({
    type: 'number',
    min: 1,
    required: true,
    value: form[key] as number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: Number(e.target.value) })),
  });

  return (
    <form className="card form-grid" onSubmit={submit}>
      <h2>New planogram</h2>
      <label className="span-2">
        Name
        <input autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cereal – 4 bay" />
      </label>
      <label>
        Fixture
        <select value={form.fixtureType} onChange={(e) => setFixture(e.target.value as FixtureType)}>
          {fixtureTypes.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Bays
        <input {...num('bays')} max={40} />
      </label>
      <label>
        Shelves per bay
        <input {...num('shelvesPerBay')} max={20} />
      </label>
      <label>
        Bay width (mm)
        <input {...num('bayWidth')} />
      </label>
      <label>
        Bay height (mm)
        <input {...num('bayHeight')} />
      </label>
      <label>
        Shelf depth (mm)
        <input {...num('bayDepth')} />
      </label>
      {error && <p className="error span-2">{error}</p>}
      <div className="actions span-2">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" disabled={busy}>
          Create
        </button>
      </div>
    </form>
  );
}
