// @vitest-environment jsdom
//
// The drop-target helpers in grid.ts resolve a pointer position against real
// `[data-col][data-row]` elements, so they need a document. They are split out
// from grid.test.ts because the rest of that module is pure and runs in node.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { findCellAndPositionData, findCellAtPosition } from "@utils/grid";

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

describe("findCellAndPositionData", () => {
  it("resolves the cell, the axis and the slider position in one pass", () => {
    mountCells([ENTRY_MIDDLE]);

    // Left half of the cell is axis 1; y=56 is the top of an ascending track.
    expect(findCellAndPositionData(50, 56, "conditional", "take-profit")).toEqual(
      { col: 0, row: 1, axis: 1, yPosition: 0 },
    );
  });

  it("picks the axis from which half of the cell the pointer is in", () => {
    mountCells([ENTRY_MIDDLE]);

    expect(findCellAndPositionData(50, 200)?.axis).toBe(1);
    expect(findCellAndPositionData(150, 200)?.axis).toBe(2);
  });

  it("flips the slider direction with the column, on the same pointer", () => {
    mountCells([ENTRY_MIDDLE, { ...ENTRY_MIDDLE, col: 1, left: 200 }]);

    // Entry (col 0) runs descending in the upside zone, exit (col 1) ascending,
    // so the identical pointer height reads as opposite percentages.
    const entry = findCellAndPositionData(50, 200, "conditional", "limit");
    const exit = findCellAndPositionData(250, 200, "conditional", "limit");

    expect(entry?.col).toBe(0);
    expect(exit?.col).toBe(1);
    expect(entry?.yPosition).toBeGreaterThan(0);
    expect(exit?.yPosition).toBeGreaterThan(0);
    expect(entry?.yPosition).not.toBeCloseTo(exit?.yPosition ?? 0, 3);
  });

  it("uses the order type rather than the row to pick direction in the bulk pattern", () => {
    mountCells([ENTRY_MIDDLE]);

    const takeProfit = findCellAndPositionData(50, 200, "bulk", "take-profit");
    const stopLoss = findCellAndPositionData(50, 200, "bulk", "stop-loss");

    expect(takeProfit?.yPosition).not.toBeCloseTo(stopLoss?.yPosition ?? 0, 3);
  });

  it("clamps a pointer near the cell edge into the 0-100 range", () => {
    mountCells([ENTRY_MIDDLE]);

    const top = findCellAndPositionData(50, 0);
    const bottom = findCellAndPositionData(50, 400);

    expect(top?.yPosition).toBeGreaterThanOrEqual(0);
    expect(top?.yPosition).toBeLessThanOrEqual(100);
    expect(bottom?.yPosition).toBeGreaterThanOrEqual(0);
    expect(bottom?.yPosition).toBeLessThanOrEqual(100);
  });

  it("returns null for a drop outside the grid", () => {
    mountCells([ENTRY_MIDDLE]);

    expect(findCellAndPositionData(500, 200)).toBeNull();
  });
});
