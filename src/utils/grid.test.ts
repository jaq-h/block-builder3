import { describe, it, expect } from "vitest";

import {
  calculatePrice,
  calculateYPosition,
  clearGrid,
  countBlocks,
  createEmptyGrid,
  findAxisAtPosition,
  findBlockInGrid,
  getAlignment,
  getAllBlocks,
  getCellDisplayMode,
  getDiagonalCells,
  getOccupiedCells,
  hasAnyBlockBeenPlaced,
  hasConditionalWithoutPrimary,
  hasMiddleRowOrder,
  isCellDisabled,
  isCellValidForPlacement,
  isProviderBlockHighlighted,
  formatPrice,
  reverseColumns,
  shouldBeDescending,
} from "@utils/grid";
import { priceAtOffset } from "@utils/price";
import type { BlockData, GridData } from "@/types/grid";
import { GRID_CONFIG } from "@data/orderTypes";

// =============================================================================
// FIXTURES
// =============================================================================

const block = (overrides: Partial<BlockData> = {}): BlockData => ({
  id: "sa-limit-1",
  orderType: "limit",
  label: "Limit",
  abrv: "Lmt",
  allowedRows: [0, 1, 2],
  axis: 2,
  yPosition: 25,
  direction: "upside",
  axes: ["limit"],
  ...overrides,
});

/** Empty 2x3 grid with the given blocks dropped at [col][row]. */
const gridWith = (
  placements: Array<{ col: number; row: number; block?: BlockData }>,
): GridData => {
  const grid = createEmptyGrid();
  placements.forEach((p, i) =>
    grid[p.col][p.row].push(p.block ?? block({ id: `sa-limit-${i}` })),
  );
  return grid;
};

/** Minimal stand-in for the parts of DOMRect the position helpers read. */
const rect = (top: number, bottom: number, left = 0, right = 200): DOMRect =>
  ({
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
  }) as DOMRect;

// =============================================================================
// GRID CREATION & INSPECTION
// =============================================================================

describe("clearGrid / createEmptyGrid", () => {
  it("builds a [column][row][block] structure of the requested size", () => {
    const grid = clearGrid(2, 3);

    expect(grid).toHaveLength(2);
    expect(grid[0]).toHaveLength(3);
    expect(grid.flat().every((cell) => cell.length === 0)).toBe(true);
  });

  it("defaults to the configured grid dimensions", () => {
    const grid = createEmptyGrid();

    expect(grid).toHaveLength(GRID_CONFIG.numColumns);
    expect(grid[0]).toHaveLength(GRID_CONFIG.numRows);
  });

  it("gives every cell its own array, so pushing into one does not affect others", () => {
    const grid = clearGrid(2, 3);
    grid[0][0].push(block());

    expect(countBlocks(grid)).toBe(1);
    expect(grid[0][1]).toHaveLength(0);
    expect(grid[1][0]).toHaveLength(0);
  });
});

describe("grid inspection", () => {
  it("reports whether anything has been placed", () => {
    expect(hasAnyBlockBeenPlaced(createEmptyGrid())).toBe(false);
    expect(hasAnyBlockBeenPlaced(gridWith([{ col: 1, row: 2 }]))).toBe(true);
  });

  it("lists occupied cells in column-then-row order", () => {
    const grid = gridWith([
      { col: 1, row: 0 },
      { col: 0, row: 2 },
    ]);

    expect(getOccupiedCells(grid)).toEqual([
      { col: 0, row: 2 },
      { col: 1, row: 0 },
    ]);
  });

  it("counts every block, including several stacked in one cell", () => {
    const grid = gridWith([
      { col: 0, row: 1 },
      { col: 0, row: 1 },
      { col: 1, row: 0 },
    ]);

    expect(countBlocks(grid)).toBe(3);
    expect(getOccupiedCells(grid)).toHaveLength(2);
    expect(getAllBlocks(grid)).toHaveLength(3);
  });

  it("finds a block by id and reports where it sits", () => {
    const target = block({ id: "sa-take-profit-9" });
    const grid = gridWith([{ col: 1, row: 0, block: target }]);

    expect(findBlockInGrid(grid, "sa-take-profit-9")).toEqual({
      col: 1,
      row: 0,
      block: target,
    });
  });

  it("returns null for an id that is not on the grid", () => {
    expect(findBlockInGrid(gridWith([{ col: 0, row: 1 }]), "nope")).toBeNull();
  });
});

