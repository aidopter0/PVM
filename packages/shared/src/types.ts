/**
 * Shared domain types. All physical dimensions are integer millimetres.
 */

export type FixtureType = 'SHELVING' | 'CHILLER' | 'FREEZER' | 'PEGBOARD' | 'END_CAP';
export type PlanogramStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

export interface Product extends Dimensions {
  id: string;
  sku: string;
  gtin: string | null;
  name: string;
  brand: string | null;
  categoryId: string | null;
  price: number | null;
  color: string | null;
  imageUrl: string | null;
}

export interface Position {
  id: string;
  productId: string;
  /** Offset of the left edge from the left edge of the shelf. */
  x: number;
  /** Number of units side by side facing the shopper. */
  facings: number;
  /** Number of units stacked vertically. */
  stack: number;
}

export interface Shelf {
  id: string;
  index: number;
  /** Height of the shelf surface from the floor. */
  y: number;
  /** Vertical clearance available above the shelf surface. */
  clearance: number;
  depth: number;
  positions: Position[];
}

export interface Bay extends Dimensions {
  id: string;
  index: number;
  shelves: Shelf[];
}

export interface Planogram {
  id: string;
  name: string;
  status: PlanogramStatus;
  fixtureType: FixtureType;
  categoryId: string | null;
  notes: string | null;
  bays: Bay[];
  updatedAt: string;
}

export type IssueCode = 'OVERFLOW' | 'OVERLAP' | 'TOO_TALL' | 'TOO_DEEP' | 'OUT_OF_BOUNDS' | 'UNKNOWN_PRODUCT';

export interface Issue {
  code: IssueCode;
  shelfId: string;
  positionId: string;
  message: string;
}
