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

/** Every rendered cell, split by whether the panel is offering it. */
export interface CellBoxes {
  /** Cells a release may land in. */
  onPage: CellBox[];
  /**
   * Cells that are DRAWN but withheld from hit testing - the peeking column.
   * They are never drop candidates; they are kept so a release over one can be
   * told apart from a release over nothing at all.
   */
  offPage: CellBox[];
}

/**
 * Every cell of ONE grid and where it is, read from the DOM.
 *
 * Coordinates rather than `elementFromPoint`: a dragged block holds pointer
 * capture, so the event target is the block itself for the whole drag, and the
 * ghost on the cursor would be under the point in any case.
 *
 * **`gridRoot` is the grid that owns the drag, and it is a parameter because
 * this question has an owner rather than a document.** `data-col` and
 * `data-row` are how a cell says where it sits in ITS grid, and nothing about
 * them says which grid that is: `ReadOnlyGridCell` carries the same pair, so a
 * document-wide query answered "which cell was this released over" with any
 * matching element on the page. Above `lg` both panels are on screen at once,
 * and a palette drag released over a read-only cell at (0, 1) therefore
 * resolved to (0, 1) and `GridArea` placed the order in the ASSEMBLY cell of
 * those coordinates - measured in Chrome at 1440x900, a release centred at
 * (911, 691) in the Active Orders panel put a Limit in the assembly grid at
 * x 149..420, announcing "Placed Limit order in Entry column, primary row."
 * The user dropped an order on one grid and it landed in another.
 *
 * The caller passes the element its own cells are rendered inside -
 * `columnsWrapper`, which `GridArea` already holds as `columnsViewportRef` and
 * already reads for which columns exist and which of them the panel is
 * withholding. One element owns all three answers, so a second grid mounted
 * anywhere on the page is not a candidate for this one's drag, and cannot
 * become one by matching a selector.
 *
 * **This is the same question the split below asks, narrowed - not a second
 * filter beside it.** There is still one query and one loop: the root decides
 * which cells are in the set, and the `pointer-events` read decides which half
 * of the set each one lands in. The two cannot disagree, because a cell that
 * is not in this grid never reaches the read, and a cell that is reaches
 * exactly the rule that was already there.
 *
 * **A cell the user cannot reach is not a candidate.** Below `sm` the two grid
 * columns are still side by side, with the panel showing one of them at a time
 * through a paged viewport (`columnsWrapper`), and 20% of the off-page column
 * shows past the viewport's edge as a cue that there is more to view. Its cells
 * therefore report a rect that overlaps the viewport, and a tile dragged
 * against that edge overlaps them: measured at a 390px viewport a release at
 * the far right put 30px of the tile over an Exit cell against 4px over the
 * Entry cell it was drawn on, so the greatest-overlap rule placed the order
 * into a column that was not on screen, with no highlight to warn of it - the
 * highlight is computed from this same list, so it was off screen too.
 *
 * **Visible does not mean droppable, and the peek is why that sentence has to
 * be said.** The off-page column used to be `visibility: hidden`, so "can the
 * user see it" and "may a drop land in it" were one fact and this module could
 * read either. Drawing the peek separated them. `pointer-events` is what it
 * reads now: `offPageColumn` withholds the peeking column from hit testing,
 * which is the same question a drop is asking, so the two cannot drift.
 *
 * `pointer-events` is inherited, so one computed read per cell answers it for
 * the whole column without this module knowing anything about how the panel
 * pages - and it is written by a breakpoint, so above `sm`, where both columns
 * are drawn and reachable, nothing is withheld.
 *
 * A cell is safe to read that way because a cell declares no `pointer-events`
 * of its own. That is not true everywhere in the column - the block positioner
 * opts its tile back in explicitly - so `offPageColumn` carries a second,
 * subtree-wide rule for the elements that do declare one. This module is
 * unaffected either way: what it reads still computes `none`, by inheritance
 * before that rule and by declaration after it.
 *
 * **A withheld cell is SORTED OUT, not thrown away, and the difference is a
 * block the user does not get back.** Dropping it here made "the tile was over
 * a column the panel is not showing" and "the tile was over nothing at all"
 * one answer, and the free drag of a placed block reads the second as "clear
 * of the grid" and REMOVES the block. The peek put that band inside the panel:
 * a tile centred past the on-page cell's right edge overlaps no candidate,
 * which at a 320px viewport is every release from x 246 to the panel edge at
 * 288 - 42px of drawn column in which a release destroyed the order, with no
 * undo. Keeping the two apart is what lets `resolveDrop` refuse instead.
 */
export const cellBoxesFromDom = (gridRoot: ParentNode): CellBoxes => {
  const onPage: CellBox[] = [];
  const offPage: CellBox[] = [];
  for (const element of Array.from(
    gridRoot.querySelectorAll("[data-col][data-row]"),
  )) {
    const col = Number.parseInt(element.getAttribute("data-col") ?? "", 10);
    const row = Number.parseInt(element.getAttribute("data-row") ?? "", 10);
    if (Number.isNaN(col) || Number.isNaN(row)) continue;
    const withheld = getComputedStyle(element).pointerEvents === "none";
    const { left, top, right, bottom } = element.getBoundingClientRect();
    const entry: CellBox = {
      cell: { col, row },
      box: { left, top, right, bottom },
    };
    (withheld ? offPage : onPage).push(entry);
  }
  return { onPage, offPage };
};

/**
 * What a release at a point reached.
 *
 * Three answers rather than a cell-or-null, because the caller that removes a
 * block on "no cell" has to be able to tell a release over a drawn column
 * apart from a release over the page.
 */
export type DropResolution =
  /** A cell the panel is showing. This is the only one a release may place in. */
  | { kind: "available"; cell: CellPosition }
  /**
   * A cell that is drawn but withheld - the peek. Named so a release over it
   * can be REFUSED, naming the cell it landed on; it is never placed in.
   */
  | { kind: "withheld"; cell: CellPosition }
  /** No cell at all: the release really was clear of the grid. */
  | { kind: "offGrid" };

/**
 * The whole question in one call: a released tile of `blockSize`, centred on
 * (`x`, `y`), reached this cell of `gridRoot`, a withheld one, or none.
 *
 * `gridRoot` is the grid the drag belongs to - see `cellBoxesFromDom` for why
 * the caller names it rather than this module reaching for the document.
 *
 * The withheld half runs the same `resolveDropCell` over the withheld boxes, so
 * a refusal names the cell by the tie-breaking rules a placement would have
 * used rather than by a second geometry of its own.
 */
export const resolveDrop = (
  x: number,
  y: number,
  blockSize: number,
  gridRoot: ParentNode,
): DropResolution => {
  const point = { x, y };
  const block = blockBoxAt(point, blockSize);
  const { onPage, offPage } = cellBoxesFromDom(gridRoot);

  const available = resolveDropCell(block, point, onPage);
  if (available) return { kind: "available", cell: available };

  const withheld = resolveDropCell(block, point, offPage);
  return withheld ? { kind: "withheld", cell: withheld } : { kind: "offGrid" };
};
