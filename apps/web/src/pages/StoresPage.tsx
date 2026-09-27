import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, type Store } from '../api';
import { useAsync } from '../hooks/useAsync';
import { statusLabel } from '../format';

type StoreInput = Omit<Store, 'id' | 'planogramCount'>;
const empty: StoreInput = { code: '', name: '', format: null, region: null, address: null };

export function StoresPage() {
  const stores = useAsync(() => api.stores());
  const [editing, setEditing] = useState<Store | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const remove = async (s: Store) => {
    if (!confirm(`Delete store ${s.code}?`)) return;
    try {
      await api.deleteStore(s.id);
      await stores.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Stores</h1>
        <button className="primary" onClick={() => setEditing('new')}>
          New store
        </button>
      </div>
      {editing && (
        <StoreForm
          store={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await stores.reload();
          }}
        />
      )}
      {(error || stores.error) && <p className="error">{error ?? stores.error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Format</th>
            <th>Region</th>
            <th className="num">Planograms</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(stores.data ?? []).map((s) => (
            <StoreRow
              key={s.id}
              store={s}
              open={openId === s.id}
              onToggle={() => setOpenId(openId === s.id ? null : s.id)}
              onEdit={() => setEditing(s)}
              onDelete={() => remove(s)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StoreRow({ store, open, onToggle, onEdit, onDelete }: { store: Store; open: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <tr>
        <td>{store.code}</td>
        <td>{store.name}</td>
        <td>{store.format ?? '—'}</td>
        <td>{store.region ?? '—'}</td>
        <td className="num">
          <button className="link" onClick={onToggle}>
            {store.planogramCount ?? 0} {open ? '▴' : '▾'}
          </button>
        </td>
        <td className="row-actions">
          <button className="link" onClick={onEdit}>
            Edit
          </button>
          <button className="link danger" onClick={onDelete}>
            Delete
          </button>
        </td>
      </tr>
      {open && (
        <tr className="subrow">
          <td colSpan={6}>
            <StorePlanograms storeId={store.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function StorePlanograms({ storeId }: { storeId: string }) {
  const list = useAsync(() => api.storePlanograms(storeId), [storeId]);
  if (list.loading) return <span className="muted">Loading…</span>;
  if (!list.data?.length) return <span className="muted">No planograms assigned. Assign them from the planogram editor’s Stores tab.</span>;
  return (
    <ul className="plain">
      {list.data.map((p) => (
        <li key={p.id}>
          <Link to={`/planograms/${p.id}`}>{p.name}</Link> <span className={`badge ${p.status.toLowerCase()}`}>{statusLabel[p.status]}</span>{' '}
          <span className="muted small">from {p.effectiveFrom}</span>
        </li>
      ))}
    </ul>
  );
}

function StoreForm({ store, onClose, onSaved }: { store: Store | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<StoreInput>(
    store ? { code: store.code, name: store.name, format: store.format, region: store.region, address: store.address } : empty,
  );
  const [error, setError] = useState<string>();
  const field = (key: keyof StoreInput, required = false) => ({
    required,
    value: form[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value || (required ? '' : null) }),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (store) await api.updateStore(store.id, form);
      else await api.createStore(form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="card form-grid" onSubmit={submit}>
      <h2 className="span-2">{store ? 'Edit store' : 'New store'}</h2>
      <label>
        Code
        <input {...field('code', true)} autoFocus />
      </label>
      <label>
        Name
        <input {...field('name', true)} />
      </label>
      <label>
        Format
        <input {...field('format')} placeholder="Supermarket, Convenience…" />
      </label>
      <label>
        Region
        <input {...field('region')} />
      </label>
      <label className="span-2">
        Address
        <input {...field('address')} />
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
