import { useEffect, useState } from 'react';
import {
  positionCapacity,
  positionWidth,
  shelfFill,
  unitsDeep,
  type Bay,
  type FixtureType,
  type Issue,
  type Planogram,
  type ProductLookup,
} from '@pvm/shared';
import type { Category } from '../api';
import { pct, productColor } from '../format';
import type { Selection } from './PlanogramCanvas';
import * as L from '../layout';

interface Props {
  planogram: Planogram;
  bays: Bay[];
  products: ProductLookup;
  categories: Category[];
  selection: Selection;
  issues: Issue[];
  readOnly: boolean;
  onBaysChange: (bays: Bay[]) => void;
  onMetaChange: (patch: Partial<Pick<Planogram, 'name' | 'fixtureType' | 'categoryId' | 'notes'>>) => void;
  onSelect: (s: Selection) => void;
}

export function Inspector(props: Props) {
  const { bays, selection } = props;
  if (selection?.kind === 'position') {
    const found = L.findPosition(bays, selection.id);
    if (found) return <PositionInspector {...props} found={found} />;
  }
  if (selection?.kind === 'shelf') {
    const found = L.findShelf(bays, selection.id);
    if (found) return <ShelfInspector {...props} found={found} />;
  }
  if (selection?.kind === 'bay') {
    const bay = bays.find((b) => b.id === selection.id);
    if (bay) return <BayInspector {...props} bay={bay} />;
  }
  return <PlanogramInspector {...props} />;
}

/** Number input that commits on blur/Enter so typing doesn't create an undo step per keystroke. */
function NumberField({ label, value, min = 1, disabled, onCommit }: { label: string; value: number; min?: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Math.round(Number(text));
    if (Number.isFinite(v) && v >= min && v !== value) onCommit(v);
    else setText(String(value));
  };
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}

function Stepper({ label, value, min = 1, disabled, onChange }: { label: string; value: number; min?: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <button disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`Decrease ${label}`}>
        −
      </button>
      <strong>{value}</strong>
      <button disabled={disabled} onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
}