describe("reverseColumns", () => {
  it("swaps the entry and exit columns", () => {
    const entry = block({ id: "entry" });
    const exit = block({ id: "exit" });
    const grid = gridWith([
      { col: 0, row: 1, block: entry },
      { col: 1, row: 0, block: exit },
    ]);

    const reversed = reverseColumns(grid);

    expect(reversed[0][0]).toEqual([exit]);
    expect(reversed[1][1]).toEqual([entry]);
  });

  it("does not mutate the grid it was given", () => {
    const grid = gridWith([{ col: 0, row: 1 }]);
    reverseColumns(grid);

    expect(grid[0][1]).toHaveLength(1);
    expect(grid[1][1]).toHaveLength(0);
  });

  it("copies the row arrays, so pushing into the result leaves the source alone", () => {
    const grid = gridWith([{ col: 0, row: 1 }]);
    const reversed = reverseColumns(grid);
    reversed[1][0].push(block({ id: "added" }));

    expect(countBlocks(grid)).toBe(1);
    expect(countBlocks(reversed)).toBe(2);
  });
});

// =============================================================================
// DIAGONAL PLACEMENT
// =============================================================================

describe("getDiagonalCells", () => {
  it("returns the four diagonal neighbours of an interior cell", () => {
    // The grid is only two columns wide, so col 0 and col 2 do not both exist;
    // from (1,1) only the col-0 diagonals are in bounds.
    expect([...getDiagonalCells([{ col: 1, row: 1 }], 2, 3)].sort()).toEqual([
      "0-0",
      "0-2",
    ]);
  });

  it("clips neighbours that fall outside the grid", () => {
    expect([...getDiagonalCells([{ col: 0, row: 0 }], 2, 3)]).toEqual(["1-1"]);
  });

  it("never offers a cell that is already occupied", () => {
    const occupied = [
      { col: 0, row: 1 },
      { col: 1, row: 0 },
    ];

    const diagonals = getDiagonalCells(occupied, 2, 3);

    expect(diagonals.has("1-0")).toBe(false);
    expect(diagonals.has("0-1")).toBe(false);
    expect(diagonals.has("1-2")).toBe(true);
  });

  it("returns nothing when no cell is occupied", () => {
    expect(getDiagonalCells([], 2, 3).size).toBe(0);
  });
});

// =============================================================================
// PLACEMENT RULES
// =============================================================================

describe("isCellValidForPlacement", () => {
  const allRows = [0, 1, 2];

  it("accepts any cell in the bulk pattern, ignoring the type's allowed rows", () => {
    expect(isCellValidForPlacement(0, 0, [1], createEmptyGrid(), "bulk")).toBe(
      true,
    );
    expect(isCellValidForPlacement(1, 2, [], createEmptyGrid(), "bulk")).toBe(
      true,
    );
  });

  it("honours the order type's allowed rows in the conditional pattern", () => {
    // A market order may only sit in the middle row.
    expect(isCellValidForPlacement(0, 0, [1], createEmptyGrid())).toBe(false);
    expect(isCellValidForPlacement(0, 1, [1], createEmptyGrid())).toBe(true);
  });

  it("forces the first conditional placement into the middle row", () => {
    const empty = createEmptyGrid();

    expect(isCellValidForPlacement(0, 1, allRows, empty)).toBe(true);
    expect(isCellValidForPlacement(0, 0, allRows, empty)).toBe(false);
    expect(isCellValidForPlacement(1, 2, allRows, empty)).toBe(false);
  });

  it("restricts later placements to cells diagonal from an occupied one", () => {
    const grid = gridWith([{ col: 0, row: 1 }]);

    expect(isCellValidForPlacement(1, 0, allRows, grid)).toBe(true);
    expect(isCellValidForPlacement(1, 2, allRows, grid)).toBe(true);
    expect(isCellValidForPlacement(1, 1, allRows, grid)).toBe(false);
    expect(isCellValidForPlacement(0, 0, allRows, grid)).toBe(false);
  });

  it("defaults to the conditional pattern when none is given", () => {
    expect(isCellValidForPlacement(0, 0, allRows, createEmptyGrid())).toBe(
      isCellValidForPlacement(0, 0, allRows, createEmptyGrid(), "conditional"),
    );
  });
});

