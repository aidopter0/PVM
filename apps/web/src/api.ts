import type { FixtureType, Planogram, PlanogramStatus, Product } from '@pvm/shared';

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Store {
  id: string;
  code: string;
  name: string;
  format: string | null;
  region: string | null;
  address: string | null;
  planogramCount?: number;
}

export interface PlanogramListItem {
  id: string;
  name: string;
  status: PlanogramStatus;
  fixtureType: FixtureType;
  categoryId: string | null;
  updatedAt: string;
  bayCount: number;
  totalWidth: number;
  skuCount: number;
  storeCount: number;
}

export interface PlanogramWithProducts {
  planogram: Planogram;
  products: Product[];
}

export type ProductInput = Omit<Product, 'id'>;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, contentType = 'application/json'): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': contentType },
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : (body as string),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(data.details)
      ? `: ${data.details.map((d: { path: string[]; message: string }) => `${d.path.join('.')} ${d.message}`).join('; ')}`
      : '';
    throw new ApiError(res.status, `${data.error ?? res.statusText}${details}`);
  }
  return data as T;
}

export const api = {
  categories: () => request<Category[]>('GET', '/categories'),
  createCategory: (name: string) => request<Category>('POST', '/categories', { name }),

  products: (q?: string) => request<Product[]>('GET', `/products?limit=5000${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  createProduct: (p: ProductInput) => request<Product>('POST', '/products', p),
  updateProduct: (id: string, p: ProductInput) => request<Product>('PUT', `/products/${id}`, p),
  deleteProduct: (id: string) => request<void>('DELETE', `/products/${id}`),
  importProducts: (csv: string) =>
    request<{ created: number; updated: number; errors: { row: number; message: string }[] }>('POST', '/products/import', csv, 'text/csv'),

  stores: () => request<Store[]>('GET', '/stores'),
  createStore: (s: Omit<Store, 'id'>) => request<Store>('POST', '/stores', s),
  updateStore: (id: string, s: Omit<Store, 'id'>) => request<Store>('PUT', `/stores/${id}`, s),
  deleteStore: (id: string) => request<void>('DELETE', `/stores/${id}`),
  storePlanograms: (id: string) =>
    request<{ id: string; name: string; status: PlanogramStatus; fixtureType: FixtureType; effectiveFrom: string }[]>('GET', `/stores/${id}/planograms`),

  planograms: () => request<PlanogramListItem[]>('GET', '/planograms'),
  planogram: (id: string) => request<PlanogramWithProducts>('GET', `/planograms/${id}`),
  createPlanogram: (body: {
    name: string;
    fixtureType: FixtureType;
    categoryId: string | null;
    template: { bays: number; bayWidth: number; bayHeight: number; bayDepth: number; shelvesPerBay: number };
  }) => request<Planogram>('POST', '/planograms', body),
  savePlanogram: (p: Planogram) => request<PlanogramWithProducts>('PUT', `/planograms/${p.id}`, p),
  setStatus: (id: string, status: PlanogramStatus) => request<{ status: PlanogramStatus; updatedAt: string }>('PATCH', `/planograms/${id}/status`, { status }),
  duplicatePlanogram: (id: string) => request<Planogram>('POST', `/planograms/${id}/duplicate`),
  deletePlanogram: (id: string) => request<void>('DELETE', `/planograms/${id}`),
  planogramStores: (id: string) => request<{ id: string; code: string; name: string; effectiveFrom: string }[]>('GET', `/planograms/${id}/stores`),
  assignStores: (id: string, storeIds: string[]) => request<{ assigned: number }>('PUT', `/planograms/${id}/stores`, { storeIds }),
};
