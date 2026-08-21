import { describe, it, expect } from "vitest";

import {
  blockDataToUIBlock,
  calculatePriceFromPosition,
  createOrderPreview,
  extractBlocksFromGrid,
  extractOrderTypeFromId,
  findLinkedBlocks,
  formatPriceForAPI,
  mapBlockToOrderParams,
  mapGridToOrders,
  validateOrder,
} from "@api/orderMapper";
import type { OrderBuildContext, UIBlockData } from "@api/types";
import type { BlockData, GridData } from "@/types/grid";
import { ORDER_TYPES } from "@data/orderTypes";
import { createBlocksFromOrderType } from "@utils/blockFactory";

// =============================================================================
// FIXTURES
// =============================================================================

const MARKET_PRICE = 50_000;

const context = (
  overrides: Partial<OrderBuildContext> = {},
): OrderBuildContext => ({
  symbol: "BTC/USD",
  currentPrice: MARKET_PRICE,
  side: "buy",
  quantity: "0.5",
  ...overrides,
});

const uiBlock = (overrides: Partial<UIBlockData> = {}): UIBlockData => ({
  id: "sa-limit-1",
  orderType: "limit",
  abrv: "Lmt",
  position: { col: 0, row: 1, yPosition: 25, axis: 2 },
  axes: ["limit"],
  ...overrides,
});

const blockData = (overrides: Partial<BlockData> = {}): BlockData => ({
  id: "sa-limit-1",
  orderType: "limit",
  label: "Limit",
  abrv: "Lmt",
  allowedRows: [0, 1],
  axis: 2,
  yPosition: 25,
  direction: "upside",
  axes: ["limit"],
  ...overrides,
});

/** Build a 2x3 grid and drop the given blocks at [col][row]. */
const gridWith = (
  placements: Array<{ col: number; row: number; block: BlockData }>,
): GridData => {
  const grid: GridData = [
    [[], [], []],
    [[], [], []],
  ];
  placements.forEach(({ col, row, block }) => grid[col][row].push(block));
  return grid;
};

// =============================================================================
// PRICE MATHS
// =============================================================================

describe("calculatePriceFromPosition", () => {
  // The UI position is deliberately damped: scaleFactor 0.1 means a slider at
  // 25% is a 2.5% move away from market, not 25%.
  it("damps the UI percentage by 10x", () => {
    // Float maths leaves a sub-cent residue (51249.99999999999), which
    // formatPriceForAPI rounds away before the value ever reaches Kraken.
    expect(calculatePriceFromPosition(25, 50_000, 0, 1)).toBeCloseTo(51_250, 6);
  });

  it("puts the top row above market regardless of column", () => {
    expect(calculatePriceFromPosition(10, 50_000, 0, 0)).toBe(50_500);
    expect(calculatePriceFromPosition(10, 50_000, 0, 1)).toBe(50_500);
  });

  it("puts the bottom row below market regardless of column", () => {
    expect(calculatePriceFromPosition(10, 50_000, 2, 0)).toBe(49_500);
    expect(calculatePriceFromPosition(10, 50_000, 2, 1)).toBe(49_500);
  });

  it("splits the middle row by column: entry below market, exit above", () => {
    expect(calculatePriceFromPosition(10, 50_000, 1, 0)).toBe(49_500);
    expect(calculatePriceFromPosition(10, 50_000, 1, 1)).toBe(50_500);
  });

  it("returns the market price when the slider sits at zero", () => {
    expect(calculatePriceFromPosition(0, 50_000, 0, 0)).toBe(50_000);
    expect(calculatePriceFromPosition(0, 50_000, 2, 1)).toBe(50_000);
  });
});

describe("formatPriceForAPI", () => {
  it("uses one decimal for BTC pairs, under either ticker spelling", () => {
    expect(formatPriceForAPI(50_123.456, "BTC/USD")).toBe("50123.5");
    expect(formatPriceForAPI(50_123.456, "XBT/USD")).toBe("50123.5");
  });

  it("defaults to BTC precision when no symbol is supplied", () => {
    // The default parameter is DEFAULT_SYMBOL ("BTC/USD"), so an unqualified
    // call formats to one decimal even for a non-BTC price.
    expect(formatPriceForAPI(2_345.678)).toBe("2345.7");
  });

  it("scales precision by magnitude for non-BTC pairs", () => {
    expect(formatPriceForAPI(2_345.6789, "ETH/USD")).toBe("2345.68");
    expect(formatPriceForAPI(12.3456789, "ETH/USD")).toBe("12.3457");
    expect(formatPriceForAPI(0.123456789, "DOGE/USD")).toBe("0.123457");
  });

  it("always returns a string, never a number", () => {
    expect(typeof formatPriceForAPI(50_000, "BTC/USD")).toBe("string");
  });
});

