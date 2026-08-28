// @vitest-environment jsdom
//
// The drop-target helpers in grid.ts resolve a pointer position against real
// `[data-col][data-row]` elements, so they need a document. They are split out
// from grid.test.ts because the rest of that module is pure and runs in node.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { findCellAtPosition } from "@utils/grid";

// =============================================================================
// FIXTURES
// =============================================================================

interface CellBox {
  col: number;
  row: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Mount cells carrying the data attributes the helpers look for, and stub
 * getBoundingClientRect - jsdom performs no layout, so every element would
 * otherwise report a zero-sized rect.
 */
const mountCells = (boxes: CellBox[]) => {
  boxes.forEach(({ col, row, top, left, width, height }) => {
    const el = document.createElement("div");
    el.setAttribute("data-col", String(col));
    el.setAttribute("data-row", String(row));
    el.getBoundingClientRect = () =>
      ({
        top,
        left,
        bottom: top + height,
        right: left + width,
        width,
        height,
        x: left,
        y: top,
      }) as DOMRect;
    document.body.appendChild(el);
  });
};

// A single 200x400 cell at the origin: the entry column, middle row.
const ENTRY_MIDDLE: CellBox = {
  col: 0,
  row: 1,
  top: 0,
  left: 0,
  width: 200,
  height: 400,
};

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

// =============================================================================
// TESTS
// =============================================================================

describe("findCellAtPosition", () => {
  it("resolves a pointer inside a cell to that cell's coordinates", () => {
    mountCells([ENTRY_MIDDLE, { ...ENTRY_MIDDLE, col: 1, row: 2, left: 200 }]);

    expect(findCellAtPosition(100, 200)).toEqual({ col: 0, row: 1 });
    expect(findCellAtPosition(300, 200)).toEqual({ col: 1, row: 2 });
  });

  it("treats the cell edges as inside", () => {
    mountCells([ENTRY_MIDDLE]);

    expect(findCellAtPosition(0, 0)).toEqual({ col: 0, row: 1 });
    expect(findCellAtPosition(200, 400)).toEqual({ col: 0, row: 1 });
  });

  it("returns null for a pointer outside every cell", () => {
    mountCells([ENTRY_MIDDLE]);

    expect(findCellAtPosition(500, 200)).toBeNull();
    expect(findCellAtPosition(100, 900)).toBeNull();
  });

  it("returns null when the grid has not rendered yet", () => {
    expect(findCellAtPosition(100, 200)).toBeNull();
  });

  it("ignores elements that carry only one of the two data attributes", () => {
    const partial = document.createElement("div");
    partial.setAttribute("data-col", "0");
    partial.getBoundingClientRect = () =>
      ({ top: 0, left: 0, bottom: 400, right: 200 }) as DOMRect;
    document.body.appendChild(partial);

    expect(findCellAtPosition(100, 200)).toBeNull();
  });
});

// `findCellAndPositionData` was tested here and is gone. It read a cell, an
// axis and a slider position off one drop, and two of those three were wrong:
// the position came from `calculateYPosition` on a 0-100 scale while the axis
// runs to 50, and the axis was taken from which half of the cell the pointer
// was in without touching the block's matching `axes`. A drop now resolves a
// cell and nothing else - `findCellAtPosition`, above - and the tests that
// pinned the other two are recorded in `grid.test.ts` under "POSITION MATHS".
