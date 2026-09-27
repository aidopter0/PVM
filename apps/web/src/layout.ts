/**
 * Pure, immutable edits on a planogram's bay tree. The editor keeps the bay
 * array in an undo history, so every function returns a new array.
 */
import {
  compactShelf,
  generateBay,
  recomputeClearances,
  SHELF_THICKNESS,
  type Bay,
  type Position,
  type ProductLookup,
  type Shelf,
} from '@pvm/shared';

export const newId = () => crypto.randomUUID();

export function findPosition(bays: Bay[], id: string) {
  for (const bay of bays) {
    for (const shelf of bay.shelves) {
      const position = shelf.positions.find((p) => p.id === id);
      if (position) return { bay, shelf, position };
    }
  }
  return null;
}

export function findShelf(bays: Bay[], id: string) {
  for (const bay of bays) {
    const shelf = bay.shelves.find((s) => s.id === id);
    if (shelf) return { bay, shelf };
  }
  return null;
}

const mapShelves = (bays: Bay[], fn: (shelf: Shelf, bay: Bay) => Shelf): Bay[] =>
  bays.map((bay) => ({ ...bay, shelves: bay.shelves.map((s) => fn(s, bay)) }));

export function updatePosition(bays: Bay[], id: string, patch: Partial<Omit<Position, 'id'>>): Bay[] {
  return mapShelves(bays, (shelf) =>
    shelf.positions.some((p) => p.id === id)
      ? { ...shelf, positions: shelf.positions.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
      : shelf,
  );
}

export function removePosition(bays: Bay[], id: string): Bay[] {
  return mapShelves(bays, (shelf) =>
    shelf.positions.some((p) => p.id === id) ? { ...shelf, positions: shelf.positions.filter((p) => p.id !== id) } : shelf,
  );
}

export function addPosition(bays: Bay[], shelfId: string, position: Position): Bay[] {
  return mapShelves(bays, (shelf) => (shelf.id === shelfId ? { ...shelf, positions: [...shelf.positions, position] } : shelf));
}

export function movePosition(bays: Bay[], id: string, shelfId: string, x: number): Bay[] {
  const found = findPosition(bays, id);
  if (!found) return bays;
  return addPosition(removePosition(bays, id), shelfId, { ...found.position, x });
}

export function updateShelf(bays: Bay[], shelfId: string, patch: Partial<Pick<Shelf, 'y' | 'depth'>>): Bay[] {
  return bays.map((bay) =>
    bay.shelves.some((s) => s.id === shelfId)
      ? recomputeClearances({ ...bay, shelves: bay.shelves.map((s) => (s.id === shelfId ? { ...s, ...patch } : s)) })
      : bay,
  );
}

export function compactShelfIn(bays: Bay[], shelfId: string, products: ProductLookup): Bay[] {
  return mapShelves(bays, (shelf) => (shelf.id === shelfId ? { ...shelf, positions: compactShelf(shelf.positions, products) } : shelf));
}

export function removeShelf(bays: Bay[], shelfId: string): Bay[] {
  return bays.map((bay) =>
    bay.shelves.some((s) => s.id === shelfId) ? recomputeClearances({ ...bay, shelves: bay.shelves.filter((s) => s.id !== shelfId) }) : bay,
  );
}

/** Adds a shelf in the middle of the largest vertical gap of the bay. */
export function addShelf(bays: Bay[], bayId: string): Bay[] {
  return bays.map((bay) => {
    if (bay.id !== bayId) return bay;
    const ys = [...bay.shelves.map((s) => s.y)].sort((a, b) => a - b);
    const bounds = [0, ...ys, bay.height];
    let bestY = Math.round(bay.height / 2);
    let bestGap = -1;
    for (let i = 0; i < bounds.length - 1; i++) {
      const gap = bounds[i + 1]! - bounds[i]!;
      if (gap > bestGap) {
        bestGap = gap;
        bestY = Math.round(bounds[i]! + gap / 2);
      }
    }
    if (bestGap < SHELF_THICKNESS * 3) return bay;
    const shelf: Shelf = { id: newId(), index: 0, y: bestY, clearance: 1, depth: bay.depth, positions: [] };
    return recomputeClearances({ ...bay, shelves: [...bay.shelves, shelf] });
  });
}

export function updateBay(bays: Bay[], bayId: string, patch: Partial<Pick<Bay, 'width' | 'height' | 'depth'>>): Bay[] {
  return bays.map((bay) => (bay.id === bayId ? recomputeClearances({ ...bay, ...patch }) : bay));
}

export function removeBay(bays: Bay[], bayId: string): Bay[] {
  return bays.filter((b) => b.id !== bayId).map((b, index) => ({ ...b, index }));
}

/** Appends an empty bay using the dimensions and shelf heights of the last bay. */
export function addBay(bays: Bay[]): Bay[] {
  const last = bays[bays.length - 1];
  if (!last) return [generateBay({ width: 1000, height: 1950, depth: 450, shelfCount: 5, index: 0 }, newId)];
  return [
    ...bays,
    { ...last, id: newId(), index: bays.length, shelves: last.shelves.map((s) => ({ ...s, id: newId(), positions: [] })) },
  ];
}

/** Inserts a copy of a bay, including its products, to the right of it. */
export function duplicateBay(bays: Bay[], bayId: string): Bay[] {
  const i = bays.findIndex((b) => b.id === bayId);
  if (i < 0) return bays;
  const src = bays[i]!;
  const copy: Bay = {
    ...src,
    id: newId(),
    shelves: src.shelves.map((s) => ({ ...s, id: newId(), positions: s.positions.map((p) => ({ ...p, id: newId() })) })),
  };
  return [...bays.slice(0, i + 1), copy, ...bays.slice(i + 1)].map((b, index) => ({ ...b, index }));
}

export function moveBay(bays: Bay[], bayId: string, dir: -1 | 1): Bay[] {
  const i = bays.findIndex((b) => b.id === bayId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= bays.length) return bays;
  const next = [...bays];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next.map((b, index) => ({ ...b, index }));
}