// =============================================================================
// ORDER TYPE RECOVERY FROM BLOCK IDS
// =============================================================================

describe("extractOrderTypeFromId", () => {
  it("recovers single-word and hyphenated types", () => {
    expect(extractOrderTypeFromId("sa-market-1")).toBe("market");
    expect(extractOrderTypeFromId("sa-iceberg-3")).toBe("iceberg");
    expect(extractOrderTypeFromId("sa-stop-loss-1")).toBe("stop-loss");
    expect(extractOrderTypeFromId("sa-take-profit-2")).toBe("take-profit");
    expect(extractOrderTypeFromId("sa-trailing-stop-7")).toBe("trailing-stop");
  });

  it("falls back to limit for an unrecognisable id", () => {
    expect(extractOrderTypeFromId("nonsense")).toBe("limit");
    expect(extractOrderTypeFromId("")).toBe("limit");
  });

  // CHARACTERISATION OF A KNOWN BUG - do not "fix" this expectation.
  //
  // The lookup scans a list whose first entry is "limit" and tests
  // `id.includes("-limit-")`. Every "-limit" variant therefore matches "limit"
  // before its own, more specific entry is ever reached, so a protective
  // stop-loss-limit is reported as a plain limit order. See the note on
  // `blockDataToUIBlock` below for why this is reachable in production.
  it("mis-identifies every -limit variant as a plain limit (known bug)", () => {
    expect(extractOrderTypeFromId("sa-stop-loss-limit-1")).toBe("limit");
    expect(extractOrderTypeFromId("sa-take-profit-limit-1")).toBe("limit");
    expect(extractOrderTypeFromId("sa-trailing-stop-limit-1")).toBe("limit");
  });

  it("does not round-trip the ids that blockFactory actually produces (known bug)", () => {
    // Feed every real order type through the real block factory and read the
    // type back out of the id, exactly as blockDataToUIBlock does. Anything not
    // listed as broken here must round-trip; if this list ever shrinks, the
    // production bug has been fixed and the expectation should shrink with it.
    const broken = new Set([
      "stop-loss-limit",
      "take-profit-limit",
      "trailing-stop-limit",
    ]);

    ORDER_TYPES.forEach((orderType) => {
      const { blocks } = createBlocksFromOrderType(orderType, {
        baseId: "sa",
        counter: 0,
      });

      blocks.forEach((block) => {
        const recovered = extractOrderTypeFromId(block.id);
        if (broken.has(orderType.type)) {
          expect(recovered).toBe("limit");
          expect(recovered).not.toBe(orderType.type);
        } else {
          expect(recovered).toBe(orderType.type);
        }
      });
    });
  });
});

describe("blockDataToUIBlock", () => {
  it("carries the grid coordinates and slider state onto the UI block", () => {
    const ui = blockDataToUIBlock(
      blockData({ id: "sa-take-profit-4", yPosition: 40, axis: 1 }),
      1,
      0,
    );

    expect(ui).toMatchObject({
      id: "sa-take-profit-4",
      orderType: "take-profit",
      abrv: "Lmt",
      position: { col: 1, row: 0, yPosition: 40, axis: 1 },
    });
  });

  // CHARACTERISATION OF A KNOWN BUG - do not "fix" this expectation.
  //
  // BlockData already carries an authoritative `orderType` field, but the mapper
  // re-derives it from the id string and so inherits the mis-identification
  // above. This is the path by which a stop-loss-limit reaches Kraken as a plain
  // limit order with no trigger.
  it("prefers the parsed id over the block's own orderType field (known bug)", () => {
    const block = blockData({
      id: "sa-stop-loss-limit-1",
      orderType: "stop-loss-limit",
    });

    expect(block.orderType).toBe("stop-loss-limit");
    expect(blockDataToUIBlock(block, 0, 2).orderType).toBe("limit");
  });
});

// =============================================================================
// BLOCK -> ORDER PARAMS
// =============================================================================

