import { positionCapacity, type Planogram, type PlanogramSummary, type ProductLookup } from '@pvm/shared';
import { metres, pct, statusLabel } from '../format';

/**
 * Store execution sheet, only visible when printing. The canvas prints above
 * it; this lists every position shelf by shelf so staff can set the fixture.
 */
export function PrintSheet({ planogram, products, summary }: { planogram: Planogram; products: ProductLookup; summary: PlanogramSummary }) {
  return (
    <section className="print-only print-sheet">
      <header>
        <h1>{planogram.name}</h1>
        <p>
          {statusLabel[planogram.status]} · {summary.bayCount} bays · {metres(planogram.bays.reduce((w, b) => w + b.width, 0))} run ·{' '}
          {summary.skuCount} SKUs · fill {pct(summary.fill)} · printed {new Date().toLocaleDateString()}
        </p>
        {planogram.notes && <p>{planogram.notes}</p>}
      </header>
      {planogram.bays.map((bay, bi) => (
        <table key={bay.id} className="table compact">
          <caption>
            Bay {bi + 1} — {bay.width} × {bay.height} mm
          </caption>
          <thead>
            <tr>
              <th>Shelf</th>
              <th>#</th>
              <th>SKU</th>
              <th>Product</th>
              <th className="num">From left (mm)</th>
              <th className="num">Facings</th>
              <th className="num">Stack</th>
              <th className="num">Capacity</th>
            </tr>
          </thead>
          <tbody>
            {[...bay.shelves]
              .sort((a, b) => b.y - a.y)
              .flatMap((shelf) =>
                [...shelf.positions]
                  .sort((a, b) => a.x - b.x)
                  .map((pos, i) => {
                    const product = products.get(pos.productId);
                    return (
                      <tr key={pos.id}>
                        <td>{i === 0 ? `${shelf.index + 1} (${shelf.y} mm)` : ''}</td>
                        <td>{i + 1}</td>
                        <td>{product?.sku}</td>
                        <td>{product?.name}</td>
                        <td className="num">{pos.x}</td>
                        <td className="num">{pos.facings}</td>
                        <td className="num">{pos.stack}</td>
                        <td className="num">{product ? positionCapacity(product, pos, shelf) : ''}</td>
                      </tr>
                    );
                  }),
              )}
          </tbody>
        </table>
      ))}
    </section>
  );
}
