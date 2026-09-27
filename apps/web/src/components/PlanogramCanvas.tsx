import { useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { findFreeX, positionWidth, SHELF_THICKNESS, type Bay, type ProductLookup, type Shelf } from '@pvm/shared';
import { productColor, textOn } from '../format';

export type Selection =
  | { kind: 'position'; id: string }
  | { kind: 'shelf'; id: string }
  | { kind: 'bay'; id: string }
  | null;

export interface DropTarget {
  bayIndex: number;
  shelfId: string;
  /** Resolved, collision-free x on the shelf, or null when there is no room. */
  x: number | null;
}

interface Props {
  bays: Bay[];
  products: ProductLookup;
  scale: number;
  selection: Selection;
  issuePositionIds: ReadonlySet<string>;
  readOnly: boolean;
  /** Product currently being dragged from the palette, if any. */
  paletteProductId: string | null;
  onSelect: (s: Selection) => void;
  onDropProduct: (productId: string, target: DropTarget) => void;
  onMovePosition: (positionId: string, target: DropTarget) => void;
}

const PAD_X = 24;
const PAD_TOP = 16;
const PAD_BOTTOM = 36;

interface Ghost {
  bayIndex: number;
  shelf: Shelf;
  x: number | null;
  width: number;
  height: number;
}

export function PlanogramCanvas(props: Props) {
  const { bays, products, scale, selection, issuePositionIds, readOnly } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [moving, setMoving] = useState<{ positionId: string; grabOffset: number; startX: number; moved: boolean } | null>(null);

  const offsets: number[] = [];
  let totalWidth = 0;
  for (const bay of bays) {
    offsets.push(totalWidth);
    totalWidth += bay.width;
  }
  const maxHeight = Math.max(1, ...bays.map((b) => b.height));
  const svgWidth = totalWidth * scale + PAD_X * 2;
  const svgHeight = maxHeight * scale + PAD_TOP + PAD_BOTTOM;

  const sx = (mm: number) => PAD_X + mm * scale;
  const sy = (mmFromFloor: number) => PAD_TOP + (maxHeight - mmFromFloor) * scale;

  /** Converts a pointer position to planogram millimetres (x from the left, y from the floor). */
  const toMm = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - PAD_X) / scale, y: maxHeight - (clientY - rect.top - PAD_TOP) / scale };
  };

  /** Finds the bay and shelf under a point: the highest shelf whose surface is below the point. */
  const hitTest = (x: number, y: number) => {
    const bayIndex = bays.findIndex((b, i) => x >= offsets[i]! && x < offsets[i]! + b.width);
    if (bayIndex < 0) return null;
    const bay = bays[bayIndex]!;
    const sorted = [...bay.shelves].sort((a, b) => a.y - b.y);
    if (sorted.length === 0) return null;
    const shelf = [...sorted].reverse().find((s) => s.y - SHELF_THICKNESS <= y) ?? sorted[0]!;
    return { bayIndex, bay, shelf, localX: x - offsets[bayIndex]! };
  };

  const resolve = (clientX: number, clientY: number, productId: string, facings: number, grabOffset: number, ignoreId?: string): Ghost | null => {
    const product = products.get(productId);
    if (!product) return null;
    const { x, y } = toMm(clientX, clientY);
    const hit = hitTest(x, y);
    if (!hit) return null;
    const width = product.width * facings;
    const preferred = hit.localX - grabOffset;
    return {
      bayIndex: hit.bayIndex,
      shelf: hit.shelf,
      x: findFreeX(hit.shelf, hit.bay.width, width, products, preferred, ignoreId),
      width,
      height: product.height,
    };
  };

  // Palette drag (HTML5 drag and drop)
  const onDragOver = (e: DragEvent) => {
    if (readOnly || !props.paletteProductId) return;
    e.preventDefault();
    const product = products.get(props.paletteProductId);
    setGhost(resolve(e.clientX, e.clientY, props.paletteProductId, 1, (product?.width ?? 0) / 2));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const productId = e.dataTransfer.getData('application/x-pvm-product') || props.paletteProductId;
    const product = productId ? products.get(productId) : undefined;
    const g = productId ? resolve(e.clientX, e.clientY, productId, 1, (product?.width ?? 0) / 2) : null;
    setGhost(null);
    if (productId && g) props.onDropProduct(productId, { bayIndex: g.bayIndex, shelfId: g.shelf.id, x: g.x });
  };

  // Moving an existing position (pointer events)
  const findPosition = (id: string) => {
    for (const [bi, bay] of bays.entries()) {
      for (const shelf of bay.shelves) {
        const pos = shelf.positions.find((p) => p.id === id);
        if (pos) return { bayIndex: bi, shelf, pos };
      }
    }
    return null;
  };

  const onPositionPointerDown = (e: PointerEvent, positionId: string) => {
    e.stopPropagation();
    props.onSelect({ kind: 'position', id: positionId });
    if (readOnly || e.button !== 0) return;
    const found = findPosition(positionId);
    if (!found) return;
    const { x } = toMm(e.clientX, e.clientY);
    svgRef.current!.setPointerCapture(e.pointerId);
    setMoving({ positionId, grabOffset: x - offsets[found.bayIndex]! - found.pos.x, startX: e.clientX, moved: false });
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!moving) return;
    const found = findPosition(moving.positionId);
    if (!found) return;
    const moved = moving.moved || Math.abs(e.clientX - moving.startX) > 3;
    if (moved !== moving.moved) setMoving({ ...moving, moved });
    if (moved) setGhost(resolve(e.clientX, e.clientY, found.pos.productId, found.pos.facings, moving.grabOffset, moving.positionId));
  };

  const onPointerUp = () => {
    if (moving?.moved && ghost) {
      props.onMovePosition(moving.positionId, { bayIndex: ghost.bayIndex, shelfId: ghost.shelf.id, x: ghost.x });
    }
    setMoving(null);
    setGhost(null);
  };

  const selectedId = selection?.id;

  return (
    <div className="canvas-scroll" onDragOver={onDragOver} onDrop={onDrop} onDragLeave={() => setGhost(null)}>
      <svg
        ref={svgRef}
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className={`canvas ${moving?.moved ? 'dragging' : ''}`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerDown={() => props.onSelect(null)}
      >
        <line x1={0} x2={svgWidth} y1={sy(0)} y2={sy(0)} className="floor" />
        {/* Three passes (fixtures, shelves, products) so overhanging products stay visible over the next bay. */}
        {bays.map((bay, bi) => {
          const ox = offsets[bi]!;
          return (
            <g key={bay.id}>
              <rect
                x={sx(ox)}
                y={sy(bay.height)}
                width={bay.width * scale}
                height={bay.height * scale}
                className={`bay ${selectedId === bay.id ? 'selected' : ''}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  props.onSelect({ kind: 'bay', id: bay.id });
                }}
              />
              <text x={sx(ox + bay.width / 2)} y={sy(0) + 16} className="bay-label">
                Bay {bi + 1} · {bay.width} mm
              </text>
            </g>
          );
        })}
        {bays.map((bay, bi) =>
          bay.shelves.map((shelf) => (
            <rect
              key={shelf.id}
              x={sx(offsets[bi]!)}
              y={sy(shelf.y)}
              width={bay.width * scale}
              height={Math.max(2, SHELF_THICKNESS * scale)}
              className={`shelf ${selectedId === shelf.id ? 'selected' : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                props.onSelect({ kind: 'shelf', id: shelf.id });
              }}
            />
          )),
        )}
        {bays.map((bay, bi) => {
          const ox = offsets[bi]!;
          return bay.shelves.map((shelf) => (
            <g key={shelf.id}>
              {shelf.positions.map((pos) => {
                const product = products.get(pos.productId);
                if (!product) return null;
                const color = productColor(product);
                const w = positionWidth(product, pos);
                const blockHeight = product.height * pos.stack;
                const isMoving = moving?.moved && moving.positionId === pos.id;
                const labelChars = Math.floor((w * scale) / 6);
                return (
                  <g
                    key={pos.id}
                    className={`position ${selectedId === pos.id ? 'selected' : ''} ${issuePositionIds.has(pos.id) ? 'issue' : ''}`}
                    opacity={isMoving ? 0.35 : 1}
                    onPointerDown={(e) => onPositionPointerDown(e, pos.id)}
                  >
                    <title>
                      {product.name} · {product.sku} · {pos.facings} facing(s) × {pos.stack} high
                    </title>
                    {Array.from({ length: pos.facings }).flatMap((_, fi) =>
                      Array.from({ length: pos.stack }).map((__, si) => (
                        <rect
                          key={`${fi}-${si}`}
                          x={sx(ox + pos.x + fi * product.width)}
                          y={sy(shelf.y + (si + 1) * product.height)}
                          width={product.width * scale}
                          height={product.height * scale}
                          fill={color}
                          className="unit"
                        />
                      )),
                    )}
                    <rect
                      x={sx(ox + pos.x)}
                      y={sy(shelf.y + blockHeight)}
                      width={w * scale}
                      height={blockHeight * scale}
                      className="outline"
                    />
                    {labelChars >= 4 && (
                      <text x={sx(ox + pos.x) + 3} y={sy(shelf.y) - 4} className="unit-label" fill={textOn(color)}>
                        {product.name.length > labelChars ? `${product.name.slice(0, labelChars - 1)}…` : product.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ));
        })}
        {ghost && (
          <rect
            x={sx(offsets[ghost.bayIndex]! + (ghost.x ?? 0))}
            y={sy(ghost.shelf.y + ghost.height)}
            width={ghost.width * scale}
            height={ghost.height * scale}
            className={`ghost ${ghost.x === null ? 'invalid' : ''}`}
          />
        )}
      </svg>
    </div>
  );
}
