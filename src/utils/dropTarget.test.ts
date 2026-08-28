import { describe, it, expect } from "vitest";

import {
  blockBoxAt,
  resolveDropCell,
  type Box,
  type CellBox,
} from "./dropTarget";

// =============================================================================
// FIXTURES
// =============================================================================
//
// The measurements are Chrome's own, taken from the running app at 1440x900:
// two 271x195 cells per row, columns 24px apart and rows 15px apart. The
// gutters are the point - they are exactly where the pointer test used to
// swallow a drop that visibly overlapped a cell.

const CELL_WIDTH = 271;
const CELL_HEIGHT = 195;
const COLUMN_GAP = 24;
const ROW_GAP = 15;
const GRID_LEFT = 149;
const GRID_TOP = 183;

/** A 40px tile, the size `BLOCK_TILE_SIZE_PX` gives the dragged block. */
const TILE = 40;

const cellBox = (col: number, row: number): CellBox => {
  const left = GRID_LEFT + col * (CELL_WIDTH + COLUMN_GAP);
  const top = GRID_TOP + row * (CELL_HEIGHT + ROW_GAP);
  return {
    cell: { col, row },
    box: { left, top, right: left + CELL_WIDTH, bottom: top + CELL_HEIGHT },
  };
};

/** The whole 2x3 grid, in the order `querySelectorAll` returns it. */
const GRID: CellBox[] = [0, 1].flatMap((col) =>
  [0, 1, 2].map((row) => cellBox(col, row)),
);

const drop = (x: number, y: number, cells: CellBox[] = GRID) =>
  resolveDropCell(blockBoxAt({ x, y }, TILE), { x, y }, cells);

/** The x where the gap between the two columns begins and ends. */
const GUTTER_LEFT = GRID_LEFT + CELL_WIDTH;
const GUTTER_RIGHT = GUTTER_LEFT + COLUMN_GAP;
/** Dead centre of that gap: the block overlaps both columns equally. */
const GUTTER_MID = GUTTER_LEFT + COLUMN_GAP / 2;
/** A y inside every row-1 cell, well clear of the row gaps. */
const ROW_1_MID = GRID_TOP + CELL_HEIGHT + ROW_GAP + CELL_HEIGHT / 2;

// =============================================================================
// TESTS
// =============================================================================

describe("blockBoxAt", () => {
  it("centres the tile on the point, the way the drag ghost is drawn", () => {
    expect(blockBoxAt({ x: 100, y: 200 }, TILE)).toEqual({
      left: 80,
      top: 180,
      right: 120,
      bottom: 220,
    });
  });
});

describe("resolveDropCell, a block wholly inside one cell", () => {
  it("lands in that cell", () => {
    expect(drop(GRID_LEFT + CELL_WIDTH / 2, ROW_1_MID)).toEqual({
      col: 0,
      row: 1,
    });
  });
});

describe("resolveDropCell, a block whose edge overlaps a cell", () => {
  // THE DEFECT, at the level the geometry decides it. Every one of these
  // releases puts the pointer OUTSIDE every cell, in a gutter or just past an
  // edge, with the dragged tile plainly overlapping a cell. The rule that
  // tested the pointer answered "off the grid" to all of them.

  it("lands in the cell the pointer has just left", () => {
    // 5px past the right edge: 15 of the tile's 40px are still over the cell.
    const x = GUTTER_LEFT + 5;
    expect(x).toBeGreaterThan(GUTTER_LEFT); // the pointer is outside the cell
    expect(drop(x, ROW_1_MID)).toEqual({ col: 0, row: 1 });
  });

  it("lands in the cell the pointer has not reached yet", () => {
    const x = GUTTER_RIGHT - 5;
    expect(x).toBeLessThan(GUTTER_RIGHT); // still short of the next column
    expect(drop(x, ROW_1_MID)).toEqual({ col: 1, row: 1 });
  });

  it("lands in the cell above when the pointer is in the row gap", () => {
    const y = GRID_TOP + CELL_HEIGHT + 4;
    expect(drop(GRID_LEFT + CELL_WIDTH / 2, y)).toEqual({ col: 0, row: 0 });
  });

  it("still lands nowhere when the block reaches no cell at all", () => {
    // Half a tile clear of the grid's left edge: nothing overlaps.
    expect(drop(GRID_LEFT - TILE, ROW_1_MID)).toBeNull();
    expect(drop(2000, 2000)).toBeNull();
  });

  it("treats a block that only touches an edge as reaching nothing", () => {
    // The tile's right edge sits exactly on the cell's left edge. Zero area is
    // not an overlap, and calling it one would put a block in a cell it is
    // wholly outside of.
    expect(drop(GRID_LEFT - TILE / 2, ROW_1_MID)).toBeNull();
  });
});

