import { describe, it, expect } from "vitest";

import {
  MAX_OFFSET_PERCENT,
  addBlocksToCell,
  cellDirection,
  cellDrawsPriceAxis,
  clampOffset,
  directionForNewCell,
  getCellDisplayMode,
  isDescending,
  legInCell,
  legOfBlock,
  normaliseCellDirections,
  orderConfigFromGrid,
  reverseGrid,
  priceForOffset,
  signedOffset,
  stampCellDirection,
} from "@utils/blockMapping";
import { priceAtOffset } from "@utils/price";
import { clearGrid } from "@utils/grid";
import type { BlockData, GridData } from "@/types/grid";

// =============================================================================
// THE BLOCK-TO-PRICE MAPPING OWNER
// =============================================================================
//
// Four facts - axis membership, position, direction and a cell's scale - that
// used to be derived independently by the price chip, the chart, the payload
// and the drag layer. The tests here cover the owner itself; the ones that
// matter most are lower down, where two *previously disagreeing* consumers are
// asked the same question and have to give the same answer.

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

const marketOrder = (overrides: Partial<BlockData> = {}): BlockData =>
  block({
    id: "sa-market-1",
    orderType: "market",
    label: "Market",
    abrv: "Mkt",
    axis: 1,
    yPosition: -1,
    axes: [],
    ...overrides,
  });

const stopLoss = (overrides: Partial<BlockData> = {}): BlockData =>
  block({
    id: "sa-stop-loss-1",
    orderType: "stop-loss",
    label: "Stop Loss",
    abrv: "SL",
    axis: 1,
    axes: ["trigger"],
    ...overrides,
  });

// =============================================================================
// 1. AXIS MEMBERSHIP
// =============================================================================

describe("legOfBlock", () => {
  it("names the leg a block carries", () => {
    expect(legOfBlock(block({ axes: ["limit"] }))).toBe("limit");
    expect(legOfBlock(block({ axes: ["trigger"] }))).toBe("trigger");
  });

  it("says a block with no axes carries no price", () => {
    expect(legOfBlock(marketOrder())).toBeNull();
  });
});

describe("cellDrawsPriceAxis", () => {
  it("draws an axis when every block in the cell has one", () => {
    expect(
      cellDrawsPriceAxis([block({ axes: ["trigger"] }), block()]),
    ).toBe(true);
  });

  // The rule the renderer has always followed: one axis-less block flattens the
  // whole cell, because there is no ruler for the others to be drawn against.
  it("draws none when any block in the cell has none", () => {
    expect(cellDrawsPriceAxis([block(), marketOrder()])).toBe(false);
  });

  it("draws none for an empty cell", () => {
    expect(cellDrawsPriceAxis([])).toBe(false);
  });
});

describe("legInCell", () => {
  // Split 3: `Block` used to answer this again from its own props, so a limit
  // leg sharing a cell with a Market order was drawn flat by the cell and
  // treated as a slider by the block - which is what let a mouse split a paired
  // order and flip one leg's side.
  it("gives a block no leg in a cell that draws no axis, whatever it carries", () => {
    const limit = block();
    expect(legInCell([limit, marketOrder()], limit)).toBeNull();
  });

  it("gives it its own leg in a cell that does draw one", () => {
    const limit = block();
    expect(legInCell([limit], limit)).toBe("limit");
  });
});

