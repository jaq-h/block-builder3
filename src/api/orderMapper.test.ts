import { describe, it, expect } from "vitest";

import {
  blockDataToUIBlock,
  calculateBlockPrice,
  createOrderPreview,
  extractBlocksFromGrid,
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
import { calculatePrice, shouldBeDescending } from "@utils/grid";

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

// An Entry limit in the primary row: `shouldBeDescending(1, 0, "conditional")`
// is true, so the grid draws it below market and stamps it "downside".
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
        const isDescending = shouldBeDescending(row, col, "conditional");
        const displayed = calculatePrice(market, 25, isDescending);
        const sent = calculateBlockPrice(
          uiBlock({
            direction: isDescending ? "downside" : "upside",
            position: { col, row, yPosition: 25, axis: 2 },
          }),
          market,
        );

        expect(sent).toBe(displayed);
      });
    });
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

  // A BTC-QUOTED pair is not a BTC pair. The precision used to be chosen with
  // `symbol.includes("BTC")`, checked before the magnitude rules, so ETH/BTC
  // took BTC precision and a price of 0.034512 was sent as "0.0".
  it("uses the base asset, not any appearance of BTC in the pair", () => {
    expect(formatPriceForAPI(0.034512, "ETH/BTC")).toBe("0.034512");
    expect(formatPriceForAPI(50_123.456, "BTC/USD")).toBe("50123.5");
  });

  it("always returns a string, never a number", () => {
    expect(typeof formatPriceForAPI(50_000, "BTC/USD")).toBe("string");
  });
});

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
    );

    expect(ui).toMatchObject({
      id: "sa-take-profit-4",
      orderType: "take-profit",
      abrv: "Lmt",
      position: { col: 1, row: 0, yPosition: 40, axis: 1 },
    });
  });

  it("carries the block's direction through, so the price can be rebuilt", () => {
    expect(blockDataToUIBlock(blockData({ direction: "upside" }), 0, 1))
      .toMatchObject({ direction: "upside" });
    expect(blockDataToUIBlock(blockData({ direction: "downside" }), 0, 1))
      .toMatchObject({ direction: "downside" });
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

    expect(blockDataToUIBlock(block, 0, 2).orderType).toBe("stop-loss-limit");
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
        expect(blockDataToUIBlock(block, 0, 1).orderType).toBe(orderType.type);
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
          blockDataToUIBlock(block, 0, 1),
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
    const ctx = context({ symbol: "ETH/USD", currentPrice: 2_345.6789 });
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
      context({ symbol: "ETH/USD", currentPrice: 2_345.6789 }),
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

  it("refuses to attach an order type Kraken cannot use as a conditional", () => {
    const params = mapBlockToOrderParams(uiBlock(), context(), {
      id: "sa-market-2",
      orderType: "market",
      abrv: "Mkt",
      position: { col: 0, row: 1, yPosition: 0, axis: 1 },
      direction: "upside",
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
      symbol: "BTC/USD",
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
      symbol: "BTC/USD",
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
        symbol: "BTC/USD",
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
      symbol: "BTC/USD",
      currentPrice: MARKET_PRICE,
      quantity: "1",
    };

    expect(() => mapGridToOrders(threeWay, ctx)).toThrow(/a -> b -> c -> a/);
    expect(() => mapGridToOrders(selfLink, ctx)).toThrow(/a -> a/);
  });

  it("still maps a grid whose links form a chain rather than a cycle", () => {
    const grid = gridWith([
      { col: 0, row: 1, block: blockData({ id: "a", linkedBlockId: "b" }) },
      { col: 1, row: 0, block: blockData({ id: "b" }) },
    ]);

    expect(
      mapGridToOrders(grid, {
        symbol: "BTC/USD",
        currentPrice: MARKET_PRICE,
        quantity: "1",
      }),
    ).toHaveLength(1);
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
// THE STRATEGY A USER ACTUALLY BUILDS
// =============================================================================

/**
 * Places an order type the way the grid does: the real block factory builds the
 * blocks, and `shouldBeDescending` stamps each one's direction from the cell it
 * lands in. Nothing here is a re-implementation - these are the same two calls
 * `GridArea` makes on drop.
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

  return blocks.map((block, index) => ({
    ...block,
    yPosition: positions[index],
    direction: shouldBeDescending(row, col, "conditional", block.orderType)
      ? ("downside" as const)
      : ("upside" as const),
  }));
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
      symbol: "BTC/USD",
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
      formatPriceForAPI(calculatePrice(MARKET, position, true) ?? 0, "BTC/USD");

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
