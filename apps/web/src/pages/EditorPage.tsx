import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  positionWidth,
  spaceShare,
  summarize,
  toLookup,
  validatePlanogram,
  type Bay,
  type Planogram,
  type PlanogramStatus,
  type Product,
} from '@pvm/shared';
import { api, type Category, type Store } from '../api';
import { PlanogramCanvas, type DropTarget, type Selection } from '../components/PlanogramCanvas';
import { ProductPalette } from '../components/ProductPalette';
import { Inspector } from '../components/Inspector';
import { AnalyticsPanel } from '../components/AnalyticsPanel';
import { PrintSheet } from '../components/PrintSheet';
import { useHistory } from '../hooks/useHistory';
import { statusLabel } from '../format';
import * as L from '../layout';

type Meta = Pick<Planogram, 'name' | 'fixtureType' | 'categoryId' | 'notes'>;

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [planogram, setPlanogram] = useState<Planogram | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [savedMeta, setSavedMeta] = useState<Meta | null>(null);
  const [savedBays, setSavedBays] = useState<Bay[] | null>(null);
  const history = useHistory<Bay[]>([]);
  const bays = history.value;

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [paletteDrag, setPaletteDrag] = useState<string | null>(null);
  const [scale, setScale] = useState(0.3);
  const [panel, setPanel] = useState<'inspector' | 'analytics' | 'stores'>('inspector');
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);

  const applyLoaded = useCallback(
    (p: Planogram) => {
      const m: Meta = { name: p.name, fixtureType: p.fixtureType, categoryId: p.categoryId, notes: p.notes };
      setPlanogram(p);
      setMeta(m);
      setSavedMeta(m);
      setSavedBays(p.bays);
      history.reset(p.bays);
    },
    [history.reset],
  );

  useEffect(() => {
    if (!id) return;
    Promise.all([api.planogram(id), api.products(), api.categories()])
      .then(([{ planogram: p, products }, all, cats]) => {
        // Include products on the planogram even if they fall outside the catalogue query.
        const byId = new Map(all.map((x) => [x.id, x]));
        for (const x of products) byId.set(x.id, x);
        setCatalog([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
        setCategories(cats);
        applyLoaded(p);
      })
      .catch((e) => setError(e.message));
  }, [id, applyLoaded]);

  const products = useMemo(() => toLookup(catalog), [catalog]);
  const readOnly = planogram?.status === 'PUBLISHED' || planogram?.status === 'ARCHIVED';
  const dirty = !!savedBays && (bays !== savedBays || JSON.stringify(meta) !== JSON.stringify(savedMeta));

  const issues = useMemo(() => validatePlanogram({ bays }, products), [bays, products]);
  const issueIds = useMemo(() => new Set(issues.map((i) => i.positionId)), [issues]);
  const placed = useMemo(() => new Set(bays.flatMap((b) => b.shelves.flatMap((s) => s.positions.map((p) => p.productId)))), [bays]);
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const analytics = useMemo(
    () => ({
      summary: summarize(bays, products),
      byBrand: spaceShare(bays, products, (p) => p.brand ?? 'Unbranded'),
      byCategory: spaceShare(bays, products, (p) => (p.categoryId && categoryName.get(p.categoryId)) || 'Uncategorised'),
    }),
    [bays, products, categoryName],
  );

  const save = useCallback(async () => {
    if (!planogram || !meta || readOnly) return;
    setSaving(true);
    setError(undefined);
    try {
      const res = await api.savePlanogram({ ...planogram, ...meta, bays });
      applyLoaded(res.planogram);
      setMessage('Saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [planogram, meta, bays, readOnly, applyLoaded]);

  const changeStatus = async (status: PlanogramStatus) => {
    if (!planogram) return;
    if (dirty) {
      setError('Save your changes first.');
      return;
    }
    try {
      const res = await api.setStatus(planogram.id, status);
      setPlanogram({ ...planogram, status: res.status, updatedAt: res.updatedAt });
      setMessage(`Status changed to ${statusLabel[res.status]}`);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const duplicate = async () => {
    if (!planogram) return;
    const copy = await api.duplicatePlanogram(planogram.id);
    navigate(`/planograms/${copy.id}`);
  };

  const remove = async () => {
    if (!planogram || !confirm(`Delete "${planogram.name}"? This cannot be undone.`)) return;
    await api.deletePlanogram(planogram.id);
    navigate('/planograms');
  };

  const onDropProduct = (productId: string, target: DropTarget) => {
    setPaletteDrag(null);
    if (readOnly) return;
    if (target.x === null) {
      setError('No room on that shelf for this product.');
      return;
    }
    const position = { id: L.newId(), productId, x: target.x, facings: 1, stack: 1 };
    history.set((b) => L.addPosition(b, target.shelfId, position));
    setSelection({ kind: 'position', id: position.id });
    setError(undefined);
  };

  const onMovePosition = (positionId: string, target: DropTarget) => {
    if (target.x === null) {
      setError('No room there.');
      return;
    }
    history.set((b) => L.movePosition(b, positionId, target.shelfId, target.x!));
    setError(undefined);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
        return;
      }
      if (typing || readOnly) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
      } else if (selection?.kind === 'position') {
        const found = L.findPosition(bays, selection.id);
        if (!found) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          history.set(L.removePosition(bays, selection.id));
          setSelection(null);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const step = e.shiftKey ? 1 : 10;
          const product = products.get(found.position.productId);
          const max = found.bay.width - (product ? positionWidth(product, found.position) : 0);
          const x = Math.min(max, Math.max(0, found.position.x + (e.key === 'ArrowLeft' ? -step : step)));
          history.set(L.updatePosition(bays, selection.id, { x }));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, readOnly, history, selection, bays, products]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(undefined), 2500);
    return () => clearTimeout(t);
  }, [message]);

  if (error && !planogram) return <p className="page error">{error}</p>;
  if (!planogram || !meta) return <p className="page muted">Loading…</p>;

  return (
    <div className="editor">
      <div className="toolbar no-print">
        <Link to="/planograms" className="back">
          ← Planograms
        </Link>
        <h2>{meta.name || 'Untitled'}</h2>
        <span className={`badge ${planogram.status.toLowerCase()}`}>{statusLabel[planogram.status]}</span>
        {dirty && <span className="muted small">Unsaved changes</span>}
        <div className="spacer" />
        <div className="group">
          <button onClick={history.undo} disabled={!history.canUndo || readOnly} title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button onClick={history.redo} disabled={!history.canRedo || readOnly} title="Redo (Ctrl+Shift+Z)">
            ↷
          </button>
        </div>
        <div className="group">
          <button onClick={() => setScale((s) => Math.max(0.05, s / 1.25))} title="Zoom out">
            −
          </button>
          <span className="small">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(2, s * 1.25))} title="Zoom in">
            +
          </button>
        </div>
        <StatusActions status={planogram.status} issueCount={issues.length} onChange={changeStatus} />
        <button onClick={() => window.print()}>Print</button>
        <button onClick={duplicate}>Duplicate</button>
        <button onClick={remove} className="danger">
          Delete
        </button>
        {!readOnly && (
          <button className="primary" onClick={save} disabled={!dirty || saving} title="Save (Ctrl+S)">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      {(error || message) && <div className={`banner no-print ${error ? 'error' : 'ok'}`}>{error ?? message}</div>}

      <div className="editor-body">
        <ProductPalette
          products={catalog}
          categories={categories}
          placed={placed}
          disabled={readOnly}
          defaultCategoryId={planogram.categoryId}
          onDragStart={setPaletteDrag}
          onDragEnd={() => setPaletteDrag(null)}
        />
        <PlanogramCanvas
          bays={bays}
          products={products}
          scale={scale}
          selection={selection}
          issuePositionIds={issueIds}
          readOnly={readOnly}
          paletteProductId={paletteDrag}
          onSelect={(s) => {
            setSelection(s);
            if (s) setPanel('inspector');
          }}
          onDropProduct={onDropProduct}
          onMovePosition={onMovePosition}
        />
        <aside className="side no-print">
          <div className="tabs">
            <button className={panel === 'inspector' ? 'active' : ''} onClick={() => setPanel('inspector')}>
              Properties
            </button>
            <button className={panel === 'analytics' ? 'active' : ''} onClick={() => setPanel('analytics')}>
              Analytics {issues.length > 0 && <span className="count">{issues.length}</span>}
            </button>
            <button className={panel === 'stores' ? 'active' : ''} onClick={() => setPanel('stores')}>
              Stores
            </button>
          </div>
          {panel === 'inspector' && (
            <Inspector
              planogram={{ ...planogram, ...meta }}
              bays={bays}
              products={products}
              categories={categories}
              selection={selection}
              issues={issues}
              readOnly={readOnly}
              onBaysChange={history.set}
              onMetaChange={(patch) => setMeta((m) => ({ ...m!, ...patch }))}
              onSelect={setSelection}
            />
          )}
          {panel === 'analytics' && (
            <AnalyticsPanel
              {...analytics}
              issues={issues}
              onSelectPosition={(pid) => {
                setSelection({ kind: 'position', id: pid });
                setPanel('inspector');
              }}
            />
          )}
          {panel === 'stores' && <StoreAssignment planogramId={planogram.id} />}
        </aside>
      </div>

      <PrintSheet planogram={{ ...planogram, ...meta, bays }} products={products} summary={analytics.summary} />
    </div>
  );
}

function StatusActions({ status, issueCount, onChange }: { status: PlanogramStatus; issueCount: number; onChange: (s: PlanogramStatus) => void }) {
  const blocked = issueCount > 0 ? `Fix ${issueCount} issue(s) first` : undefined;
  switch (status) {
    case 'DRAFT':
      return (
        <button onClick={() => onChange('APPROVED')} disabled={!!blocked} title={blocked}>
          Approve
        </button>
      );
    case 'APPROVED':
      return (
        <div className="group">
          <button onClick={() => onChange('DRAFT')}>Back to draft</button>
          <button onClick={() => onChange('PUBLISHED')} disabled={!!blocked} title={blocked}>
            Publish
          </button>
        </div>
      );
    case 'PUBLISHED':
      return <button onClick={() => onChange('ARCHIVED')}>Archive</button>;
    case 'ARCHIVED':
      return null;
  }
}

function StoreAssignment({ planogramId }: { planogramId: string }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<'loading' | 'idle' | 'saving' | 'saved'>('loading');
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([api.stores(), api.planogramStores(planogramId)])
      .then(([all, assigned]) => {
        setStores(all);
        setSelected(new Set(assigned.map((s) => s.id)));
        setState('idle');
      })
      .catch((e) => setError(e.message));
  }, [planogramId]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setState('idle');
  };

  const save = async () => {
    setState('saving');
    try {
      await api.assignStores(planogramId, [...selected]);
      setState('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('idle');
    }
  };

  return (
    <div className="inspector">
      <h3>Assigned stores</h3>
      {error && <p className="error">{error}</p>}
      {state === 'loading' ? (
        <p className="muted">Loading…</p>
      ) : stores.length === 0 ? (
        <p className="muted small">
          No stores yet. <Link to="/stores">Add stores</Link> first.
        </p>
      ) : (
        <>
          <div className="actions">
            <button className="link" onClick={() => setSelected(new Set(stores.map((s) => s.id)))}>
              All
            </button>
            <button className="link" onClick={() => setSelected(new Set())}>
              None
            </button>
          </div>
          <ul className="checklist">
            {stores.map((s) => (
              <li key={s.id}>
                <label className="checkbox">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <span>
                    <strong>{s.code}</strong> {s.name}
                    <small className="muted"> {[s.format, s.region].filter(Boolean).join(' · ')}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button className="primary" onClick={save} disabled={state === 'saving'}>
            {state === 'saved' ? 'Saved ✓' : 'Save assignment'}
          </button>
        </>
      )}
    </div>
  );
}
