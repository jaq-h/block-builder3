import { describe, it, expect } from "vitest";

import {
  blockDataToUIBlock,
  calculateBlockPrice,
  createOrderPreview,
  extractBlocksFromGrid,
  findLinkedBlocks,
  mapBlockToOrderParams,
  mapGridToOrders,
  validateOrder,
} from "@api/orderMapper";
import type { OrderBuildContext, UIBlockData } from "@api/types";
import type { BlockData, GridData } from "@/types/grid";
import { ORDER_TYPES } from "@data/orderTypes";
import { createBlocksFromOrderType } from "@utils/blockFactory";
import {
  addBlocksToCell,
  cellDirection,
  directionForNewCell,
  priceForOffset,
} from "@utils/blockMapping";
import { clearGrid } from "@utils/grid";
import { formatPriceForAPI } from "@utils/marketFormat";
import { ARB_USD, BTC_USD, ETH_USD } from "@/test/marketFixtures";

// =============================================================================
// FIXTURES
// =============================================================================

const MARKET_PRICE = 50_000;

const context = (
  overrides: Partial<OrderBuildContext> = {},
): OrderBuildContext => ({
  market: BTC_USD,
  currentPrice: MARKET_PRICE,
  side: "buy",
  quantity: "0.5",
  ...overrides,
});