function PositionInspector({ bays, products, issues, readOnly, onBaysChange, onSelect, found }: Props & { found: NonNullable<ReturnType<typeof L.findPosition>> }) {
  const { bay, shelf, position } = found;
  const product = products.get(position.productId);
  if (!product) return <div className="inspector">Unknown product</div>;
  const own = issues.filter((i) => i.positionId === position.id);
  const update = (patch: Parameters<typeof L.updatePosition>[2]) => onBaysChange(L.updatePosition(bays, position.id, patch));
  return (
    <div className="inspector">
      <h3>
        <span className="swatch" style={{ background: productColor(product) }} /> {product.name}
      </h3>
      <dl>
        <dt>SKU</dt>
        <dd>{product.sku}</dd>
        {product.gtin && (
          <>
            <dt>GTIN</dt>
            <dd>{product.gtin}</dd>
          </>
        )}
        <dt>Brand</dt>
        <dd>{product.brand ?? '—'}</dd>
        <dt>Size (W×H×D)</dt>
        <dd>
          {product.width}×{product.height}×{product.depth} mm
        </dd>
        {product.price != null && (
          <>
            <dt>Price</dt>
            <dd>{product.price.toFixed(2)}</dd>
          </>
        )}
        <dt>Bay / shelf</dt>
        <dd>
          {bay.index + 1} / {shelf.index + 1} (from bottom)
        </dd>
      </dl>
      <Stepper label="Facings" value={position.facings} disabled={readOnly} onChange={(facings) => update({ facings })} />
      <Stepper label="Stack" value={position.stack} disabled={readOnly} onChange={(stack) => update({ stack })} />
      <NumberField label="X offset (mm)" value={position.x} min={0} disabled={readOnly} onCommit={(x) => update({ x })} />
      <dl>
        <dt>Linear</dt>
        <dd>{positionWidth(product, position)} mm</dd>
        <dt>Units deep</dt>
        <dd>{unitsDeep(product, shelf.depth)}</dd>
        <dt>Capacity</dt>
        <dd>{positionCapacity(product, position, shelf)} units</dd>
      </dl>
      {own.length > 0 && (
        <ul className="issues">
          {own.map((i) => (
            <li key={i.code}>
              <span className="badge bad">{i.code.replace('_', ' ')}</span> {i.message}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="actions">
          <button
            onClick={() => {
              onBaysChange(L.removePosition(bays, position.id));
              onSelect(null);
            }}
            className="danger"
          >
            Remove
          </button>
          <button onClick={() => onSelect({ kind: 'shelf', id: shelf.id })}>Select shelf</button>
        </div>
      )}
      <p className="muted small">Tip: ← → nudge 10 mm, Delete removes, drag to move.</p>
    </div>
  );
}

function ShelfInspector({ bays, products, readOnly, onBaysChange, onSelect, found }: Props & { found: NonNullable<ReturnType<typeof L.findShelf>> }) {
  const { bay, shelf } = found;
  return (
    <div className="inspector">
      <h3>
        Bay {bay.index + 1} · Shelf {shelf.index + 1}
      </h3>
      <NumberField label="Height from floor (mm)" value={shelf.y} min={0} disabled={readOnly} onCommit={(y) => onBaysChange(L.updateShelf(bays, shelf.id, { y }))} />
      <NumberField label="Depth (mm)" value={shelf.depth} disabled={readOnly} onCommit={(depth) => onBaysChange(L.updateShelf(bays, shelf.id, { depth }))} />
      <dl>
        <dt>Clearance</dt>
        <dd>{shelf.clearance} mm</dd>
        <dt>Fill</dt>
        <dd>{pct(shelfFill(shelf, bay.width, products))}</dd>
        <dt>Positions</dt>
        <dd>{shelf.positions.length}</dd>
      </dl>
      {!readOnly && (
        <div className="actions">
          <button onClick={() => onBaysChange(L.compactShelfIn(bays, shelf.id, products))}>Close gaps</button>
          <button
            className="danger"
            onClick={() => {
              if (shelf.positions.length && !confirm(`Remove this shelf and its ${shelf.positions.length} product(s)?`)) return;
              onBaysChange(L.removeShelf(bays, shelf.id));
              onSelect(null);
            }}
          >
            Remove shelf
          </button>
        </div>
      )}
      <button className="link" onClick={() => onSelect({ kind: 'bay', id: bay.id })}>
        Select bay
      </button>
    </div>
  );
}

function BayInspector({ bays, readOnly, onBaysChange, onSelect, bay }: Props & { bay: Bay }) {
  return (
    <div className="inspector">
      <h3>Bay {bay.index + 1}</h3>
      <NumberField label="Width (mm)" value={bay.width} disabled={readOnly} onCommit={(width) => onBaysChange(L.updateBay(bays, bay.id, { width }))} />
      <NumberField label="Height (mm)" value={bay.height} disabled={readOnly} onCommit={(height) => onBaysChange(L.updateBay(bays, bay.id, { height }))} />
      <NumberField label="Depth (mm)" value={bay.depth} disabled={readOnly} onCommit={(depth) => onBaysChange(L.updateBay(bays, bay.id, { depth }))} />
      {!readOnly && (
        <div className="actions wrap">
          <button onClick={() => onBaysChange(L.addShelf(bays, bay.id))}>Add shelf</button>
          <button onClick={() => onBaysChange(L.duplicateBay(bays, bay.id))}>Duplicate bay</button>
          <button onClick={() => onBaysChange(L.moveBay(bays, bay.id, -1))} disabled={bay.index === 0}>
            ← Move
          </button>
          <button onClick={() => onBaysChange(L.moveBay(bays, bay.id, 1))} disabled={bay.index === bays.length - 1}>
            Move →
          </button>
          <button
            className="danger"
            disabled={bays.length === 1}
            onClick={() => {
              if (!confirm('Remove this bay and everything on it?')) return;
              onBaysChange(L.removeBay(bays, bay.id));
              onSelect(null);
            }}
          >
            Remove bay
          </button>
        </div>
      )}
    </div>
  );
}

const fixtureOptions: FixtureType[] = ['SHELVING', 'CHILLER', 'FREEZER', 'END_CAP', 'PEGBOARD'];

function PlanogramInspector({ planogram, bays, categories, readOnly, onBaysChange, onMetaChange }: Props) {
  return (
    <div className="inspector">
      <h3>Planogram</h3>
      <label>
        Name
        <input value={planogram.name} disabled={readOnly} onChange={(e) => onMetaChange({ name: e.target.value })} />
      </label>
      <label>
        Fixture
        <select value={planogram.fixtureType} disabled={readOnly} onChange={(e) => onMetaChange({ fixtureType: e.target.value as FixtureType })}>
          {fixtureOptions.map((f) => (
            <option key={f} value={f}>
              {f.replace('_', ' ').toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select value={planogram.categoryId ?? ''} disabled={readOnly} onChange={(e) => onMetaChange({ categoryId: e.target.value || null })}>
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <textarea rows={4} value={planogram.notes ?? ''} disabled={readOnly} onChange={(e) => onMetaChange({ notes: e.target.value || null })} />
      </label>
      {!readOnly && (
        <div className="actions">
          <button onClick={() => onBaysChange(L.addBay(bays))}>Add bay</button>
        </div>
      )}
      <p className="muted small">Select a bay, shelf or product on the canvas to edit it.</p>
    </div>
  );
}
