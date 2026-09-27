import type { Issue, PlanogramSummary, SpaceShareRow } from '@pvm/shared';
import { metres, pct } from '../format';

interface Props {
  summary: PlanogramSummary;
  issues: Issue[];
  byBrand: SpaceShareRow[];
  byCategory: SpaceShareRow[];
  onSelectPosition: (id: string) => void;
}

export function AnalyticsPanel({ summary, issues, byBrand, byCategory, onSelectPosition }: Props) {
  return (
    <div className="analytics">
      <div className="kpis">
        <Kpi label="Shelf fill" value={pct(summary.fill)} />
        <Kpi label="Linear used" value={`${metres(summary.linearUsedMm)} / ${metres(summary.linearAvailableMm)}`} />
        <Kpi label="SKUs" value={summary.skuCount} />
        <Kpi label="Facings" value={summary.totalFacings} />
        <Kpi label="Capacity (units)" value={summary.totalCapacity} />
        <Kpi label="Issues" value={issues.length} tone={issues.length ? 'bad' : 'good'} />
      </div>

      <section>
        <h4>Placement issues</h4>
        {issues.length === 0 ? (
          <p className="muted small">No issues: every product fits its shelf.</p>
        ) : (
          <ul className="issues">
            {issues.map((i, n) => (
              <li key={`${i.positionId}-${i.code}-${n}`}>
                <button className="link" onClick={() => onSelectPosition(i.positionId)}>
                  <span className="badge bad">{i.code.replace('_', ' ')}</span> {i.message}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ShareTable title="Space share by brand" rows={byBrand} />
      <ShareTable title="Space share by category" rows={byCategory} />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: 'good' | 'bad' }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ShareTable({ title, rows }: { title: string; rows: SpaceShareRow[] }) {
  return (
    <section>
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="muted small">Nothing placed yet.</p>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th />
              <th className="num">Linear</th>
              <th className="num">Facings</th>
              <th className="num">SKUs</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.key}</td>
                <td className="num">{metres(r.linearMm)}</td>
                <td className="num">{r.facings}</td>
                <td className="num">{r.skuCount}</td>
                <td className="share">
                  <span className="bar" style={{ width: `${r.share * 100}%` }} />
                  <span>{pct(r.share)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