describe("isCellDisabled", () => {
  it("disables nothing in the bulk pattern", () => {
    const grid = gridWith([{ col: 0, row: 1 }]);

    expect(isCellDisabled(1, 1, grid, "bulk")).toBe(false);
    expect(isCellDisabled(0, 0, createEmptyGrid(), "bulk")).toBe(false);
  });

  it("disables every non-middle row before the first placement", () => {
    const empty = createEmptyGrid();

    expect(isCellDisabled(0, 1, empty)).toBe(false);
    expect(isCellDisabled(0, 0, empty)).toBe(true);
    expect(isCellDisabled(1, 2, empty)).toBe(true);
  });

  it("leaves occupied cells enabled even once they stop being diagonal targets", () => {
    const grid = gridWith([{ col: 0, row: 1 }]);

    expect(isCellDisabled(0, 1, grid)).toBe(false);
    expect(isCellDisabled(1, 0, grid)).toBe(false);
    expect(isCellDisabled(1, 1, grid)).toBe(true);
  });
});

describe("primary order guards", () => {
  it("detects a primary order anywhere in the middle row", () => {
    expect(hasMiddleRowOrder(createEmptyGrid())).toBe(false);
    expect(hasMiddleRowOrder(gridWith([{ col: 1, row: 1 }]))).toBe(true);
    expect(hasMiddleRowOrder(gridWith([{ col: 1, row: 0 }]))).toBe(false);
  });

  it("flags conditionals that have been left without a primary", () => {
    expect(hasConditionalWithoutPrimary(createEmptyGrid())).toBe(false);
    expect(hasConditionalWithoutPrimary(gridWith([{ col: 0, row: 0 }]))).toBe(
      true,
    );
    expect(hasConditionalWithoutPrimary(gridWith([{ col: 1, row: 2 }]))).toBe(
      true,
    );
    expect(
      hasConditionalWithoutPrimary(
        gridWith([
          { col: 0, row: 1 },
          { col: 1, row: 0 },
        ]),
      ),
    ).toBe(false);
  });
});

// =============================================================================
// CELL DISPLAY MODE
// =============================================================================

describe("getCellDisplayMode", () => {
  it("reports an empty cell", () => {
    expect(getCellDisplayMode([])).toBe("empty");
  });

  it("reports a market block, which has no axes at all", () => {
    expect(getCellDisplayMode([block({ axes: [] })])).toBe("no-axis");
  });

  it("lets a single axis-less block win over its axis-bearing neighbours", () => {
    expect(
      getCellDisplayMode([block({ axes: ["limit"] }), block({ axes: [] })]),
    ).toBe("no-axis");
  });

  it("reports a limit-only cell", () => {
    expect(getCellDisplayMode([block({ axes: ["limit"] })])).toBe("limit-only");
  });

  it("reports a cell holding both a trigger and a limit block", () => {
    expect(
      getCellDisplayMode([
        block({ axes: ["trigger"] }),
        block({ axes: ["limit"] }),
      ]),
    ).toBe("dual-axis");
  });

  // Trigger-only falls through to the same "dual-axis" return as the genuine
  // dual case; there is no distinct trigger-only mode.
  it("treats a trigger-only cell as dual-axis", () => {
    expect(getCellDisplayMode([block({ axes: ["trigger"] })])).toBe("dual-axis");
  });
});