// An Entry limit in the primary row: `directionForNewCell(1, 0, "conditional")`
// is "downside", so the grid draws it below market and the cell stamps it so.
const uiBlock = (overrides: Partial<UIBlockData> = {}): UIBlockData => ({
  id: "sa-limit-1",
  orderType: "limit",
  abrv: "Lmt",
  position: { col: 0, row: 1, yPosition: 25, axis: 2 },
  direction: "downside",
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
  direction: "downside",
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

describe("calculateBlockPrice", () => {
  // FORMERLY A CHARACTERISATION OF A KNOWN BUG. The mapper applied its own
  // `scaleFactor` of 0.1, so a block the grid drew at +25% was sent at +2.5%:
  // against a $50,000 market, $51,250 instead of $62,500. Decision D3 settled
  // that the interface is right, so the scale factor is gone.
  it("takes the block position at face value, with no damping", () => {
    expect(
      calculateBlockPrice(
        uiBlock({
          direction: "upside",
          position: { col: 1, row: 0, yPosition: 25, axis: 2 },
        }),
        50_000,
      ),
    ).toBeCloseTo(62_500, 6);
  });

  // FORMERLY A SECOND HALF OF THE SAME BUG. The mapper decided the side of the
  // market from raw row/column while the grid decided it from the block's
  // `direction`, which also accounts for the strategy pattern and the order
  // type. Under the bulk pattern the two resolved to opposite sides. There is
  // now one answer, and it is the block's own.
  it("reads the side of the market off the block's direction", () => {
    const at = (direction: "upside" | "downside") =>
      calculateBlockPrice(uiBlock({ direction }), 50_000);

    expect(at("upside")).toBeCloseTo(62_500, 6);
    expect(at("downside")).toBeCloseTo(37_500, 6);
  });

  it("ignores row and column entirely", () => {
    const prices = [
      { col: 0, row: 0 },
      { col: 0, row: 2 },
      { col: 1, row: 1 },
    ].map(({ col, row }) =>
      calculateBlockPrice(
        uiBlock({
          direction: "downside",
          position: { col, row, yPosition: 10, axis: 2 },
        }),
        50_000,
      ),
    );

    expect(prices).toEqual([45_000, 45_000, 45_000]);
  });

  it("returns the market price when the slider sits at zero", () => {
    expect(
      calculateBlockPrice(
        uiBlock({ position: { col: 0, row: 1, yPosition: 0, axis: 2 } }),
        50_000,
      ),
    ).toBe(50_000);
  });

  // The point of the whole exercise: the number the user reads off the grid is
  // the number that reaches Kraken. Both sides are derived from one input here,
  // through the two functions the app actually calls.
  it("agrees with the price the grid cell displays, for every direction", () => {
    const market = 76_689.4;

    ([0, 1] as const).forEach((col) => {
      [0, 1, 2].forEach((row) => {
        const direction = directionForNewCell(row, col, "conditional");
        const displayed = priceForOffset(market, 25, direction);
        const sent = calculateBlockPrice(
          uiBlock({
            direction,
            position: { col, row, yPosition: 25, axis: 2 },
          }),
          market,
        );

        expect(sent).toBe(displayed);
      });
    });
  });
});

// FORMERLY A CHARACTERISATION OF A KNOWN BUG. The precision suite that stood
// here pinned a magnitude heuristic: BTC by base asset, then 6 decimals below a
// price of 1, 4 below 100, 2 above. Magnitude is not precision. Kraken's own
// `pair_decimals` is 2 for ETH/USD at *every* price, so the old expectation
// `formatPriceForAPI(12.3456789, "ETH/USD") === "12.3457"` was four decimals
// the exchange rejects, and `formatPriceForAPI(0.123456789, "DOGE/USD") ===
// "0.123457"` was six. A third case, `formatPriceForAPI(2_345.678) ===
// "2345.7"`, asserted the default that let a caller omit the pair entirely.
//
// Formatting now takes Kraken's `MarketPrecision` and has no default at all, so
// those expectations are gone rather than loosened. `utils/marketFormat.test.ts`
// owns the formatters directly, and the payload-level guarantee - every price
// and quantity in one order formatted for one pair - is pinned below in
// "per-asset precision across a whole payload".

// =============================================================================
// ORDER TYPE RECOVERY FROM BLOCK IDS
// =============================================================================

describe("blockDataToUIBlock", () => {
  it("carries the grid coordinates and slider state onto the UI block", () => {
    const ui = blockDataToUIBlock(
      blockData({
        id: "sa-take-profit-4",
        orderType: "take-profit",
        yPosition: 40,
        axis: 1,
      }),
      1,
      0,
      "upside",
    );

    expect(ui).toMatchObject({
      id: "sa-take-profit-4",
      orderType: "take-profit",
      abrv: "Lmt",
      position: { col: 1, row: 0, yPosition: 40, axis: 1 },
    });
  });

  // The direction is the CELL's, handed in by `extractBlocksFromGrid` (decision
  // D8). This used to read the block's own field, which is how a bulk cell drew
  // one price and this built another from the identical block.
  it("takes the direction it is given rather than the block's own", () => {
    expect(
      blockDataToUIBlock(blockData({ direction: "upside" }), 0, 1, "downside"),
    ).toMatchObject({ direction: "downside" });
    expect(
      blockDataToUIBlock(blockData({ direction: "downside" }), 0, 1, "upside"),
    ).toMatchObject({ direction: "upside" });
  });

  // A position no axis could have drawn cannot reach a payload: the 0-100
  // reading the drop handler used to write is gone, and this is what stops a
  // strategy saved while it existed from carrying one back in.
  it("clamps a position from outside the axis range", () => {
    expect(
      blockDataToUIBlock(blockData({ yPosition: 100 }), 0, 1, "downside")
        .position.yPosition,
    ).toBe(50);
  });

  // FORMERLY A CHARACTERISATION OF A KNOWN BUG. `BlockData` has always carried
  // an authoritative `orderType`, but this function re-derived it by scanning
  // the id for "-<type>-" against a list whose first entry was "limit". Every
  // "-limit" variant matched "limit" first, so a stop-loss-limit reached Kraken
  // as a plain limit order with no trigger at all.
  it("reads the block's own orderType rather than parsing its id", () => {
    const block = blockData({
      id: "sa-stop-loss-limit-1",
      orderType: "stop-loss-limit",
    });

    expect(blockDataToUIBlock(block, 0, 2, "downside").orderType).toBe(
      "stop-loss-limit",
    );
  });

  // FORMERLY A CHARACTERISATION OF THE SAME BUG, which listed
  // stop-loss-limit, take-profit-limit and trailing-stop-limit as broken. Every
  // order type the palette offers now survives the trip through the real block
  // factory, including the second, "-limit"-suffixed leg of the dual-axis ones.
  it("round-trips every order type the block factory produces", () => {
    ORDER_TYPES.forEach((orderType) => {
      const { blocks } = createBlocksFromOrderType(orderType, {
        baseId: "sa",
        counter: 0,
      });

      blocks.forEach((block) => {
        expect(blockDataToUIBlock(block, 0, 1, "downside").orderType).toBe(
          orderType.type,
        );
      });
    });
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
      // 25% below a $50,000 market, which is what the grid draws. The mapper
      // used to damp the slider by 10x and send 48750.0, a 2.5% offset.
      limit_price: "37500.0",
      limit_price_type: "static",
    });
  });

  // Falling back to "limit" was how an unrecognised type used to become a live
  // order with no trigger. "limit" is the worst available guess, so there is no
  // guess: an order type the mapper does not recognise is refused outright.
  // `mapOrderType` refusing an unrecognised type makes its lookup table and the
  // ORDER_TYPES palette two lists that have to agree, the way the path aliases
  // in vite.config.ts and tsconfig.app.json do. Nothing else pins that: add a
  // type to the palette alone and the block drops, renders, saves and reloads
  // fine, then Execute throws on a type the product legitimately offers. This
  // fails in CI instead.
  it("maps every order type the palette offers", () => {
    ORDER_TYPES.forEach((orderType) => {
      const { blocks } = createBlocksFromOrderType(orderType, {
        baseId: "sa",
        counter: 0,
      });

      blocks.forEach((block) => {
        const params = mapBlockToOrderParams(
          blockDataToUIBlock(block, 0, 1, "downside"),
          context(),
        );

        expect(params.order_type).toBe(orderType.type);
      });
    });
  });

  it("refuses an order type Kraken does not know", () => {
    expect(() =>
      mapBlockToOrderParams(
        uiBlock({ orderType: "not-a-real-order-type" }),
        context(),
      ),
    ).toThrow(/not-a-real-order-type/);
  });

  // An object-literal lookup resolves inherited Object.prototype members too,
  // so these used to return a truthy function that flowed straight into
  // order_type. validateOrder only checks that order_type is present, so the
  // payload went out with a function where its type should be.
  it.each(["toString", "constructor", "hasOwnProperty", "__proto__"])(
    "refuses %s, which is not an order type but is on Object.prototype",
    (inherited) => {
      expect(() =>
        mapBlockToOrderParams(uiBlock({ orderType: inherited }), context()),
      ).toThrow(inherited);
    },
  );

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
        direction: "downside",
        position: { col: 0, row: 2, yPosition: 15, axis: 1 },
      }),
      context(),
    );

    expect(params.order_type).toBe("stop-loss");
    expect(params.triggers).toEqual({
      reference: "last",
      // 15% below market. Formerly 49250.0, a damped 1.5%.
      price: "42500.0",
      price_type: "static",
    });
  });

  // FORMERLY THIS PINNED THE COLLAPSE AS CORRECT. It asserted that a block
  // carrying both axes should emit limit_price === triggers.price ===
  // "40000.0", a payload whose two prices both came from one slider. That is
  // the mapper guessing a second price, and it passes validateOrder cleanly, so
  // nothing downstream caught it. A dual-axis order type is placed as two
  // blocks, one per axis, so such a block has no construction path - the mapper
  // refuses it rather than inventing the price the block cannot express.
  it("refuses a block claiming both a trigger and a limit axis", () => {
    expect(() =>
      mapBlockToOrderParams(
        uiBlock({
          id: "sa-stop-loss-limit-1",
          orderType: "stop-loss-limit",
          axes: ["trigger", "limit"],
          direction: "downside",
          position: { col: 0, row: 2, yPosition: 20, axis: 1 },
        }),
        context(),
      ),
    ).toThrow(/sa-stop-loss-limit-1/);
  });

  // A linked conditional collapses in exactly the same way, so it is refused at
  // the same point rather than only on the primary.
  it("refuses a linked conditional block claiming both axes", () => {
    expect(() =>
      mapBlockToOrderParams(
        uiBlock({ direction: "downside" }),
        context(),
        uiBlock({
          id: "sa-take-profit-limit-2",
          orderType: "take-profit-limit",
          axes: ["trigger", "limit"],
          direction: "upside",
          position: { col: 0, row: 0, yPosition: 20, axis: 1 },
        }),
      ),
    ).toThrow(/sa-take-profit-limit-2/);
  });

  // FORMERLY A CHARACTERISATION OF A KNOWN INCONSISTENCY. `limit_price` was
  // formatted with the context symbol while the trigger price was formatted by
  // `buildTrigger`, which never received one and fell back to DEFAULT_SYMBOL
  // ("BTC/USD"). On ETH/USD the same 10% offset came out as "2111.11" through
  // the limit formatter and "2111.1" through the trigger one.
  //
  // The requirement is that no payload mixes precisions on a non-BTC pair. The
  // two legs of a dual-axis type are separate blocks, so this drives each
  // formatter with the leg that reaches it and holds them to the same answer
  // for the same offset.
  it("formats a trigger price and a limit price at the same pair precision", () => {
    const ctx = context({ market: ETH_USD, currentPrice: 2_345.6789 });
    const leg = (axes: UIBlockData["axes"], axis: 1 | 2): UIBlockData =>
      uiBlock({
        id: `sa-stop-loss-limit-${axis}`,
        orderType: "stop-loss-limit",
        axes,
        direction: "downside",
        position: { col: 0, row: 2, yPosition: 10, axis },
      });

    const triggerLeg = mapBlockToOrderParams(leg(["trigger"], 1), ctx);
    const limitLeg = mapBlockToOrderParams(leg(["limit"], 2), ctx);

    expect(triggerLeg.triggers?.price).toBe("2111.11");
    expect(limitLeg.limit_price).toBe("2111.11");
    expect(triggerLeg.triggers?.price).toBe(limitLeg.limit_price);
  });

  it("formats a conditional's prices at the pair's precision too", () => {
    const params = mapBlockToOrderParams(
      uiBlock({ direction: "downside" }),
      context({ market: ETH_USD, currentPrice: 2_345.6789 }),
      uiBlock({
        id: "sa-take-profit-2",
        orderType: "take-profit",
        direction: "upside",
        position: { col: 0, row: 0, yPosition: 10, axis: 1 },
        axes: ["trigger"],
      }),
    );

    expect(params.conditional?.trigger_price).toBe("2580.25");
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
      direction: "upside",
      axes: ["trigger"],
    });

    expect(params.conditional).toEqual({
      order_type: "take-profit",
      // 30% above market. Formerly 51500.0, a damped 3%.
      trigger_price: "65000.0",
      trigger_price_type: "static",
    });
  });

  // It used to return the order with `conditional` left undefined, so the block
  // the user linked simply disappeared from the payload. A market order cannot
  // be a Kraken conditional close, and the strategy is refused rather than
  // quietly reduced to something the user did not draw.
  it("refuses to attach an order type Kraken cannot use as a conditional", () => {
    expect(() =>
      mapBlockToOrderParams(uiBlock(), context(), {
        id: "sa-market-2",
        orderType: "market",
        abrv: "Mkt",
        position: { col: 0, row: 1, yPosition: 0, axis: 1 },
        direction: "upside",
        axes: [],
      }),
    ).toThrow(
      /"sa-market-2" is linked as a conditional close, but Kraken cannot use a market order as one/,
    );
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

// =============================================================================
// THE CELL OWNS THE DIRECTION - decision D8
// =============================================================================

describe("mapGridToOrders, a bulk cell holding two order families", () => {
  // Split 5, at the market price it was reported at. A Limit lands in the Entry
  // column first, so the cell is stamped "downside"; a Stop Loss dropped beside
  // it would be "upside" on its own account, and used to be, which is how the
  // grid drew `-25.00% $37,500` while this built a payload at 62,500 from the
  // very same block.
  const MARKET = 50_000;

  const bulkCell = (): GridData => {
    let grid = addBlocksToCell(
      clearGrid(2, 3),
      { col: 0, row: 1 },
      [
        {
          id: "b1",
          orderType: "limit",
          label: "Limit",
          abrv: "Lmt",
          allowedRows: [0, 1, 2],
          axis: 2,
          yPosition: 25,
          direction: "upside",
          axes: ["limit"],
        },
      ],
      "bulk",
    );
    grid = addBlocksToCell(
      grid,
      { col: 0, row: 1 },
      [
        {
          id: "s1",
          orderType: "stop-loss",
          label: "Stop Loss",
          abrv: "SL",
          allowedRows: [0, 1, 2],
          axis: 1,
          yPosition: 25,
          direction: "upside",
          axes: ["trigger"],
        },
      ],
      "bulk",
    );
    return grid;
  };

  it("prices every block in the cell on the cell's own scale", () => {
    const grid = bulkCell();
    const direction = cellDirection(grid[0][1]);
    const orders = mapGridToOrders(grid, {
      market: BTC_USD,
      currentPrice: MARKET,
      quantity: "1",
    });

    expect(direction).toBe("downside");
    expect(orders.find((o) => o.order_type === "limit")?.limit_price).toBe(
      "37500.0",
    );
    expect(
      orders.find((o) => o.order_type === "stop-loss")?.triggers?.price,
    ).toBe("37500.0");
  });

  // The other half of the invariant: taking a block out of the cell must not
  // re-price the ones left behind. It used to, because the cell drew itself on
  // whichever block happened to be first.
  it("does not re-price the survivors when a block is removed", () => {
    const grid = bulkCell();
    const before = mapGridToOrders(grid, {
      market: BTC_USD,
      currentPrice: MARKET,
      quantity: "1",
    }).find((o) => o.order_type === "stop-loss")?.triggers?.price;

    // Remove the Limit, which is `blocks[0]` and used to be the cell's scale.
    grid[0][1] = grid[0][1].filter((b) => b.id !== "b1");

    const after = mapGridToOrders(grid, {
      market: BTC_USD,
      currentPrice: MARKET,
      quantity: "1",
    }).find((o) => o.order_type === "stop-loss")?.triggers?.price;

    expect(after).toBe(before);
    expect(after).toBe("37500.0");
  });
});

describe("mapGridToOrders", () => {
  it("emits one order per block, sided by column", () => {
    const grid = gridWith([
      {
        col: 0,
        row: 1,
        block: blockData({ id: "sa-limit-1", direction: "downside" }),
      },
      {
        col: 1,
        row: 1,
        block: blockData({ id: "sa-limit-2", direction: "upside" }),
      },
    ]);

    const orders = mapGridToOrders(grid, {
      market: BTC_USD,
      currentPrice: MARKET_PRICE,
      quantity: "1",
    });

    expect(orders).toHaveLength(2);
    expect(orders.map((o) => o.side)).toEqual(["buy", "sell"]);
    // Entry sits below market, exit above, for the same slider position, and
    // both are the full 25% the grid draws rather than a damped 2.5%.
    expect(orders[0].limit_price).toBe("37500.0");
    expect(orders[1].limit_price).toBe("62500.0");
  });

  it("folds a linked block into its primary instead of emitting it separately", () => {
    const grid = gridWith([
      {
        col: 0,
        row: 1,
        block: blockData({ id: "sa-limit-1", linkedBlockId: "sa-limit-2" }),
      },
      {
        col: 1,
        row: 0,
        block: blockData({ id: "sa-limit-2", direction: "upside" }),
      },
    ]);

    const orders = mapGridToOrders(grid, {
      market: BTC_USD,
      currentPrice: MARKET_PRICE,
      quantity: "1",
    });

    expect(orders).toHaveLength(1);
    expect(orders[0].side).toBe("buy");
    expect(orders[0].conditional).toEqual({
      order_type: "limit",
      limit_price: "62500.0",
      limit_price_type: "static",
    });
  });

  // FORMERLY A CHARACTERISATION OF A KNOWN BUG. Every block that is somebody's
  // conditional is skipped at the top level, so two blocks naming each other
  // were both skipped: the grid produced no orders at all, the user pressed
  // Execute, and nothing was sent with nothing to explain it. A Kraken
  // conditional close attaches to exactly one primary order, so the cycle is
  // not a strategy that can be built - it is refused rather than half-guessed.
  it("refuses a mutually linked pair instead of silently sending nothing", () => {
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

    expect(() =>
      mapGridToOrders(grid, {
        market: BTC_USD,
        currentPrice: MARKET_PRICE,
        quantity: "1",
      }),
    ).toThrow(/a -> b -> a/);
  });

  it("refuses a longer link cycle, and a block linked to itself", () => {
    const threeWay = gridWith([
      { col: 0, row: 0, block: blockData({ id: "a", linkedBlockId: "b" }) },
      { col: 0, row: 1, block: blockData({ id: "b", linkedBlockId: "c" }) },
      { col: 1, row: 0, block: blockData({ id: "c", linkedBlockId: "a" }) },
    ]);
    const selfLink = gridWith([
      { col: 0, row: 1, block: blockData({ id: "a", linkedBlockId: "a" }) },
    ]);
    const ctx = {
      market: BTC_USD,
      currentPrice: MARKET_PRICE,
      quantity: "1",
    };

    expect(() => mapGridToOrders(threeWay, ctx)).toThrow(/a -> b -> c -> a/);
    expect(() => mapGridToOrders(selfLink, ctx)).toThrow(/a -> a/);
  });

  it("still maps a single link, where the conditional links onward to nothing", () => {
    const grid = gridWith([
      { col: 0, row: 1, block: blockData({ id: "a", linkedBlockId: "b" }) },
      { col: 1, row: 0, block: blockData({ id: "b" }) },
    ]);

    const orders = mapGridToOrders(grid, {
      market: BTC_USD,
      currentPrice: MARKET_PRICE,
      quantity: "1",
    });

    expect(orders).toHaveLength(1);
    expect(orders[0].conditional?.order_type).toBe("limit");
  });

  // A conditional close hangs off exactly one primary order and carries no
  // conditional of its own, so a chain is not a strategy that can be built. It
  // used to emit one order for "a" carrying "b", and drop "c" entirely: "b" is
  // skipped for being somebody's conditional so its own link is never followed,
  // and "c" is skipped for being named as one.
  it("refuses a chain, instead of silently dropping its tail", () => {
    const grid = gridWith([
      { col: 0, row: 0, block: blockData({ id: "a", linkedBlockId: "b" }) },
      { col: 0, row: 1, block: blockData({ id: "b", linkedBlockId: "c" }) },
      { col: 1, row: 0, block: blockData({ id: "c" }) },
    ]);

    expect(() =>
      mapGridToOrders(grid, {
        market: BTC_USD,
        currentPrice: MARKET_PRICE,
        quantity: "1",
      }),
    ).toThrow(/"b" is the conditional of "a" and itself links to "c"/);
  });

  // Two primaries naming the same conditional used to emit two orders that both
  // carried "c", so the same close was submitted twice.
  it("refuses a conditional shared between two primaries", () => {
    const grid = gridWith([
      { col: 0, row: 0, block: blockData({ id: "a", linkedBlockId: "c" }) },
      { col: 0, row: 1, block: blockData({ id: "b", linkedBlockId: "c" }) },
      { col: 1, row: 0, block: blockData({ id: "c" }) },
    ]);

    expect(() =>
      mapGridToOrders(grid, {
        market: BTC_USD,
        currentPrice: MARKET_PRICE,
        quantity: "1",
      }),
    ).toThrow(/"c" is named as the conditional of more than one primary/);
  });

  // The block used to vanish: "b" is skipped at the top level for being
  // somebody's conditional, then the conditional builder declined a market
  // order and returned nothing, so the grid emitted one limit order with no
  // conditional and no trace of "b" at all.
  it("refuses a conditional whose order type Kraken cannot use as one", () => {
    const grid = gridWith([
      { col: 0, row: 1, block: blockData({ id: "a", linkedBlockId: "b" }) },
      {
        col: 1,
        row: 0,
        block: blockData({ id: "b", orderType: "market", axes: [] }),
      },
    ]);

    expect(() =>
      mapGridToOrders(grid, {
        market: BTC_USD,
        currentPrice: MARKET_PRICE,
        quantity: "1",
      }),
    ).toThrow(
      /"b" is linked as the conditional of "a", but Kraken cannot use a market order as a conditional close/,
    );
  });

  // `findLinkedBlocks` drops a link it cannot resolve, so the flatness walk
  // never saw this one and the primary was emitted alone with its protective
  // close silently gone. The error has to name both ends, because clearing the
  // link is what repairs it.
  it("refuses a link naming a block that is not on the grid", () => {
    const grid = gridWith([
      {
        col: 0,
        row: 1,
        block: blockData({ id: "a", linkedBlockId: "deleted" }),
      },
    ]);

    expect(() =>
      mapGridToOrders(grid, {
        market: BTC_USD,
        currentPrice: MARKET_PRICE,
        quantity: "1",
      }),
    ).toThrow(
      /Block "a" names "deleted" as its conditional close, but no such block is on the grid/,
    );
  });

  it("produces no orders for an empty grid", () => {
    expect(
      mapGridToOrders(gridWith([]), {
        market: BTC_USD,
        currentPrice: MARKET_PRICE,
        quantity: "1",
      }),
    ).toEqual([]);
  });
});

// =============================================================================
// THE STRATEGY A USER ACTUALLY BUILDS
// =============================================================================

/**
 * Places an order type the way the grid does: the real block factory builds the
 * blocks, and the cell stamps its own direction onto all of them. Nothing here
 * is a re-implementation - these are the same two calls `GridArea` makes on
 * drop, through `addBlocksToCell`.
 */
const placeOrderType = (
  type: string,
  col: number,
  row: number,
  positions: number[],
): BlockData[] => {
  const definition = ORDER_TYPES.find((o) => o.type === type);
  if (!definition) throw new Error(`no such order type: ${type}`);

  const { blocks } = createBlocksFromOrderType(definition, {
    baseId: "sa",
    counter: 0,
  });

  const placed = blocks.map((block, index) => ({
    ...block,
    yPosition: positions[index],
  }));

  return addBlocksToCell(clearGrid(2, 3), { col, row }, placed, "conditional")[
    col
  ][row];
};

describe("a Stop Loss Limit dragged into Entry / Primary", () => {
  // Reproduces the strategy built against the running app: Stop Loss Limit
  // dropped into the Entry column's primary row, trigger slider at 15%, limit
  // slider at 10%. The grid drew "-15.00% $66,098.38" and "-10.00% $69,986.52";
  // the mapper used to send 76596.4 and 76985.2, both as plain limit orders.
  const MARKET = 77_762.8;
  const TRIGGER_POSITION = 15;
  const LIMIT_POSITION = 10;

  const orders = () => {
    const blocks = placeOrderType("stop-loss-limit", 0, 1, [
      TRIGGER_POSITION,
      LIMIT_POSITION,
    ]);

    return mapGridToOrders(gridWith(blocks.map((block) => ({ col: 0, row: 1, block }))), {
      market: BTC_USD,
      currentPrice: MARKET,
      quantity: "0.5",
    });
  };

  it("keeps its own order type instead of becoming a plain limit order", () => {
    expect(orders().map((o) => o.order_type)).toEqual([
      "stop-loss-limit",
      "stop-loss-limit",
    ]);
  });

  it("carries the trigger the user placed", () => {
    const trigger = orders()[0].triggers;

    expect(trigger).toEqual({
      reference: "last",
      price: "66098.4",
      price_type: "static",
    });
  });

  it("sends the prices the grid displayed, derived from the same input", () => {
    const [triggerLeg, limitLeg] = orders();
    const displayed = (position: number) =>
      formatPriceForAPI(priceForOffset(MARKET, position, "downside"), BTC_USD);

    expect(triggerLeg.triggers?.price).toBe(displayed(TRIGGER_POSITION));
    expect(limitLeg.limit_price).toBe(displayed(LIMIT_POSITION));

    // And, spelled out, the numbers the app rendered on screen.
    expect(triggerLeg.triggers?.price).toBe("66098.4");
    expect(limitLeg.limit_price).toBe("69986.5");
  });

  // The two legs of a dual-axis order type are still emitted as two separate
  // orders, so neither is a complete stop-loss-limit on its own and validation
  // now says so. That is the honest outcome of fixing the relabelling: the pair
  // used to pass as two plain limit orders. Merging the legs into one payload
  // needs a durable pairing identity on the block, which is a separate change.
  it("is refused by validation while its legs are split across two orders", () => {
    const [triggerLeg, limitLeg] = orders();

    expect(validateOrder(triggerLeg)).toEqual([
      "Limit price is required for stop-loss-limit orders",
    ]);
    expect(validateOrder(limitLeg)).toEqual([
      "Trigger configuration is required for stop-loss-limit orders",
    ]);
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

  const QUANTITY_ERROR = "Order quantity must be a positive number";

  it("rejects a zero, negative or empty quantity", () => {
    expect(validateOrder({ ...valid, order_qty: "0" })).toContain(
      QUANTITY_ERROR,
    );
    expect(validateOrder({ ...valid, order_qty: "-1" })).toContain(
      QUANTITY_ERROR,
    );
    expect(validateOrder({ ...valid, order_qty: "" })).toContain(
      QUANTITY_ERROR,
    );
  });

  // FORMERLY A CHARACTERISATION OF A KNOWN BUG. The guard was
  // `!qty || parseFloat(qty) <= 0`: a non-numeric string is truthy and parses
  // to NaN, and every NaN comparison is false, so "abc" passed validation and
  // went to Kraken as the order quantity.
  it("rejects a quantity that is not a number", () => {
    expect(validateOrder({ ...valid, order_qty: "abc" })).toContain(
      QUANTITY_ERROR,
    );
    expect(validateOrder({ ...valid, order_qty: "0.5 BTC" })).toContain(
      QUANTITY_ERROR,
    );
    expect(validateOrder({ ...valid, order_qty: "   " })).toContain(
      QUANTITY_ERROR,
    );
    expect(validateOrder({ ...valid, order_qty: "Infinity" })).toContain(
      QUANTITY_ERROR,
    );
    expect(validateOrder({ ...valid, order_qty: "NaN" })).toContain(
      QUANTITY_ERROR,
    );
  });

  it("still accepts the quantity formats the app actually produces", () => {
    expect(validateOrder({ ...valid, order_qty: "0.5" })).toEqual([]);
    expect(validateOrder({ ...valid, order_qty: "1" })).toEqual([]);
    expect(validateOrder({ ...valid, order_qty: "1e-3" })).toEqual([]);
  });

  const LIMIT_PRICE_ERROR = "Limit price must be a positive number";
  const LIMIT_PRICE_FINITE_ERROR = "Limit price must be a finite number";

  it("rejects a static limit price that is zero or negative", () => {
    ["0", "0.0", "-1", "", "   "].forEach((limit_price) => {
      expect(validateOrder({ ...valid, limit_price })).toContain(
        LIMIT_PRICE_ERROR,
      );
    });
  });

  it("rejects a limit price that is not a number, whatever its price type", () => {
    (["static", "pct", "quote", undefined] as const).forEach(
      (limit_price_type) => {
        ["abc", "NaN", "Infinity", "1.5 BTC"].forEach((limit_price) => {
          expect(
            validateOrder({ ...valid, limit_price, limit_price_type }),
          ).toContain(LIMIT_PRICE_FINITE_ERROR);
        });
      },
    );
  });

  // Under a `pct` or `quote` price type the value is a signed offset from the
  // reference, not an absolute price, so a negative one is what the caller
  // meant. Positivity is a static-price rule and is applied only there.
  it("accepts a relative price that is negative", () => {
    expect(
      validateOrder({
        ...valid,
        limit_price: "-1.5",
        limit_price_type: "pct",
      }),
    ).toEqual([]);

    expect(
      validateOrder({
        order_type: "stop-loss",
        side: "sell",
        order_qty: "0.5",
        symbol: "BTC/USD",
        triggers: { reference: "last", price: "-2", price_type: "quote" },
      }),
    ).toEqual([]);
  });

  it("names the offending field on every price the payload carries", () => {
    const errors = validateOrder({
      order_type: "stop-loss-limit",
      side: "buy",
      order_qty: "0.5",
      symbol: "BTC/USD",
      limit_price: "0.0",
      triggers: { reference: "last", price: "0.0", price_type: "static" },
      conditional: {
        order_type: "stop-loss-limit",
        limit_price: "abc",
        trigger_price: "-1",
      },
    });

    expect(errors).toEqual([
      LIMIT_PRICE_ERROR,
      "Trigger price must be a positive number",
      "Conditional limit price must be a finite number",
      "Conditional trigger price must be a positive number",
    ]);
  });

  // FORMERLY A CHARACTERISATION OF A KNOWN BUG, and the clearest example in
  // this file of a test certifying a defect as intended. It asserted
  // `order.limit_price === "0.0"` for a block at yPosition 100 - the unclamped
  // reading `calculateYPosition` produced on its 0-100 scale while the axis ran
  // to 50 - and then that validation caught it. The expectation was right about
  // the validator and wrong about everything upstream of it: an ordinary drag
  // to the bottom of a cell could price an order at nothing.
  //
  // The reading is gone and every position now flows through `clampOffset`, so
  // the mapper cannot emit a zero price at all. What is asserted is the pair of
  // facts that replaced it: no position produces one, and `validateOrder` still
  // rejects one if some future caller hands it one directly.
  it("cannot be made to emit a zero price by any position", () => {
    for (const yPosition of [50, 75, 100, 1000]) {
      const [order] = mapGridToOrders(
        gridWith([
          { col: 0, row: 1, block: blockData({ yPosition, direction: "downside" }) },
        ]),
        { market: BTC_USD, currentPrice: 76_689, quantity: "0.5" },
      );

      expect(Number(order.limit_price)).toBeGreaterThan(0);
      expect(validateOrder(order)).toEqual([]);
    }
  });

  // A non-finite position is a bug upstream, and the question is what the order
  // path does with one. `clampOffset` answers it with an offset of zero for the
  // benefit of the chip, which cannot draw `NaN%` - but zero is the market
  // price, a perfectly finite and positive number that `validateOrder` accepts,
  // so absorbing it here would submit an at-market limit order in place of a
  // corrupt one. `offsetForOrder` keeps it non-finite for exactly this reason.
  it("refuses a non-finite position rather than pricing it at the market", () => {
    const [order] = mapGridToOrders(
      gridWith([
        {
          col: 0,
          row: 1,
          block: blockData({ yPosition: Number.NaN, direction: "downside" }),
        },
      ]),
      { market: BTC_USD, currentPrice: 76_689, quantity: "0.5" },
    );

    expect(Number(order.limit_price)).not.toBe(76_689);
    expect(Number.isFinite(Number(order.limit_price))).toBe(false);
    expect(validateOrder(order)).toContain(
      "Limit price must be a finite number",
    );
  });

  it("still rejects a zero price handed straight to it", () => {
    expect(
      validateOrder({
        order_type: "limit",
        side: "buy",
        order_qty: "0.5",
        symbol: "BTC/USD",
        limit_price: "0.0",
      }),
    ).toContain(LIMIT_PRICE_ERROR);
  });

  it("still accepts the prices the grid actually produces", () => {
    expect(
      validateOrder({
        order_type: "stop-loss-limit",
        side: "buy",
        order_qty: "0.5",
        symbol: "BTC/USD",
        limit_price: "69986.5",
        triggers: { reference: "last", price: "66098.4", price_type: "static" },
      }),
    ).toEqual([]);
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

  // The same incomplete stop-loss-limit has to be rejected wherever it sits in
  // the payload. As a conditional it used to validate clean, so the guarantee
  // that a split dual-axis leg fails validation held on the primary half only.
  it("holds a conditional close to the same required-price rules as a primary", () => {
    const splitLeg = {
      order_type: "stop-loss-limit",
      trigger_price: "66098.4",
      trigger_price_type: "static",
    } as const;

    expect(
      validateOrder({
        order_type: "stop-loss-limit",
        side: "buy",
        order_qty: "0.5",
        symbol: "BTC/USD",
        triggers: { reference: "last", price: "66098.4", price_type: "static" },
      }),
    ).toContain("Limit price is required for stop-loss-limit orders");

    expect(
      validateOrder({
        ...valid,
        conditional: splitLeg,
      }),
    ).toContain(
      "Conditional limit price is required for stop-loss-limit conditional closes",
    );
  });

  it("requires the conditional's trigger price on a trigger-style conditional", () => {
    expect(
      validateOrder({
        ...valid,
        conditional: { order_type: "take-profit" },
      }),
    ).toEqual([
      "Conditional trigger price is required for take-profit conditional closes",
    ]);
  });

  it("accepts a complete conditional close", () => {
    expect(
      validateOrder({
        ...valid,
        conditional: {
          order_type: "stop-loss-limit",
          limit_price: "37000.0",
          limit_price_type: "static",
          trigger_price: "37500.0",
          trigger_price_type: "static",
        },
      }),
    ).toEqual([]);
  });

  it("rejects a zero top-level trigger price", () => {
    expect(
      validateOrder({
        order_type: "stop-loss-limit",
        side: "buy",
        order_qty: "0.5",
        symbol: "BTC/USD",
        limit_price: "69986.5",
        trigger_price: "0.0",
        trigger_price_type: "static",
        triggers: { reference: "last", price: "66098.4", price_type: "static" },
      }),
    ).toEqual(["Top-level trigger price must be a positive number"]);
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

  // FORMERLY A CHARACTERISATION OF THE BLAST RADIUS of the id-parsing bug: a
  // stop-loss-limit was relabelled "limit", so validation stopped asking for
  // the trigger that made it a protective order and the payload passed cleanly.
  // The relabelling is gone, so the order arrives here as what it is and the
  // missing trigger is caught.
  it("rejects a stop-loss-limit that has lost its trigger", () => {
    expect(
      validateOrder({
        order_type: "stop-loss-limit",
        side: "buy",
        order_qty: "0.5",
        symbol: "BTC/USD",
        limit_price: "48750.0",
      }),
    ).toContain("Trigger configuration is required for stop-loss-limit orders");
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

// =============================================================================
// PER-ASSET PRECISION ACROSS A WHOLE PAYLOAD
// =============================================================================
//
// This is the suite the multi-market change exists for.
//
// While the app was BTC-only, a formatter that quietly fell back to BTC's rules
// was indistinguishable from a correct one. Adding a market selector makes
// every such fallback reachable, and each one is invisible when it fires:
// Kraken rejects a badly-precised order, and the user sees an order that never
// appeared rather than an error.
//
// So these do not check one field. They build a *complete* order for a non-BTC
// pair - primary limit price, trigger price, conditional limit price,
// conditional trigger price and the quantity - and assert that every one of
// them is formatted for that pair. A field that has been left on a default is a
// field these catch.
//
// ARB/USD is the fixture of choice because every one of its rules differs from
// BTC's: 4 price decimals against 1, a 0.0001 tick against 0.1, 5 lot decimals
// against 8, and a 60-token minimum order against 0.00005.

describe("per-asset precision across a whole payload", () => {
  const ARB_MARKET = 0.4567891;

  /** A block on ARB's grid, at `yPosition` percent from market. */
  const leg = (
    id: string,
    orderType: string,
    axes: UIBlockData["axes"],
    yPosition: number,
    direction: "upside" | "downside",
  ): UIBlockData =>
    uiBlock({
      id,
      orderType,
      axes,
      direction,
      position: { col: 0, row: 1, yPosition, axis: axes[0] === "trigger" ? 1 : 2 },
    });

  const arbContext = (overrides: Partial<OrderBuildContext> = {}) =>
    context({ market: ARB_USD, currentPrice: ARB_MARKET, ...overrides });

  it("formats every price in a full payload at the pair's precision", () => {
    const params = mapBlockToOrderParams(
      leg("sa-take-profit-limit-2", "take-profit-limit", ["limit"], 20, "upside"),
      arbContext({ quantity: "125.5" }),
      leg("sa-stop-loss-limit-1", "stop-loss-limit", ["trigger"], 10, "downside"),
    );

    // ARB prices to four decimals, and the price fields sit in three different
    // places in the payload. Every one of them is four decimals - not the one
    // BTC would give, and not the six the old magnitude rule gave a sub-$1
    // price.
    const priced = [params.limit_price, params.conditional?.trigger_price];

    expect(priced).toEqual(["0.5481", "0.4111"]);
    priced.forEach((price) => {
      expect(price).toMatch(/^\d+\.\d{4}$/);
    });

    // ...and the same order on BTC's rules would have produced one decimal, so
    // the assertion above is really about the pair rather than about the number.
    expect(
      mapBlockToOrderParams(
        leg("sa-limit-1", "limit", ["limit"], 20, "upside"),
        context({ market: BTC_USD, currentPrice: 50_000 }),
      ).limit_price,
    ).toBe("60000.0");
  });

  it("formats the trigger price and the limit price at the same precision", () => {
    // The defect this replaces: `limit_price` took the context symbol while
    // `buildTrigger` never received one and fell back to BTC's. The two legs of
    // a dual-axis type are separate blocks, so each formatter is driven with
    // the leg that reaches it and both are held to the same answer.
    const ctx = arbContext();
    const at = (yPosition: number) => ({
      trigger: mapBlockToOrderParams(
        leg("sa-stop-loss-limit-1", "stop-loss-limit", ["trigger"], yPosition, "downside"),
        ctx,
      ).triggers?.price,
      limit: mapBlockToOrderParams(
        leg("sa-stop-loss-limit-limit-2", "stop-loss-limit", ["limit"], yPosition, "downside"),
        ctx,
      ).limit_price,
    });

    const { trigger, limit } = at(15);
    expect(trigger).toBe("0.3883");
    expect(trigger).toBe(limit);
  });

  it("formats the quantity to the pair's lot precision, not BTC's", () => {
    // ARB takes five lot decimals; BTC takes eight. A quantity carrying more
    // decimals than the pair accepts is rejected exactly as silently as a bad
    // price, and the quantity used to be copied into the payload untouched.
    const arb = mapBlockToOrderParams(
      leg("sa-limit-1", "limit", ["limit"], 10, "downside"),
      arbContext({ quantity: "125.123456789" }),
    );
    expect(arb.order_qty).toBe("125.12346");

    const btc = mapBlockToOrderParams(
      leg("sa-limit-1", "limit", ["limit"], 10, "downside"),
      context({ market: BTC_USD, currentPrice: 50_000, quantity: "125.123456789" }),
    );
    expect(btc.order_qty).toBe("125.12345679");

    // A quantity the pair can express exactly is left alone: `lot_decimals` is
    // a maximum, so half a bitcoin stays "0.5" rather than becoming "0.50000000".
    expect(
      mapBlockToOrderParams(
        leg("sa-limit-1", "limit", ["limit"], 10, "downside"),
        context({ market: BTC_USD, currentPrice: 50_000, quantity: "0.5" }),
      ).order_qty,
    ).toBe("0.5");
  });

  it("names the pair the prices were formatted for", () => {
    // The symbol and the precision come from one record, so a payload cannot
    // say ARB/USD while carrying prices formatted for something else.
    const params = mapBlockToOrderParams(
      leg("sa-limit-1", "limit", ["limit"], 10, "downside"),
      arbContext({ quantity: "125.5" }),
    );
    expect(params.symbol).toBe("ARB/USD");
    // And ARB's own rules accept it outright: the prices carry ARB's four
    // decimals and the quantity clears ARB's 60-token minimum, so there is
    // nothing for the validator to object to.
    expect(validateOrder(params, ARB_USD)).toEqual([]);
  });

  it("holds every price in a mapped grid to the same pair", () => {
    // The grid-level entry point, rather than the single-block one, because
    // that is the path Execute actually takes.
    const grid = gridWith([
      {
        col: 0,
        row: 1,
        block: blockData({ id: "sa-limit-1", yPosition: 12.5, direction: "downside" }),
      },
      {
        col: 1,
        row: 0,
        block: blockData({
          id: "sa-take-profit-2",
          orderType: "take-profit",
          axis: 1,
          axes: ["trigger"],
          yPosition: 30,
          direction: "upside",
        }),
      },
    ]);

    const orders = mapGridToOrders(grid, {
      market: ARB_USD,
      currentPrice: ARB_MARKET,
      quantity: "80",
    });

    const everyPrice = orders.flatMap((order) =>
      [
        order.limit_price,
        order.triggers?.price,
        order.trigger_price,
        order.conditional?.limit_price,
        order.conditional?.trigger_price,
      ].filter((price): price is string => price !== undefined),
    );

    expect(everyPrice.length).toBeGreaterThan(0);
    everyPrice.forEach((price) => {
      expect(price).toMatch(/^\d+\.\d{4}$/);
    });
    expect(orders.every((order) => order.symbol === "ARB/USD")).toBe(true);
  });

  it("snaps a price to the pair's tick rather than only its decimals", () => {
    // `tick_size` and `pair_decimals` agree on every pair shipped today, so
    // this drives the formatter with a record where they do not - which is the
    // only way to tell a tick check from a `toFixed`.
    const fiveCentTick = { ...ARB_USD, priceDecimals: 2, tickSize: 0.05 };
    const params = mapBlockToOrderParams(
      leg("sa-limit-1", "limit", ["limit"], 0, "downside"),
      context({ market: fiveCentTick, currentPrice: 10.13 }),
    );

    expect(params.limit_price).toBe("10.15");
  });
});

// =============================================================================
// PER-ASSET MINIMUM ORDER SIZE
// =============================================================================

describe("validateOrder against a pair's minimum order size", () => {
  const arbOrder = (order_qty: string) => ({
    order_type: "limit" as const,
    side: "buy" as const,
    order_qty,
    symbol: "ARB/USD",
    limit_price: "0.4567",
    limit_price_type: "static" as const,
  });

  // Kraken's minimum spans three orders of magnitude across the pairs on offer:
  // 0.00005 BTC against 60 ARB. A quantity that is a perfectly good BTC order
  // is refused outright on ARB, and refused *after* submission unless it is
  // caught here.
  it("refuses a quantity below the pair's minimum", () => {
    expect(validateOrder(arbOrder("10"), ARB_USD)).toContain(
      "Order quantity 10 is below the ARB/USD minimum of 60",
    );
  });

  it("accepts the same quantity on a pair whose minimum is lower", () => {
    expect(
      validateOrder({ ...arbOrder("10"), symbol: "BTC/USD" }, BTC_USD),
    ).toEqual([]);
  });

  it("accepts a quantity at the minimum", () => {
    expect(validateOrder(arbOrder("60"), ARB_USD)).toEqual([]);
  });

  // Without the metadata there is no minimum to check against, and inventing
  // one would be the guess this whole change removes. The rest of validation
  // still runs.
  it("skips the minimum when no precision record is supplied", () => {
    expect(validateOrder(arbOrder("10"))).toEqual([]);
  });

  // A record for a different pair is worse than none: it would hold a BTC order
  // to ARB's 60-token minimum. Saying so is the only safe answer.
  it("refuses to check an order against another pair's rules", () => {
    expect(validateOrder(arbOrder("100"), ETH_USD)).toContain(
      "Order is for ARB/USD but was checked against ETH/USD rules",
    );
  });
});
