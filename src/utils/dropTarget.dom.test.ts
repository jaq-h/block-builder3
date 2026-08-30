// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

import { BLOCK_HEIGHT } from "@styles/grid";

import { cellBoxesFromDom, resolveDrop } from "./dropTarget";

// =============================================================================
// WHICH CELLS ARE CANDIDATES AT ALL
// =============================================================================
//
// `resolveDropCell` is tested in `dropTarget.test.ts` against fixtures. This
// file covers the other half - what the DOM hands it - and there is one rule
// there worth an executable guard: a cell the panel is not showing is not a
// drop target, however much of it the user can see.
//
// Below `sm` the two grid columns stay side by side and the panel shows one at
// a time through a paged viewport, with 20% of the off-page column DRAWN past
// its edge as a cue that there is more to view. So that column's cells report a
// rect immediately to the right of the viewport's own edge. A released tile is
// 40px wide and centred on the pointer, so a release against that edge overlaps
// them: measured in Chrome at a 390px viewport, a release at the far right put
// 30px of the tile over an Exit cell against 4px over the Entry cell it was
// drawn on, and greatest-overlap-wins placed the order into a column that was
// not on screen. The highlight comes from this same list, so nothing warned of
// it either.
//
// **Visible does not mean droppable**, which is why the filter is keyed on
// `pointer-events` rather than on visibility: the peek separated "can the user
// see it" from "may a drop land in it", and hit testing is the same question a
// drop asks.
//
// jsdom lays nothing out, so the rects here are stubbed. What it CAN see is the
// thing that matters: that the filter reads computed `pointer-events` and that
// the value reaching a cell from an ancestor is enough, which is what lets the
// whole column be withheld by one class.

const CELL_SIZE = { width: 100, height: 50 };

const stubRect = (element: HTMLElement, left: number, top: number) => {
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      right: left + CELL_SIZE.width,
      bottom: top + CELL_SIZE.height,
      width: CELL_SIZE.width,
      height: CELL_SIZE.height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
};

/**
 * Two columns of one cell each, the second at the first's right edge, inside
 * the viewport element that owns them.
 *
 * The viewport is `columnsWrapper` in the real tree, and it is what the caller
 * hands the resolver: the cells belong to a grid rather than to the document,
 * so the fixture has to have one for the tests to be asking the real question.
 */
const renderGrid = (offsetX = 0) => {
  const viewport = document.createElement("div");
  const columns = [0, 1].map((col) => {
    const column = document.createElement("div");
    const cell = document.createElement("div");
    cell.setAttribute("data-col", String(col));
    cell.setAttribute("data-row", "0");
    stubRect(cell, offsetX + col * CELL_SIZE.width, 0);
    column.appendChild(cell);
    viewport.appendChild(column);
    return column;
  });
  document.body.appendChild(viewport);
  return { viewport, columns };
};

describe("cellBoxesFromDom", () => {
  // These trees are appended by hand rather than rendered, so the suite's own
  // `cleanup` - which unmounts React roots - has nothing to take away.
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("offers every cell while both columns are drawn", () => {
    const { viewport } = renderGrid();
    const { onPage, offPage } = cellBoxesFromDom(viewport);

    expect(onPage.map((entry) => entry.cell)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(offPage).toEqual([]);
  });

  it("withholds the cells of a column the pager is not showing", () => {
    const {
      viewport,
      columns: [, exit],
    } = renderGrid();
    // What `offPageColumn` resolves to below `sm`. The class is on the COLUMN
    // and the rule is read on the CELL, which is the whole reason this is a
    // computed read rather than a look at the cell's own attributes. The column
    // is still DRAWN - 20% of it peeks past the viewport - so visibility is
    // exactly what this must not be keyed on.
    exit.style.pointerEvents = "none";
    const { onPage, offPage } = cellBoxesFromDom(viewport);

    expect(onPage.map((entry) => entry.cell)).toEqual([{ col: 0, row: 0 }]);
    // Withheld, not discarded. A caller that removes a block on "no cell" has
    // to be able to tell this apart from a release over nothing at all.
    expect(offPage.map((entry) => entry.cell)).toEqual([{ col: 1, row: 0 }]);
  });

  it("offers a cell again once its column is shown", () => {
    const {
      viewport,
      columns: [, exit],
    } = renderGrid();
    exit.style.pointerEvents = "none";
    exit.style.pointerEvents = "auto";

    expect(cellBoxesFromDom(viewport).onPage).toHaveLength(2);
    expect(cellBoxesFromDom(viewport).offPage).toEqual([]);
  });
});

// =============================================================================
// A RELEASE OVER A DRAWN BUT WITHHELD CELL IS NOT A RELEASE OVER NOTHING
// =============================================================================
//
// The distinction the free drag of a placed block turns on: a release clear of
// every cell REMOVES the block, and reading a release over the peeking column
// as that is how a drawn band inside the panel came to destroy an order with no
// undo. The exclusion itself is unchanged - a withheld cell is still never
// placed into.

describe("resolveDrop", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  /** Dead centre of the cell at `col`, in the stubbed geometry above. */
  const centreOf = (col: number) => ({
    x: col * CELL_SIZE.width + CELL_SIZE.width / 2,
    y: CELL_SIZE.height / 2,
  });

  it("places into a cell the panel is showing", () => {
    const { viewport } = renderGrid();
    const { x, y } = centreOf(1);

    expect(resolveDrop(x, y, BLOCK_HEIGHT, viewport)).toEqual({
      kind: "available",
      cell: { col: 1, row: 0 },
    });
  });

  it("names a withheld cell rather than reporting no cell at all", () => {
    const {
      viewport,
      columns: [, exit],
    } = renderGrid();
    exit.style.pointerEvents = "none";
    const { x, y } = centreOf(1);

    expect(resolveDrop(x, y, BLOCK_HEIGHT, viewport)).toEqual({
      kind: "withheld",
      cell: { col: 1, row: 0 },
    });
  });

  it("prefers a cell on the page to a withheld one the tile also overlaps", () => {
    const {
      viewport,
      columns: [, exit],
    } = renderGrid();
    exit.style.pointerEvents = "none";
    // On the seam between the two cells, so the 40px tile overlaps both. The
    // on-page cell wins outright: a withheld cell is not a candidate, so it
    // never reaches the greatest-overlap rule.
    const seam = CELL_SIZE.width;

    expect(
      resolveDrop(seam + 1, CELL_SIZE.height / 2, BLOCK_HEIGHT, viewport),
    ).toEqual({
      kind: "available",
      cell: { col: 0, row: 0 },
    });
  });

  it("still reports no cell for a release clear of the grid", () => {
    const { viewport } = renderGrid();

    expect(resolveDrop(5000, 5000, BLOCK_HEIGHT, viewport)).toEqual({
      kind: "offGrid",
    });
  });
});