// =============================================================================
// PRICE HELPERS
// =============================================================================

describe("calculatePrice", () => {
  it("returns null while the market price is still unknown", () => {
    expect(calculatePrice(null, 10, false)).toBeNull();
  });

  it("adds the percentage when ascending and subtracts it when descending", () => {
    expect(calculatePrice(50_000, 10, false)).toBeCloseTo(55_000, 6);
    expect(calculatePrice(50_000, 10, true)).toBeCloseTo(45_000, 6);
  });

  it("returns the market price for a zero offset", () => {
    expect(calculatePrice(50_000, 0, true)).toBe(50_000);
  });

  // The percentage is taken at face value, with no damping. The order mapper
  // used to apply a 0.1 scale factor of its own and send +2.5% for a block the
  // grid drew at +25%; it now builds on `priceAtOffset`, the same formula this
  // helper delegates to, so the two cannot diverge again.
  it("takes the percentage at face value", () => {
    expect(calculatePrice(50_000, 25, false)).toBeCloseTo(62_500, 6);
    expect(calculatePrice(50_000, 25, false)).toBe(
      priceAtOffset(50_000, 25, false),
    );
  });
});

describe("formatPrice", () => {
  it("renders an em dash placeholder when there is no price", () => {
    // Escaped rather than pasted so the character is unambiguous in review.
    expect(formatPrice(null)).toBe("\u2014");
  });

  it("renders a grouped two-decimal dollar amount", () => {
    expect(formatPrice(50_000)).toBe("$50,000.00");
    expect(formatPrice(1234.5)).toBe("$1,234.50");
    expect(formatPrice(0.126)).toBe("$0.13");
  });
});

// =============================================================================
// SCALE DIRECTION
// =============================================================================

describe("shouldBeDescending", () => {
  it("descends on the entry column in the upside zone", () => {
    expect(shouldBeDescending(0, 0, "conditional")).toBe(true);
    expect(shouldBeDescending(0, 1, "conditional")).toBe(false);
    expect(shouldBeDescending(1, 0, "conditional")).toBe(true);
    expect(shouldBeDescending(1, 1, "conditional")).toBe(false);
  });

  it("flips to the exit column on the conditional bottom row", () => {
    expect(shouldBeDescending(2, 0, "conditional")).toBe(false);
    expect(shouldBeDescending(2, 1, "conditional")).toBe(true);
  });

  it("keys off the order type rather than the row in the bulk pattern", () => {
    // Stop-style types are the downside zone wherever they are dropped.
    expect(shouldBeDescending(0, 1, "bulk", "stop-loss")).toBe(true);
    expect(shouldBeDescending(0, 1, "bulk", "stop-loss-limit")).toBe(true);
    expect(shouldBeDescending(0, 1, "bulk", "trailing-stop")).toBe(true);
    expect(shouldBeDescending(0, 1, "bulk", "trailing-stop-limit")).toBe(true);

    // Everything else stays in the upside zone.
    expect(shouldBeDescending(2, 1, "bulk", "take-profit")).toBe(false);
    expect(shouldBeDescending(2, 0, "bulk", "limit")).toBe(true);
  });

  it("treats every row as upside when no pattern is supplied", () => {
    expect(shouldBeDescending(2, 0)).toBe(true);
    expect(shouldBeDescending(2, 1)).toBe(false);
  });

  it("treats a bulk block with no order type as upside", () => {
    expect(shouldBeDescending(2, 1, "bulk")).toBe(false);
  });
});

