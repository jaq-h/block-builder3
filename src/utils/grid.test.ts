import { describe, it, expect } from "vitest";

import {
  clearGrid,
  countBlocks,
  createEmptyGrid,
  findBlockInGrid,
  getAlignment,
  getAllBlocks,
  getDiagonalCells,
  getOccupiedCells,
  hasAnyBlockBeenPlaced,
  hasConditionalWithoutPrimary,
  hasMiddleRowOrder,
  isCellDisabled,
  isCellValidForPlacement,
  isProviderBlockHighlighted,
  formatPrice,
  removeBlockFromGrid,
  reverseColumns,
} from "@utils/grid";
import { NO_PRECISION } from "@utils/marketFormat";
import type { BlockData, GridData } from "@/types/grid";
import type { MarketPrecision } from "@/types/markets";
import type { PriceFormatReadiness } from "@utils/priceFormatReadiness";
import { ARB_USD, BTC_USD, ETH_USD } from "@/test/marketFixtures";
import { findMarket } from "@data/markets";
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
// REMOVAL
// =============================================================================

describe("removeBlockFromGrid", () => {
  it("takes the named block out and leaves the rest of the cell standing", () => {
    const kept = block({ id: "kept" });
    const grid = gridWith([
      { col: 0, row: 1, block: block({ id: "doomed" }) },
      { col: 0, row: 1, block: kept },
      { col: 1, row: 0, block: block({ id: "elsewhere" }) },
    ]);

    const after = removeBlockFromGrid(grid, "doomed");

    expect(after[0][1]).toEqual([kept]);
    expect(countBlocks(after)).toBe(2);
  });

  // The whole reason the removal and the link clearing are one function. The
  // mapper REFUSES a grid whose `linkedBlockId` names a block that is not on it
  // (`assertLinksAreFlat` in `api/orderMapper.ts`), and that refusal is correct:
  // emitting the primary alone would send an entry order with its protective
  // close silently gone. So a removal that only filtered would hand the user a
  // strategy nothing in the app could submit and no control could mend.
  it("clears a link that named the block it removed", () => {
    const grid = gridWith([
      {
        col: 0,
        row: 1,
        block: block({ id: "primary", linkedBlockId: "conditional" }),
      },
      { col: 0, row: 0, block: block({ id: "conditional" }) },
    ]);

    const after = removeBlockFromGrid(grid, "conditional");

    expect(findBlockInGrid(after, "primary")!.block.linkedBlockId).toBeUndefined();
  });

  // Dropped rather than set to `undefined`: the key's absence is what "no
  // conditional close" means everywhere else, and an explicit `undefined` is a
  // second spelling of the same fact for a serialiser to disagree about.
  it("drops the link key rather than leaving it holding undefined", () => {
    const grid = gridWith([
      {
        col: 0,
        row: 1,
        block: block({ id: "primary", linkedBlockId: "conditional" }),
      },
      { col: 0, row: 0, block: block({ id: "conditional" }) },
    ]);

    const after = removeBlockFromGrid(grid, "conditional");

    expect(findBlockInGrid(after, "primary")!.block).not.toHaveProperty(
      "linkedBlockId",
    );
  });

  it("clears every link that named it, from any cell", () => {
    const grid = gridWith([
      { col: 0, row: 1, block: block({ id: "a", linkedBlockId: "target" }) },
      { col: 1, row: 1, block: block({ id: "b", linkedBlockId: "target" }) },
      { col: 0, row: 0, block: block({ id: "target" }) },
    ]);

    const after = removeBlockFromGrid(grid, "target");

    expect(findBlockInGrid(after, "a")!.block.linkedBlockId).toBeUndefined();
    expect(findBlockInGrid(after, "b")!.block.linkedBlockId).toBeUndefined();
  });

  it("leaves a link that named some other block exactly as it was", () => {
    const grid = gridWith([
      { col: 0, row: 1, block: block({ id: "a", linkedBlockId: "kept" }) },
      { col: 0, row: 0, block: block({ id: "kept" }) },
      { col: 1, row: 1, block: block({ id: "doomed" }) },
    ]);

    const after = removeBlockFromGrid(grid, "doomed");

    expect(findBlockInGrid(after, "a")!.block.linkedBlockId).toBe("kept");
  });

  it("does not mutate the grid it was given", () => {
    const grid = gridWith([
      { col: 0, row: 1, block: block({ id: "a", linkedBlockId: "doomed" }) },
      { col: 0, row: 0, block: block({ id: "doomed" }) },
    ]);

    removeBlockFromGrid(grid, "doomed");

    expect(countBlocks(grid)).toBe(2);
    expect(findBlockInGrid(grid, "a")!.block.linkedBlockId).toBe("doomed");
  });

  it("leaves a grid holding no such block alone", () => {
    const grid = gridWith([{ col: 0, row: 1 }]);

    expect(countBlocks(removeBlockFromGrid(grid, "never-placed"))).toBe(1);
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
// PRICE FORMATTING
// =============================================================================
//
// The cell display mode, the price formula and the scale direction moved to
// `blockMapping.test.ts` with the code: they are the block-to-price mapping,
// which has one owner now, and this file covers the grid's structure.

describe("formatPrice", () => {
  const ready = (
    symbol: string,
    precision: MarketPrecision,
  ): PriceFormatReadiness => ({
    status: "ready",
    market: findMarket(symbol)!,
    precision,
  });

  const pending = (symbol: string): PriceFormatReadiness => ({
    status: "pending",
    market: findMarket(symbol)!,
  });

  const unavailable = (symbol: string): PriceFormatReadiness => ({
    status: "unavailable",
    market: findMarket(symbol)!,
  });

  it("renders an em dash placeholder when there is no price", () => {
    // Escaped rather than pasted so the character is unambiguous in review.
    expect(formatPrice(null, ready("BTC/USD", BTC_USD))).toBe("\u2014");
  });

  it("renders a grouped amount at the pair's own precision", () => {
    expect(formatPrice(50_000, ready("BTC/USD", BTC_USD))).toBe("$50,000.0");
    expect(formatPrice(1234.5, ready("ETH/USD", ETH_USD))).toBe("$1,234.50");
    expect(formatPrice(0.1264, ready("ARB/USD", ARB_USD))).toBe("$0.1264");
  });

  // A caller with no precision used to get two decimals, which is BTC's habit
  // and not a neutral default - it draws an ARB price of 0.1264 as "$0.13".
  // Both unready states are asked: the readiness owner keeps them apart, and
  // what a chip draws in each is pinned rather than assumed.
  it("draws no number when the pair's precision has not loaded", () => {
    expect(formatPrice(50_000, pending("BTC/USD"))).toBe(NO_PRECISION);
    expect(formatPrice(50_000, unavailable("BTC/USD"))).toBe(NO_PRECISION);
  });
});

describe("getAlignment", () => {
  it("aligns the entry column right and the exit column left", () => {
    expect(getAlignment(0)).toBe("right");
    expect(getAlignment(1)).toBe("left");
  });
});

// =============================================================================
// POSITION MATHS - deliberately gone
// =============================================================================
//
// `calculateYPosition` and `findAxisAtPosition` were tested here and are now
// deleted along with `findCellAndPositionData`, the drop-time reader that was
// their only caller.
//
// **Both suites pinned the wrong behaviour.** `calculateYPosition` was asserted
// to read 100 at the top of an ascending track, on a 0-100 scale, while the
// slider and the axis labels have always run to `SCALE_CONFIG.MAX_PERCENT` of
// 50 - so the expectation certified the reading that made a 100% offset, and
// therefore a price of exactly zero, reachable from an ordinary drag.
// `findAxisAtPosition` pinned the drop rewriting a block's `axis` from the
// pointer's x-half without touching its `axes`, which is what let a live grid
// and a reloaded one disagree about which leg of a dual-axis order was the
// trigger. The single mapping between a position and a pixel is
// `getBlockTopPx` / `positionFromPointer` in `styles/grid.ts`, tested in
// `styles/grid.test.ts` and end to end in `GridArea.dom.test.tsx`; the clamp
// that bounds it is `clampOffset`, in `blockMapping.test.ts`.

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
