import type { PlanogramStatus } from '@pvm/shared';

export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
export const metres = (mm: number) => `${(mm / 1000).toFixed(2)} m`;
export const date = (iso: string) => new Date(iso).toLocaleString();

export const statusLabel: Record<PlanogramStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

/** Deterministic fallback colour for products without one. */
export function productColor(p: { color: string | null; brand: string | null; sku: string }): string {
  if (p.color) return p.color;
  const s = p.brand ?? p.sku;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 62%)`;
}

/** Black or white text depending on the background brightness. */
export function textOn(color: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return '#111';
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x!, 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 150 ? '#111' : '#fff';
}
