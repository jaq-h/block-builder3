// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

import { cellBoxesFromDom } from "./dropTarget";

// =============================================================================
// WHICH CELLS ARE CANDIDATES AT ALL
// =============================================================================
//
// `resolveDropCell` is tested in `dropTarget.test.ts` against fixtures. This
// file covers the other half - what the DOM hands it - and there is one rule
// there worth an executable guard: a cell the user cannot see is not a drop
// target.
//
// Below `sm` the two grid columns stay side by side and the panel shows one at
// a time through a paged viewport, with the off-page column held by
// `visibility: hidden` rather than removed. That is deliberate - the columns
// have to keep their boxes to be beside each other - and it means the hidden
// column's cells still report a rect, immediately to the right of the
// viewport's own edge. A released tile is 40px wide and centred on the pointer,
// so a release against that edge overlaps them: measured in Chrome at a 390px
// viewport, a release at the far right put 30px of the tile over an Exit cell
// against 4px over the Entry cell it was drawn on, and greatest-overlap-wins
// placed the order into a column that was not on screen. The highlight comes
// from this same list, so nothing warned of it either.
//
// jsdom lays nothing out, so the rects here are stubbed. What it CAN see is the
// thing that matters: that the filter reads computed `visibility` and that
// `visibility` reaching a cell from an ancestor is enough, which is what lets
// the whole column be hidden by one class.

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
    // What `hiddenColumn` resolves to. The class is on the COLUMN and the rule
    // is read on the CELL, which is the whole reason this is a computed read
    // rather than a look at the cell's own attributes.
    exit.style.visibility = "hidden";

    expect(cellBoxesFromDom().map((entry) => entry.cell)).toEqual([
      { col: 0, row: 0 },
    ]);
  });

  it("reports a cell again once its column is shown", () => {
    const [, exit] = renderTwoColumns();
    exit.style.visibility = "hidden";
    exit.style.visibility = "visible";

    expect(cellBoxesFromDom()).toHaveLength(2);
  });
});