describe("mapBlockToOrderParams", () => {
  it("maps a limit block into a complete Kraken payload", () => {
    const params = mapBlockToOrderParams(uiBlock(), context());

    expect(params).toEqual({
      order_type: "limit",
      side: "buy",
      order_qty: "0.5",
      symbol: "BTC/USD",
      limit_price: "48750.0",
      limit_price_type: "static",
    });
  });

  it("falls back to limit for an order type Kraken does not know", () => {
    const params = mapBlockToOrderParams(
      uiBlock({ orderType: "not-a-real-order-type" }),
      context(),
    );

    expect(params.order_type).toBe("limit");
  });

  it("derives the side from the column when the context does not pin one", () => {
    const ctx = context();
    delete (ctx as Partial<OrderBuildContext>).side;

    expect(
      mapBlockToOrderParams(
        uiBlock({ position: { col: 0, row: 1, yPosition: 25, axis: 2 } }),
        ctx as OrderBuildContext,
      ).side,
    ).toBe("buy");

    expect(
      mapBlockToOrderParams(
        uiBlock({ position: { col: 1, row: 1, yPosition: 25, axis: 2 } }),
        ctx as OrderBuildContext,
      ).side,
    ).toBe("sell");
  });

  it("lets an explicit context side override the column", () => {
    const params = mapBlockToOrderParams(
      uiBlock({ position: { col: 0, row: 1, yPosition: 25, axis: 2 } }),
      context({ side: "sell" }),
    );

    expect(params.side).toBe("sell");
  });

  it("omits the limit price for a block with no limit axis", () => {
    const params = mapBlockToOrderParams(
      uiBlock({ orderType: "market", axes: [] }),
      context(),
    );

    expect(params.limit_price).toBeUndefined();
    expect(params.limit_price_type).toBeUndefined();
    expect(params.triggers).toBeUndefined();
  });

  it("builds a static last-price trigger for a trigger block", () => {
    const params = mapBlockToOrderParams(
      uiBlock({
        id: "sa-stop-loss-1",
        orderType: "stop-loss",
        axes: ["trigger"],
        position: { col: 0, row: 2, yPosition: 15, axis: 1 },
      }),
      context(),
    );

    expect(params.order_type).toBe("stop-loss");
    expect(params.triggers).toEqual({
      reference: "last",
      price: "49250.0",
      price_type: "static",
    });
  });

  it("emits both a limit price and a trigger for a dual-axis block", () => {
    const params = mapBlockToOrderParams(
      uiBlock({
        id: "sa-stop-loss-1",
        orderType: "stop-loss-limit",
        axes: ["trigger", "limit"],
        position: { col: 0, row: 2, yPosition: 20, axis: 1 },
      }),
      context(),
    );

    expect(params.limit_price).toBe("49000.0");
    expect(params.triggers?.price).toBe("49000.0");
  });

  // CHARACTERISATION OF A KNOWN INCONSISTENCY - do not "fix" this expectation.
  //
  // limit_price is formatted with the context symbol, but the trigger price is
  // formatted by buildTrigger, which never receives the symbol and so falls back
  // to DEFAULT_SYMBOL ("BTC/USD"). On a non-BTC pair the two prices in the same
  // payload come out at different precisions.
  it("formats the trigger price at BTC precision on a non-BTC pair (known bug)", () => {
    const params = mapBlockToOrderParams(
      uiBlock({
        id: "sa-stop-loss-1",
        orderType: "stop-loss-limit",
        axes: ["trigger", "limit"],
        position: { col: 0, row: 2, yPosition: 10, axis: 1 },
      }),
      context({ symbol: "ETH/USD", currentPrice: 2_345.6789 }),
    );

    expect(params.limit_price).toBe("2322.22"); // ETH precision, 2 decimals
    expect(params.triggers?.price).toBe("2322.2"); // BTC precision, 1 decimal
  });

  it("passes optional execution flags through only when the context sets them", () => {
    const bare = mapBlockToOrderParams(uiBlock(), context());
    expect(bare.time_in_force).toBeUndefined();
    expect(bare.post_only).toBeUndefined();
    expect(bare.reduce_only).toBeUndefined();
    expect(bare.margin).toBeUndefined();

    const full = mapBlockToOrderParams(
      uiBlock(),
      context({
        timeInForce: "ioc",
        margin: true,
        // `false` must still be forwarded - these are checked against undefined,
        // not for truthiness.
        postOnly: false,
        reduceOnly: false,
      }),
    );

    expect(full.time_in_force).toBe("ioc");
    expect(full.margin).toBe(true);
    expect(full.post_only).toBe(false);
    expect(full.reduce_only).toBe(false);
  });

  it("attaches a linked block as a conditional close", () => {
    const params = mapBlockToOrderParams(uiBlock(), context(), {
      id: "sa-take-profit-2",
      orderType: "take-profit",
      abrv: "TP",
      position: { col: 0, row: 0, yPosition: 30, axis: 1 },
      axes: ["trigger"],
    });

    expect(params.conditional).toEqual({
      order_type: "take-profit",
      trigger_price: "51500.0",
      trigger_price_type: "static",
    });
  });

  it("refuses to attach an order type Kraken cannot use as a conditional", () => {
    const params = mapBlockToOrderParams(uiBlock(), context(), {
      id: "sa-market-2",
      orderType: "market",
      abrv: "Mkt",
      position: { col: 0, row: 1, yPosition: 0, axis: 1 },
      axes: [],
    });

    expect(params.conditional).toBeUndefined();
  });
});