describe("getCellDisplayMode", () => {
  it("reports an empty cell", () => {
    expect(getCellDisplayMode([])).toBe("empty");
  });

  it("reports a market block, which has no axes at all", () => {
    expect(getCellDisplayMode([marketOrder()])).toBe("no-axis");
  });

  it("lets a single axis-less block win over its axis-bearing neighbours", () => {
    expect(getCellDisplayMode([block(), marketOrder()])).toBe("no-axis");
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

  it("agrees with cellDrawsPriceAxis about every cell", () => {
    const cells = [
      [],
      [marketOrder()],
      [block()],
      [block({ axes: ["trigger"] }), block({ axes: ["limit"] })],
      [block(), marketOrder()],
    ];
    cells.forEach((cell) => {
      const drawsOne = !["empty", "no-axis"].includes(getCellDisplayMode(cell));
      expect(drawsOne).toBe(cellDrawsPriceAxis(cell));
    });
  });
});

// =============================================================================
// 2. POSITION
// =============================================================================

describe("clampOffset", () => {
  it("leaves a position the axis can draw alone", () => {
    expect(clampOffset(25)).toBe(25);
    expect(clampOffset(0)).toBe(0);
    expect(clampOffset(MAX_OFFSET_PERCENT)).toBe(MAX_OFFSET_PERCENT);
  });

  // The defect this exists for: the drop handler wrote a 0-100 reading into a
  // block whose axis runs to 50, so a block dragged to the bottom of its cell
  // was a 100% offset - a price of exactly zero on a downside scale.
  it("refuses a 100% offset, which is a price of zero", () => {
    expect(clampOffset(100)).toBe(MAX_OFFSET_PERCENT);
    expect(priceForOffset(50_000, 100, "downside")).toBe(25_000);
    expect(priceForOffset(50_000, 100, "downside")).toBeGreaterThan(0);
  });

  it("refuses a negative position and a non-finite one", () => {
    expect(clampOffset(-1)).toBe(0);
    expect(clampOffset(Number.NaN)).toBe(0);
    expect(clampOffset(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("leaves no offset at all that prices a block at zero", () => {
    for (const offset of [-50, 0, 12.5, 49.9, 50, 75, 100, 1000]) {
      expect(priceForOffset(50_000, offset, "downside")).toBeGreaterThan(0);
      expect(priceForOffset(50_000, offset, "upside")).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// 3. DIRECTION
// =============================================================================

describe("directionForNewCell", () => {
  it("descends on the entry column in the upside zone", () => {
    expect(directionForNewCell(0, 0, "conditional")).toBe("downside");
    expect(directionForNewCell(0, 1, "conditional")).toBe("upside");
    expect(directionForNewCell(1, 0, "conditional")).toBe("downside");
    expect(directionForNewCell(1, 1, "conditional")).toBe("upside");
  });

  it("flips to the exit column on the conditional bottom row", () => {
    expect(directionForNewCell(2, 0, "conditional")).toBe("upside");
    expect(directionForNewCell(2, 1, "conditional")).toBe("downside");
  });

  it("keys off the order type rather than the row in the bulk pattern", () => {
    expect(directionForNewCell(0, 1, "bulk", "stop-loss")).toBe("downside");
    expect(directionForNewCell(0, 1, "bulk", "stop-loss-limit")).toBe("downside");
    expect(directionForNewCell(0, 1, "bulk", "trailing-stop")).toBe("downside");
    expect(directionForNewCell(0, 1, "bulk", "trailing-stop-limit")).toBe(
      "downside",
    );

    expect(directionForNewCell(2, 1, "bulk", "take-profit")).toBe("upside");
    expect(directionForNewCell(2, 0, "bulk", "limit")).toBe("downside");
  });

  it("treats every row as upside when no pattern is supplied", () => {
    expect(directionForNewCell(2, 0)).toBe("downside");
    expect(directionForNewCell(2, 1)).toBe("upside");
  });

  it("treats a bulk block with no order type as upside", () => {
    expect(directionForNewCell(2, 1, "bulk")).toBe("upside");
  });
});

describe("isDescending", () => {
  it("is the boolean form the layout helpers take", () => {
    expect(isDescending("downside")).toBe(true);
    expect(isDescending("upside")).toBe(false);
  });
});

// =============================================================================
// 4. CELL SCALE - the invariant every other consumer rests on
// =============================================================================

describe("addBlocksToCell", () => {
  it("stamps an empty cell with the scale its first arrival implies", () => {
    const grid = addBlocksToCell(
      clearGrid(2, 3),
      { col: 0, row: 1 },
      [block({ direction: "upside" })],
      "conditional",
    );
    expect(cellDirection(grid[0][1])).toBe("downside");
    expect(grid[0][1][0].direction).toBe("downside");
  });

  // Decision D8. `directionForNewCell` would give a Stop Loss "upside" in this
  // cell and a Limit "downside", which is precisely the disagreement the rule
  // exists to settle: the cell was stamped when the Limit landed, so the Stop
  // Loss is priced the way the cell is drawn.
  it("gives a later arrival the scale the cell already draws", () => {
    let grid = addBlocksToCell(
      clearGrid(2, 3),
      { col: 0, row: 1 },
      [block()],
      "bulk",
    );
    grid = addBlocksToCell(grid, { col: 0, row: 1 }, [stopLoss()], "bulk");

    expect(grid[0][1].map((b) => b.direction)).toEqual([
      "downside",
      "downside",
    ]);
  });

  it("leaves every other cell alone", () => {
    const grid = addBlocksToCell(
      clearGrid(2, 3),
      { col: 1, row: 2 },
      [block()],
      "conditional",
    );
    expect(grid[0][1]).toEqual([]);
    expect(grid[1][2]).toHaveLength(1);
  });
});

describe("cellDirection", () => {
  it("answers upside for an empty cell, which draws no scale", () => {
    expect(cellDirection([])).toBe("upside");
  });

  // Split 4, and the reason `blocks[0]` is safe here where it was the defect
  // before: every block in the cell carries the cell's direction, so removing
  // any one of them leaves the answer unchanged.
  it("does not change when a block is removed from the cell", () => {
    let grid = addBlocksToCell(
      clearGrid(2, 3),
      { col: 0, row: 1 },
      [block()],
      "bulk",
    );
    grid = addBlocksToCell(grid, { col: 0, row: 1 }, [stopLoss()], "bulk");

    const before = cellDirection(grid[0][1]);
    const survivors = grid[0][1].filter((b) => b.id !== "sa-limit-1");

    expect(survivors).toHaveLength(1);
    expect(cellDirection(survivors)).toBe(before);
  });
});

describe("stampCellDirection", () => {
  it("returns the very same block when it already carries the direction", () => {
    const limit = block({ direction: "downside" });
    expect(stampCellDirection([limit], "downside")[0]).toBe(limit);
  });

  it("rewrites the ones that disagree", () => {
    const stamped = stampCellDirection(
      [block({ direction: "upside" }), stopLoss({ direction: "downside" })],
      "downside",
    );
    expect(stamped.map((b) => b.direction)).toEqual(["downside", "downside"]);
  });
});

describe("normaliseCellDirections", () => {
  it("puts a grid built entry by entry onto the cell-owned scale", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(block({ direction: "downside" }));
    grid[0][1].push(stopLoss({ direction: "upside" }));

    const normalised = normaliseCellDirections(grid);
    expect(normalised[0][1].map((b) => b.direction)).toEqual([
      "downside",
      "downside",
    ]);
  });

  // This used to assert the opposite - that a position of 100 came back as
  // MAX_OFFSET_PERCENT - and that write was how a corrupt position reached the
  // order path already sanitised. `clampOffset` answers a non-finite value with
  // zero, which is the market price, so a hydrated grid produced a plausible
  // at-market order and `validateOrder` had nothing left to refuse. The store
  // keeps what it was given; consumers clamp what they read.
  it("leaves the stored position alone, out of range or not", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(block({ yPosition: 100 }));
    grid[1][1].push(block({ id: "sa-limit-2", yPosition: Number.NaN }));

    const normalised = normaliseCellDirections(grid);
    expect(normalised[0][1][0].yPosition).toBe(100);
    expect(normalised[1][1][0].yPosition).toBeNaN();
    expect(normalised[0][1][0].yPosition).not.toBe(MAX_OFFSET_PERCENT);
  });

  // A market order has no position at all: -1 is how the data says "nowhere on
  // an axis", and rounding it up to 0 would claim it sits at the market price.
  it("leaves an axis-less block's sentinel position alone", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(marketOrder());

    expect(normaliseCellDirections(grid)[0][1][0].yPosition).toBe(-1);
  });
});

describe("reverseGrid", () => {
  it("swaps the entry and exit columns and flips the scale each cell draws", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(block({ direction: "downside" }));
    grid[1][0].push(stopLoss({ direction: "upside" }));

    const reversed = reverseGrid(grid);

    expect(reversed[1][1].map((b) => b.id)).toEqual(["sa-limit-1"]);
    expect(cellDirection(reversed[1][1])).toBe("upside");
    expect(reversed[0][0].map((b) => b.id)).toEqual(["sa-stop-loss-1"]);
    expect(cellDirection(reversed[0][0])).toBe("downside");
  });

  // The flip goes through `stampCellDirection` rather than being applied block
  // by block, so a cell that arrived disagreeing with itself comes out of a
  // reverse on the one-scale-per-cell invariant instead of carrying the
  // disagreement into the mirrored column.
  it("brings an unstamped cell onto one scale rather than flipping each block", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(block({ direction: "downside" }));
    grid[0][1].push(stopLoss({ direction: "upside" }));

    const reversed = reverseGrid(grid);

    expect(reversed[1][1].map((b) => b.direction)).toEqual([
      "upside",
      "upside",
    ]);
  });

  it("leaves the stored position alone, out of range or not", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(block({ yPosition: Number.NaN }));

    expect(reverseGrid(grid)[1][1][0].yPosition).toBeNaN();
  });
});

// =============================================================================
// THE DERIVED PRICE
// =============================================================================

describe("priceForOffset", () => {
  it("returns null while the market price is still unknown", () => {
    expect(priceForOffset(null, 10, "upside")).toBeNull();
  });

  it("adds the percentage upside and subtracts it downside", () => {
    expect(priceForOffset(50_000, 10, "upside")).toBeCloseTo(55_000, 6);
    expect(priceForOffset(50_000, 10, "downside")).toBeCloseTo(45_000, 6);
  });

  it("returns the market price for a zero offset", () => {
    expect(priceForOffset(50_000, 0, "downside")).toBe(50_000);
  });

  // The percentage is taken at face value, with no damping. The order mapper
  // used to apply a 0.1 scale factor of its own and send +2.5% for a block the
  // grid drew at +25%; it now builds on `priceAtOffset`, the same formula this
  // helper delegates to, so the two cannot diverge again (decision D3).
  it("takes the percentage at face value", () => {
    expect(priceForOffset(50_000, 25, "upside")).toBeCloseTo(62_500, 6);
    expect(priceForOffset(50_000, 25, "upside")).toBe(
      priceAtOffset(50_000, 25, false),
    );
  });
});

describe("signedOffset", () => {
  it("signs the offset the way the block moves on screen", () => {
    expect(signedOffset(25, "upside")).toBe(25);
    expect(signedOffset(25, "downside")).toBe(-25);
  });

  it("clamps before signing, so no value out of range is ever announced", () => {
    expect(signedOffset(100, "downside")).toBe(-MAX_OFFSET_PERCENT);
  });
});

// =============================================================================
// THE GRID AS A SAVED CONFIG
// =============================================================================

describe("orderConfigFromGrid", () => {
  it("gives every entry in a cell that cell's direction", () => {
    let grid: GridData = addBlocksToCell(
      clearGrid(2, 3),
      { col: 0, row: 1 },
      [block()],
      "bulk",
    );
    grid = addBlocksToCell(grid, { col: 0, row: 1 }, [stopLoss()], "bulk");

    const config = orderConfigFromGrid(grid);
    expect(config["sa-limit-1"].direction).toBe("downside");
    expect(config["sa-stop-loss-1"].direction).toBe("downside");
  });

  // An order with no axis has no price, so it carries no position and no
  // direction - the same shape `buildOrderConfigEntry` produced for it.
  it("saves an axis-less order without a position", () => {
    const grid = addBlocksToCell(
      clearGrid(2, 3),
      { col: 0, row: 1 },
      [marketOrder()],
      "conditional",
    );

    expect(orderConfigFromGrid(grid)["sa-market-1"]).toEqual({
      col: 0,
      row: 1,
      type: "market",
    });
  });

  it("clamps a saved position to something the axis can draw", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(block({ yPosition: 100 }));

    expect(orderConfigFromGrid(grid)["sa-limit-1"].yPosition).toBe(
      MAX_OFFSET_PERCENT,
    );
  });

  // The one value the range clamp must not absorb. A saved config is turned
  // back into a grid on reload and that grid builds a payload, so answering a
  // non-finite position with zero here would record a plausible at-market order
  // that `validateOrder` accepts.
  it("records a non-finite position as it stands, so the validator sees it", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(block({ yPosition: Number.NaN }));

    expect(orderConfigFromGrid(grid)["sa-limit-1"].yPosition).toBeNaN();
  });
});
