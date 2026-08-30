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

/** Two columns of one cell each, the second at the first's right edge. */
const renderTwoColumns = () => {
  const columns = [0, 1].map((col) => {
    const column = document.createElement("div");
    const cell = document.createElement("div");
    cell.setAttribute("data-col", String(col));
    cell.setAttribute("data-row", "0");
    stubRect(cell, col * CELL_SIZE.width, 0);
    column.appendChild(cell);
    document.body.appendChild(column);
    return column;
  });
  return columns;
};

describe("cellBoxesFromDom", () => {
  // These trees are appended by hand rather than rendered, so the suite's own
  // `cleanup` - which unmounts React roots - has nothing to take away.
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("offers every cell while both columns are drawn", () => {
    renderTwoColumns();
    const { onPage, offPage } = cellBoxesFromDom();

    expect(onPage.map((entry) => entry.cell)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(offPage).toEqual([]);
  });

  it("withholds the cells of a column the pager is not showing", () => {
    const [, exit] = renderTwoColumns();
    // What `offPageColumn` resolves to below `sm`. The class is on the COLUMN
    // and the rule is read on the CELL, which is the whole reason this is a
    // computed read rather than a look at the cell's own attributes. The column
    // is still DRAWN - 20% of it peeks past the viewport - so visibility is
    // exactly what this must not be keyed on.
    exit.style.pointerEvents = "none";
    const { onPage, offPage } = cellBoxesFromDom();

    expect(onPage.map((entry) => entry.cell)).toEqual([{ col: 0, row: 0 }]);
    // Withheld, not discarded. A caller that removes a block on "no cell" has
    // to be able to tell this apart from a release over nothing at all.
    expect(offPage.map((entry) => entry.cell)).toEqual([{ col: 1, row: 0 }]);
  });

  it("offers a cell again once its column is shown", () => {
    const [, exit] = renderTwoColumns();
    exit.style.pointerEvents = "none";
    exit.style.pointerEvents = "auto";

    expect(cellBoxesFromDom().onPage).toHaveLength(2);
    expect(cellBoxesFromDom().offPage).toEqual([]);
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
    renderTwoColumns();
    const { x, y } = centreOf(1);

    expect(resolveDrop(x, y, BLOCK_HEIGHT)).toEqual({
      kind: "available",
      cell: { col: 1, row: 0 },
    });
  });

  it("names a withheld cell rather than reporting no cell at all", () => {
    const [, exit] = renderTwoColumns();
    exit.style.pointerEvents = "none";
    const { x, y } = centreOf(1);

    expect(resolveDrop(x, y, BLOCK_HEIGHT)).toEqual({
      kind: "withheld",
      cell: { col: 1, row: 0 },
    });
  });

  it("prefers a cell on the page to a withheld one the tile also overlaps", () => {
    const [, exit] = renderTwoColumns();
    exit.style.pointerEvents = "none";
    // On the seam between the two cells, so the 40px tile overlaps both. The
    // on-page cell wins outright: a withheld cell is not a candidate, so it
    // never reaches the greatest-overlap rule.
    const seam = CELL_SIZE.width;

    expect(resolveDrop(seam + 1, CELL_SIZE.height / 2, BLOCK_HEIGHT)).toEqual({
      kind: "available",
      cell: { col: 0, row: 0 },
    });
  });

  it("still reports no cell for a release clear of the grid", () => {
    renderTwoColumns();

    expect(resolveDrop(5000, 5000, BLOCK_HEIGHT)).toEqual({ kind: "offGrid" });
  });
});