describe("getAlignment", () => {
  it("aligns the entry column right and the exit column left", () => {
    expect(getAlignment(0)).toBe("right");
    expect(getAlignment(1)).toBe("left");
  });
});

// =============================================================================
// POSITION MATHS
// =============================================================================

describe("calculateYPosition", () => {
  // Track geometry, from the layout constants in grid.ts: a 36px cell header,
  // a 40px block (half of which is reserved at each end so the block stays
  // inside the cell), and 30px of market padding + gap that sits at the bottom
  // of an ascending track and at the top of a descending one.
  //
  // Ascending  on a cell spanning 0..400: track runs 56 -> 350.
  // Descending on the same cell:          track runs 86 -> 380.
  const cell = rect(0, 400);

  it("reads 100% at the top of an ascending track and 0% at the bottom", () => {
    expect(calculateYPosition(56, cell)).toBe(100);
    expect(calculateYPosition(350, cell)).toBe(0);
  });

  it("inverts the scale for a descending track", () => {
    expect(calculateYPosition(86, cell, true)).toBe(0);
    expect(calculateYPosition(380, cell, true)).toBe(100);
  });

  it("reads exactly halfway at the middle of the track", () => {
    expect(calculateYPosition((56 + 350) / 2, cell)).toBeCloseTo(50, 6);
    expect(calculateYPosition((86 + 380) / 2, cell, true)).toBeCloseTo(50, 6);
  });

  it("clamps a pointer dragged past either end of the track", () => {
    expect(calculateYPosition(-500, cell)).toBe(100);
    expect(calculateYPosition(5_000, cell)).toBe(0);
    expect(calculateYPosition(-500, cell, true)).toBe(0);
    expect(calculateYPosition(5_000, cell, true)).toBe(100);
  });

  it("is offset-aware: the same pointer reads differently on a scrolled cell", () => {
    // Cell moved 100px down the page - the same viewport Y is now the top of
    // the track rather than 100px into it.
    expect(calculateYPosition(156, rect(100, 500))).toBe(100);
    expect(calculateYPosition(156, cell)).not.toBe(100);
  });
});

describe("findAxisAtPosition", () => {
  const cell = rect(0, 400, 100, 300);

  it("puts the left half of the cell on axis 1 and the right half on axis 2", () => {
    expect(findAxisAtPosition(120, cell)).toBe(1);
    expect(findAxisAtPosition(280, cell)).toBe(2);
  });

  it("assigns the exact midpoint to axis 2", () => {
    expect(findAxisAtPosition(200, cell)).toBe(2);
  });
});

// =============================================================================
// PROVIDER COLUMN HIGHLIGHTING
// =============================================================================

describe("isProviderBlockHighlighted", () => {
  const provider = { type: "limit", abrv: "Lmt", label: "Limit", allowedRows: [0, 1], axes: ["limit"] as const };

  it("highlights a provider block whose type could be dropped in the hovered cell", () => {
    expect(
      isProviderBlockHighlighted(
        { ...provider, axes: ["limit"] },
        { col: 0, row: 1 },
        false,
        createEmptyGrid(),
      ),
    ).toBe(true);
  });

  it("stays dark when the hovered cell would reject the block", () => {
    expect(
      isProviderBlockHighlighted(
        { ...provider, axes: ["limit"] },
        { col: 0, row: 0 },
        false,
        createEmptyGrid(),
      ),
    ).toBe(false);
  });

  it("stays dark while a drag is in progress or nothing is hovered", () => {
    expect(
      isProviderBlockHighlighted(
        { ...provider, axes: ["limit"] },
        { col: 0, row: 1 },
        true,
        createEmptyGrid(),
      ),
    ).toBe(false);

    expect(
      isProviderBlockHighlighted(
        { ...provider, axes: ["limit"] },
        null,
        false,
        createEmptyGrid(),
      ),
    ).toBe(false);
  });
});