// =============================================================================
// A CELL OF ANOTHER GRID IS NOT A CANDIDATE FOR THIS ONE'S DRAG
// =============================================================================
//
// `data-col` and `data-row` say where a cell sits in ITS grid and nothing about
// which grid that is, so a document-wide query answered "which cell was this
// released over" with any matching element on the page. `ReadOnlyGridCell`
// carries the same pair, and above `lg` both panels are on screen at once.
//
// Reproduced in Chrome at 1440x900 before the fix, with a read-only grid
// restored to the Active Orders panel: a palette drag released dead centre of
// the read-only cell at (0, 1) - x 756..1066, y 646..736, entirely clear of the
// assembly grid at x 149..715 - put a Limit into the ASSEMBLY grid's Entry
// primary cell and announced "Placed Limit order in Entry column, primary row."
// The user dropped an order on one grid and it landed in another.
//
// The fix is that the caller names the grid the drag belongs to, so this is
// pinned as a release over a foreign grid resolving to no cell at all rather
// than to the coordinates it shares with this one. The foreign grid here is
// laid out well clear of the owning one, exactly as the two panels are.
//
// **Not a second filter beside the `pointer-events` rule above.** A foreign
// cell never reaches that rule, because it is not in the set the root gathers;
// the last case below is what says so, by giving the foreign cell the
// `pointer-events` an ON-PAGE cell has and still expecting no answer from it.

describe("a second grid on the page", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  /** Where the foreign grid is drawn: clear of the owning one, as a panel is. */
  const FOREIGN_OFFSET_X = 600;

  const foreignCentre = (col: number) => ({
    x: FOREIGN_OFFSET_X + col * CELL_SIZE.width + CELL_SIZE.width / 2,
    y: CELL_SIZE.height / 2,
  });

  it("does not collect the cells of a grid it was not given", () => {
    const { viewport } = renderGrid();
    renderGrid(FOREIGN_OFFSET_X);

    const { onPage, offPage } = cellBoxesFromDom(viewport);

    expect(onPage.map((entry) => entry.cell)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(offPage).toEqual([]);
  });

  it("reports no cell for a release over the other grid", () => {
    const { viewport } = renderGrid();
    renderGrid(FOREIGN_OFFSET_X);
    const { x, y } = foreignCentre(0);

    // The reproduction. Before the fix this answered `available` at
    // { col: 0, row: 0 }, and the caller placed an order into THIS grid's cell
    // of those coordinates.
    expect(resolveDrop(x, y, BLOCK_HEIGHT, viewport)).toEqual({
      kind: "offGrid",
    });
  });

  it("is unmoved by the other grid being on page in its own panel", () => {
    const { viewport } = renderGrid();
    const foreign = renderGrid(FOREIGN_OFFSET_X);
    // An ordinary, fully reachable cell of the other panel - which is what the
    // Active Orders panel's cells are above `lg`. Ownership is what excludes
    // it, so the `pointer-events` rule has nothing to say here either way.
    for (const column of foreign.columns) column.style.pointerEvents = "auto";
    const { x, y } = foreignCentre(1);

    expect(resolveDrop(x, y, BLOCK_HEIGHT, viewport)).toEqual({
      kind: "offGrid",
    });
  });
});