// =============================================================================
// GRID -> ORDERS
// =============================================================================

describe("extractBlocksFromGrid", () => {
  it("flattens the grid and stamps each block with its own coordinates", () => {
    const grid = gridWith([
      { col: 0, row: 1, block: blockData({ id: "sa-limit-1" }) },
      { col: 1, row: 0, block: blockData({ id: "sa-take-profit-2" }) },
      { col: 1, row: 0, block: blockData({ id: "sa-take-profit-3" }) },
    ]);

    const blocks = extractBlocksFromGrid(grid);

    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => [b.id, b.position.col, b.position.row])).toEqual([
      ["sa-limit-1", 0, 1],
      ["sa-take-profit-2", 1, 0],
      ["sa-take-profit-3", 1, 0],
    ]);
  });

  it("returns nothing for an empty grid", () => {
    expect(extractBlocksFromGrid(gridWith([]))).toEqual([]);
  });
});

describe("findLinkedBlocks", () => {
  it("resolves a link to the block it names", () => {
    const primary = uiBlock({ id: "a", linkedBlockId: "b" });
    const conditional = uiBlock({ id: "b" });

    const links = findLinkedBlocks([primary, conditional]);

    expect(links.get("a")).toBe(conditional);
    expect(links.has("b")).toBe(false);
  });

  it("drops a link that points at a block which is no longer on the grid", () => {
    const orphan = uiBlock({ id: "a", linkedBlockId: "deleted" });

    expect(findLinkedBlocks([orphan]).size).toBe(0);
  });
});

describe("mapGridToOrders", () => {
  it("emits one order per block, sided by column", () => {
    const grid = gridWith([
      { col: 0, row: 1, block: blockData({ id: "sa-limit-1" }) },
      { col: 1, row: 1, block: blockData({ id: "sa-limit-2" }) },
    ]);

    const orders = mapGridToOrders(grid, {
      symbol: "BTC/USD",
      currentPrice: MARKET_PRICE,
      quantity: "1",
    });

    expect(orders).toHaveLength(2);
    expect(orders.map((o) => o.side)).toEqual(["buy", "sell"]);
    // Entry sits below market, exit above, for the same slider position.
    expect(orders[0].limit_price).toBe("48750.0");
    expect(orders[1].limit_price).toBe("51250.0");
  });

  it("folds a linked block into its primary instead of emitting it separately", () => {
    const grid = gridWith([
      {
        col: 0,
        row: 1,
        block: blockData({ id: "sa-limit-1", linkedBlockId: "sa-limit-2" }),
      },
      { col: 1, row: 0, block: blockData({ id: "sa-limit-2" }) },
    ]);

    const orders = mapGridToOrders(grid, {
      symbol: "BTC/USD",
      currentPrice: MARKET_PRICE,
      quantity: "1",
    });

    expect(orders).toHaveLength(1);
    expect(orders[0].side).toBe("buy");
    expect(orders[0].conditional).toEqual({
      order_type: "limit",
      limit_price: "51250.0",
      limit_price_type: "static",
    });
  });

  // CHARACTERISATION OF A KNOWN BUG - do not "fix" this expectation.
  //
  // Every block that is somebody's conditional is skipped at the top level. If
  // two blocks name each other, both are skipped and the grid silently produces
  // no orders at all - the user presses Execute and nothing is sent.
  it("silently drops both blocks of a mutually linked pair (known bug)", () => {
    const grid = gridWith([
      {
        col: 0,
        row: 1,
        block: blockData({ id: "a", linkedBlockId: "b" }),
      },
      {
        col: 1,
        row: 1,
        block: blockData({ id: "b", linkedBlockId: "a" }),
      },
    ]);

    const orders = mapGridToOrders(grid, {
      symbol: "BTC/USD",
      currentPrice: MARKET_PRICE,
      quantity: "1",
    });

    expect(orders).toEqual([]);
  });

  it("produces no orders for an empty grid", () => {
    expect(
      mapGridToOrders(gridWith([]), {
        symbol: "BTC/USD",
        currentPrice: MARKET_PRICE,
        quantity: "1",
      }),
    ).toEqual([]);
  });
});

