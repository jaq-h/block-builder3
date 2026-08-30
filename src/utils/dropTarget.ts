// =============================================================================
// DROP TARGET - which cell a released block lands in
// =============================================================================
//
// One owner of "what did this drop hit", for every drag in the grid: the
// palette drag that creates an order, the free drag of a placed block, and the
// hover highlight that has to name the same cell those two will resolve to. A
// second derivation of this is how a highlight comes to promise a cell the drop
// then refuses, so there is exactly one and all three call sites use it.
//
// ── What is hit-tested, and why it is not the pointer ────────────────────
//
// A drag carries a 40px tile on the cursor (`DragOverlay`, centred using
// `BLOCK_HEIGHT`), and what the user aims is that tile, not the one pixel
// under the cursor's hotspot. Testing the pointer alone left a dead band around
// every cell as wide as half a tile in each direction, plus the whole gutter
// between two cells: measured in Chrome at 1440x900 the columns are 24px apart
// and the rows 15px, so a release anywhere in a gutter showed a block clearly
// overlapping a cell and dropped it nowhere, announcing "Released outside the
// grid".
//
// That band is not speed-dependent - a slow drag released in it fails
// identically. Speed is what makes it *visible*: the same point test drives the
// target highlight, so a slow user watches the highlight go out and corrects
// before letting go, while a fast one has released before the feedback is worth
// anything. The captain reported it as a fast-drag defect for that reason.
//
// So the block's own rectangle is what is tested, and a cell its edge overlaps
// is a cell it can land in.
//
// ── Overlapping two or more cells ────────────────────────────────────────
//
// Widening the target means a tile can straddle a gutter and overlap both of
// its neighbours. The order is fixed and total, so the same release always
// resolves to the same cell:
//
//   1. the greatest overlap AREA wins;
//   2. tied, the cell containing the pointer wins;
//   3. still tied, the lowest (column, row) wins.
//
// Step 3 is sorted here rather than taken from the caller's order, so the
// answer does not depend on the order `querySelectorAll` happens to return.
//
// ── What this does NOT decide ────────────────────────────────────────────
//
// Whether the cell will *take* the order. This module answers geometry and
// stops there; `isCellValidForPlacement` and the placement primitives in
// `GridArea` answer the rules, and a drop onto a cell that refuses is still
// refused. Folding validity in here would let a block released squarely over a
// cell that says no be silently placed in a neighbour it merely brushed, which
// is the substitution the order path exists to prevent.

import type { CellPosition } from "../types/grid";

/** A rectangle in client coordinates: what `getBoundingClientRect` reports. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One candidate cell and the box it occupies on screen. */
export interface CellBox {
  cell: CellPosition;
  box: Box;
}

export interface DropPoint {
  x: number;
  y: number;
}

/**
 * Two areas closer than this are one area.
 *
 * Client rects are fractional, so two cells a tile straddles symmetrically
 * rarely overlap it by *exactly* the same amount. Without a floor, a
 * hundredth of a square pixel of rounding would decide the cell instead of
 * the pointer, which is arbitrary rather than deterministic. One square pixel
 * out of a 1600px tile is rounding by any measure.
 */
const AREA_TIE_EPSILON_PX2 = 1;

/** The area the two boxes share, or 0 when they only touch or miss entirely. */
const overlapArea = (a: Box, b: Box): number => {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
};

const containsPoint = (box: Box, point: DropPoint): boolean =>
  point.x >= box.left &&
  point.x <= box.right &&
  point.y >= box.top &&
  point.y <= box.bottom;

/** Column first, then row: the grid read the way it is drawn. */
const byGridOrder = (a: CellBox, b: CellBox): number =>
  a.cell.col - b.cell.col || a.cell.row - b.cell.row;

/** The box a `size`-square tile occupies when it is centred on a point. */
export const blockBoxAt = (point: DropPoint, size: number): Box => {
  const half = size / 2;
  return {
    left: point.x - half,
    top: point.y - half,
    right: point.x + half,
    bottom: point.y + half,
  };
};

/**
 * The cell a block released at `point` lands in, or null when its box overlaps
 * no cell at all - the release that means "off the grid".
 *
 * See this module's header for the tie-breaking order and for why the block's
 * box is the thing tested.
 */
export const resolveDropCell = (
  block: Box,
  point: DropPoint,
  cells: CellBox[],
): CellPosition | null => {
  const overlapping = cells
    .map((candidate) => ({ candidate, area: overlapArea(block, candidate.box) }))
    .filter(({ area }) => area > 0);

  if (overlapping.length === 0) return null;

  const greatest = Math.max(...overlapping.map(({ area }) => area));
  let tied = overlapping
    .filter(({ area }) => greatest - area <= AREA_TIE_EPSILON_PX2)
    .map(({ candidate }) => candidate);

  if (tied.length > 1) {
    const underPointer = tied.filter(({ box }) => containsPoint(box, point));
    // Only when the pointer separates them. In a gutter it is inside neither,
    // and narrowing to an empty set would throw the answer away.
    if (underPointer.length > 0) tied = underPointer;
  }

  return [...tied].sort(byGridOrder)[0].cell;
};

/**
 * Every rendered cell and where it is, read from the DOM.
 *
 * Coordinates rather than `elementFromPoint`: a dragged block holds pointer
 * capture, so the event target is the block itself for the whole drag, and the
 * ghost on the cursor would be under the point in any case.
 *
 * **A cell the user cannot see is not a candidate.** Below `sm` the two grid
 * columns are still side by side, with the panel showing one of them at a time
 * through a paged viewport (`columnsWrapper`), and the off-screen column keeps
 * a box - that is what `visibility: hidden` buys over `display: none`, and it
 * is what keeps the columns beside each other. Its cells therefore still report
 * a rect, immediately to the right of the viewport's own edge, and a tile
 * dragged against that edge overlaps them: measured at a 390px viewport a
 * release at the far right put 30px of the tile over an Exit cell against 4px
 * over the Entry cell it was drawn on, so the greatest-overlap rule placed the
 * order into a column that was not on screen, with no highlight to warn of it -
 * the highlight is computed from this same list, so it was off screen too.
 *
 * `visibility` is inherited, so one computed read per cell answers it for the
 * whole column without this module knowing anything about how the panel pages.
 */
export const cellBoxesFromDom = (): CellBox[] => {
  const cells: CellBox[] = [];
  for (const element of Array.from(
    document.querySelectorAll("[data-col][data-row]"),
  )) {
    const col = Number.parseInt(element.getAttribute("data-col") ?? "", 10);
    const row = Number.parseInt(element.getAttribute("data-row") ?? "", 10);
    if (Number.isNaN(col) || Number.isNaN(row)) continue;
    if (getComputedStyle(element).visibility !== "visible") continue;
    const { left, top, right, bottom } = element.getBoundingClientRect();
    cells.push({ cell: { col, row }, box: { left, top, right, bottom } });
  }
  return cells;
};

/**
 * The whole question in one call: a released tile of `blockSize`, centred on
 * (`x`, `y`), lands in this cell or in none.
 */
export const findDropCell = (
  x: number,
  y: number,
  blockSize: number,
): CellPosition | null => {
  const point = { x, y };
  return resolveDropCell(blockBoxAt(point, blockSize), point, cellBoxesFromDom());
};