describe("resolveDropCell, a block overlapping two or more cells", () => {
  it("gives the drop to the cell it covers most", () => {
    // 7px into the 24px gutter: 13px of tile left over column 0, 1px reaching
    // column 1. Column 0 wins on area, and the pointer is in neither.
    const x = GUTTER_LEFT + 7;
    expect(drop(x, ROW_1_MID)).toEqual({ col: 0, row: 1 });

    const mirrored = GUTTER_RIGHT - 7;
    expect(drop(mirrored, ROW_1_MID)).toEqual({ col: 1, row: 1 });
  });

  it("gives an exact tie to the cell holding the pointer", () => {
    // Two cells the tile covers by exactly 80 square pixels each - a thin
    // strip the pointer is standing on, and a tall cell further down that the
    // tile's bottom edge reaches by the same 2px. Areas cannot separate them.
    //
    // The strip is deliberately the HIGHER (column, row), so the last
    // tie-break would answer the tall cell. The pointer is what makes the
    // strip win, and that is what this asserts.
    const tied: CellBox[] = [
      {
        cell: { col: 0, row: 0 },
        box: { left: 0, top: 219, right: 100, bottom: 400 },
      },
      {
        cell: { col: 1, row: 1 },
        box: { left: 0, top: 200, right: 100, bottom: 202 },
      },
    ];
    const point = { x: 50, y: 201 };
    // The tile is [30..70] x [181..221]: 2px of it lies in each box.
    expect(resolveDropCell(blockBoxAt(point, TILE), point, tied)).toEqual({
      col: 1,
      row: 1,
    });
  });

  it("breaks a tie the pointer cannot separate by column then row", () => {
    // Dead centre of the column gutter: 8px of tile over each column, and the
    // pointer inside neither. Nothing is left but a fixed order, and the same
    // release must always answer the same cell.
    expect(drop(GUTTER_MID, ROW_1_MID)).toEqual({ col: 0, row: 1 });

    // ...whatever order the cells arrive in.
    expect(drop(GUTTER_MID, ROW_1_MID, [...GRID].reverse())).toEqual({
      col: 0,
      row: 1,
    });
  });

  it("does not let sub-pixel rounding decide instead of the pointer", () => {
    // Two cells the tile covers to within a fraction of a square pixel, with
    // the pointer squarely inside the second. A strict comparison would hand
    // the drop to the first on 0.4px of rounding; the pointer is the better
    // answer and the epsilon is what lets it be heard.
    const boxes: CellBox[] = [
      { cell: { col: 0, row: 0 }, box: { left: 0, top: 0, right: 100, bottom: 200.01 } },
      { cell: { col: 1, row: 0 }, box: { left: 0, top: 200, right: 100, bottom: 400 } },
    ];
    const point = { x: 50, y: 205 };
    expect(resolveDropCell(blockBoxAt(point, TILE), point, boxes)).toEqual({
      col: 1,
      row: 0,
    });
  });

});

describe("resolveDropCell, before the grid has rendered", () => {
  it("answers nothing rather than guessing a cell", () => {
    const point = { x: 100, y: 100 };
    expect(resolveDropCell(blockBoxAt(point, TILE), point, [])).toBeNull();
  });

  it("ignores a cell that measures empty", () => {
    // jsdom lays nothing out, and a cell not yet painted reports a zero rect.
    // Zero area is no overlap, so it is not a target.
    const empty: Box = { left: 0, top: 0, right: 0, bottom: 0 };
    const point = { x: 0, y: 0 };
    expect(
      resolveDropCell(blockBoxAt(point, TILE), point, [
        { cell: { col: 0, row: 0 }, box: empty },
      ]),
    ).toBeNull();
  });
});