// =============================================================================
// VALIDATION & PREVIEW
// =============================================================================

describe("validateOrder", () => {
  const valid = {
    order_type: "limit",
    side: "buy",
    order_qty: "0.5",
    symbol: "BTC/USD",
    limit_price: "48750.0",
  } as const;

  it("accepts a complete limit order", () => {
    expect(validateOrder({ ...valid })).toEqual([]);
  });

  it("rejects a missing symbol", () => {
    expect(validateOrder({ ...valid, symbol: "" })).toContain(
      "Symbol is required",
    );
  });

  it("rejects a zero, negative or empty quantity", () => {
    const message = "Order quantity must be greater than 0";
    expect(validateOrder({ ...valid, order_qty: "0" })).toContain(message);
    expect(validateOrder({ ...valid, order_qty: "-1" })).toContain(message);
    expect(validateOrder({ ...valid, order_qty: "" })).toContain(message);
  });

  // CHARACTERISATION OF A KNOWN BUG - do not "fix" this expectation.
  //
  // The guard is `!qty || parseFloat(qty) <= 0`. A non-numeric string is truthy
  // and parses to NaN, and every NaN comparison is false, so garbage passes
  // validation and is sent to Kraken as the order quantity.
  it("accepts a non-numeric quantity (known bug)", () => {
    expect(validateOrder({ ...valid, order_qty: "abc" })).toEqual([]);
    expect(validateOrder({ ...valid, order_qty: "0.5 BTC" })).toEqual([]);
  });

  it("requires a limit price on every limit-style order type", () => {
    (
      [
        "limit",
        "iceberg",
        "stop-loss-limit",
        "take-profit-limit",
        "trailing-stop-limit",
      ] as const
    ).forEach((order_type) => {
      const errors = validateOrder({
        ...valid,
        order_type,
        limit_price: undefined,
        triggers: { reference: "last", price: "1", price_type: "static" },
      });

      expect(errors).toContain(`Limit price is required for ${order_type} orders`);
    });
  });

  it("requires a trigger on every trigger-style order type", () => {
    (
      [
        "stop-loss",
        "stop-loss-limit",
        "take-profit",
        "take-profit-limit",
        "trailing-stop",
        "trailing-stop-limit",
      ] as const
    ).forEach((order_type) => {
      const errors = validateOrder({
        ...valid,
        order_type,
        limit_price: "1",
        triggers: undefined,
      });

      expect(errors).toContain(
        `Trigger configuration is required for ${order_type} orders`,
      );
    });
  });

  it("does not demand a price on a market order", () => {
    expect(
      validateOrder({
        order_type: "market",
        side: "buy",
        order_qty: "0.5",
        symbol: "BTC/USD",
      }),
    ).toEqual([]);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const errors = validateOrder({
      order_type: "stop-loss-limit",
      side: "buy",
      order_qty: "0",
      symbol: "",
    });

    expect(errors).toHaveLength(4);
  });

  // CHARACTERISATION OF THE BLAST RADIUS of the id-parsing bug above: because a
  // stop-loss-limit is relabelled "limit", validation stops asking for the
  // trigger that made it a protective order, and the payload passes cleanly.
  it("passes a mislabelled stop-loss-limit that has lost its trigger (known bug)", () => {
    expect(
      validateOrder({
        order_type: "limit",
        side: "buy",
        order_qty: "0.5",
        symbol: "BTC/USD",
        limit_price: "48750.0",
      }),
    ).toEqual([]);
  });
});

describe("createOrderPreview", () => {
  it("summarises a limit order with its price", () => {
    expect(
      createOrderPreview({
        order_type: "limit",
        side: "buy",
        order_qty: "0.5",
        symbol: "BTC/USD",
        limit_price: "48750.0",
      }),
    ).toBe("BUY 0.5 BTC/USD (limit) @ 48750.0");
  });

  it("appends the trigger when there is one", () => {
    expect(
      createOrderPreview({
        order_type: "stop-loss-limit",
        side: "sell",
        order_qty: "1",
        symbol: "BTC/USD",
        limit_price: "49000.0",
        triggers: { reference: "last", price: "49250.0", price_type: "static" },
      }),
    ).toBe("SELL 1 BTC/USD (stop-loss-limit) @ 49000.0 trigger: 49250.0");
  });

  it("omits the price clauses for a market order", () => {
    expect(
      createOrderPreview({
        order_type: "market",
        side: "buy",
        order_qty: "2",
        symbol: "BTC/USD",
      }),
    ).toBe("BUY 2 BTC/USD (market)");
  });
});
