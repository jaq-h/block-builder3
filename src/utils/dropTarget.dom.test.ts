// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

import { cellBoxesFromDom } from "./dropTarget";

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

  it("reports every cell while both columns are drawn", () => {
    renderTwoColumns();

    expect(cellBoxesFromDom().map((entry) => entry.cell)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
  });

  it("drops the cells of a column the pager is not showing", () => {
    const [, exit] = renderTwoColumns();
    // What `offPageColumn` resolves to below `sm`. The class is on the COLUMN
    // and the rule is read on the CELL, which is the whole reason this is a
    // computed read rather than a look at the cell's own attributes. The column
    // is still DRAWN - 20% of it peeks past the viewport - so visibility is
    // exactly what this must not be keyed on.
    exit.style.pointerEvents = "none";

    expect(cellBoxesFromDom().map((entry) => entry.cell)).toEqual([
      { col: 0, row: 0 },
    ]);
  });

  it("reports a cell again once its column is shown", () => {
    const [, exit] = renderTwoColumns();
    exit.style.pointerEvents = "none";
    exit.style.pointerEvents = "auto";

    expect(cellBoxesFromDom()).toHaveLength(2);
  });
});
