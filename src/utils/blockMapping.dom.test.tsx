// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import GridCell from "@common/grid/GridCell";
import ReadOnlyGridCell from "@common/grid/ReadOnlyGridCell";
import { orderPriceLines } from "@widgets/orderChart/orderPriceLines";
import { mapGridToOrders } from "@api/orderMapper";
import { addBlocksToCell, orderConfigFromGrid } from "@utils/blockMapping";
import { clearGrid } from "@utils/grid";
import { MarketContext, type MarketContextValue } from "@store/MarketContext";
import { MARKETS, findMarket } from "@data/markets";
import { BTC_USD } from "@/test/marketFixtures";
import type { BlockData, GridData } from "@/types/grid";

// =============================================================================
// THE CHIP, THE CHART AND THE PAYLOAD, ON ONE BLOCK
// =============================================================================
//
// The acceptance check for giving the block-to-price mapping one owner. Three
// consumers that used to derive the direction independently are asked what one
// block is worth, and they have to say the same thing:
//
//   - the price chip, read out of a real `GridCell`
//   - the chart's price line, from `orderPriceLines`
//   - the Kraken payload, from `mapGridToOrders`
//
// The scenario is the one reported on 2026-08-21, at the market price it was
// reported at. In a **bulk** cell at $50,000 a Limit is placed first, so the
// cell is stamped "downside"; a Stop Loss dropped beside it would be "upside"
// on its own account. Before this change the cell drew the Stop Loss chip at
// `-25.00% $37,500` while the chart line and the payload both said `62,500` -
// one block, one moment, two prices.

const MARKET_PRICE = 50_000;
const noop = () => {};

const market = findMarket("BTC/USD")!;

// Both halves have to be drawn at a real pair's precision. Without it the
// cell's `useMarket()` falls through to a context with none, every chip reads
// the "no rules for this pair" placeholder, and the assertion compares one
// placeholder to another - passing for whatever price anything computes.
const marketValue: MarketContextValue = {
  market,
  priceFormat: { status: "ready", market, precision: BTC_USD },
  markets: MARKETS,
  selectMarket: () => false,
};

const limit: BlockData = {
  id: "b1",
  orderType: "limit",
  label: "Limit",
  abrv: "Lmt",
  allowedRows: [0, 1, 2],
  axis: 2,
  yPosition: 25,
  direction: "upside",
  axes: ["limit"],
};

const stopLoss: BlockData = {
  id: "s1",
  orderType: "stop-loss",
  label: "Stop Loss",
  abrv: "SL",
  allowedRows: [0, 1, 2],
  axis: 1,
  yPosition: 25,
  direction: "upside",
  axes: ["trigger"],
};

const marketOrder: BlockData = {
  id: "m1",
  orderType: "market",
  label: "Market",
  abrv: "Mkt",
  allowedRows: [1],
  axis: 1,
  yPosition: -1,
  direction: "upside",
  axes: [],
};

/** The Limit lands first, then the Stop Loss - through the one write path. */
const bulkCell = (): GridData => {
  const withLimit = addBlocksToCell(
    clearGrid(2, 3),
    { col: 0, row: 1 },
    [limit],
    "bulk",
  );
  return addBlocksToCell(withLimit, { col: 0, row: 1 }, [stopLoss], "bulk");
};

const renderCell = (blocks: BlockData[]) =>
  render(
    <MarketContext.Provider value={marketValue}>
      <GridCell
        colIndex={0}
        rowIndex={1}
        blocks={blocks}
        isOver={false}
        isValidTarget={false}
        isDisabled={false}
        isCommandTarget={false}
        align="left"
        strategyPattern="bulk"
        rowLabel=""
        showPrimaryWarning={false}
        currentPrice={MARKET_PRICE}
        onMouseEnter={noop}
        onMouseLeave={noop}
        onBlockDragStart={noop}
        onBlockDragEnd={noop}
        onBlockDragCancel={noop}
        onBlockDragAborted={noop}
        onBlockDragRecognised={noop}
        onBlockVerticalDrag={noop}
        onBlockActivate={noop}
        onBlockCommandMove={noop}
        onBlockCommandCancel={noop}
        onBlockAdjustPrice={noop}
        onBlockRemove={noop}
        onCellClear={noop}
        onCellActivate={noop}
        focusBlockId={null}
        onBlockFocusHandled={noop}
      />
    </MarketContext.Provider>,
  );

const ordersFor = (grid: GridData) =>
  mapGridToOrders(grid, {
    market: BTC_USD,
    currentPrice: MARKET_PRICE,
    quantity: "1",
  });

const payloadPrices = (grid: GridData) => {
  const orders = ordersFor(grid);
  return {
    limit: orders.find((o) => o.order_type === "limit")?.limit_price,
    stopLoss: orders.find((o) => o.order_type === "stop-loss")?.triggers?.price,
  };
};

const chartPrices = (grid: GridData) => {
  const lines = orderPriceLines(orderConfigFromGrid(grid), MARKET_PRICE);
  return {
    limit: lines.find((l) => l.id === "b1")?.price,
    stopLoss: lines.find((l) => l.id === "s1")?.price,
  };
};

describe("a bulk cell at $50,000 holding a Limit and a Stop Loss", () => {
  it("draws, charts and sends one price for each block", () => {
    const grid = bulkCell();

    renderCell(grid[0][1]);

    // The cell is descending, so both blocks are 25% BELOW the market.
    expect(screen.getAllByText("$37,500.0")).toHaveLength(2);
    expect(screen.getAllByText("-25.00%")).toHaveLength(2);
    // The number the old chip contradicted. It must appear nowhere on screen.
    expect(screen.queryByText("$62,500.0")).toBeNull();

    expect(chartPrices(grid)).toEqual({ limit: 37_500, stopLoss: 37_500 });
    expect(payloadPrices(grid)).toEqual({
      limit: "37500.0",
      stopLoss: "37500.0",
    });
  });

  it("signs the accessible value the way the chip and the payload read", () => {
    const grid = bulkCell();
    renderCell(grid[0][1]);

    // A `role="slider"` whose value contradicted the chip beside it was the
    // same split reaching a screen-reader user instead of a sighted one.
    for (const name of [/Limit/, /Stop Loss/]) {
      const slider = screen.getByRole("slider", { name });
      expect(slider).toHaveAttribute("aria-valuenow", "-25");
      expect(slider.getAttribute("aria-valuetext")).toBe("-25.00%, $37,500.0");
    }
  });

  it("does not re-price the Stop Loss when the Limit beside it is removed", () => {
    const grid = bulkCell();

    renderCell(grid[0][1]);
    expect(screen.getAllByText("$37,500.0")).toHaveLength(2);
    cleanup();

    // Remove the Limit, which is `blocks[0]` and used to BE the cell's scale.
    grid[0][1] = grid[0][1].filter((block) => block.id !== "b1");

    renderCell(grid[0][1]);
    expect(screen.getAllByText("$37,500.0")).toHaveLength(1);
    expect(screen.queryByText("$62,500.0")).toBeNull();
    expect(chartPrices(grid).stopLoss).toBe(37_500);
    expect(payloadPrices(grid).stopLoss).toBe("37500.0");
  });

  // Stamping is one of two things holding this together, and this is the other.
  // A grid assembled by pushing blocks straight into a cell - which is what
  // every path did before `addBlocksToCell` existed, and what a fixture or a
  // future construction path can still do - carries the two disagreeing
  // directions the defect report described. The chip, the chart and the payload
  // all read the CELL rather than the block, so they still agree; without that
  // read this case is the original split exactly.
  it("agrees even on a grid whose blocks were never stamped", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(
      { ...limit, direction: "downside" },
      { ...stopLoss, direction: "upside" },
    );

    renderCell(grid[0][1]);

    expect(screen.getAllByText("$37,500.0")).toHaveLength(2);
    expect(screen.queryByText("$62,500.0")).toBeNull();
    expect(chartPrices(grid)).toEqual({ limit: 37_500, stopLoss: 37_500 });
    expect(payloadPrices(grid)).toEqual({
      limit: "37500.0",
      stopLoss: "37500.0",
    });
  });

  // The Active Orders panel draws the same cell read-only. It reads the mapping
  // through the same owner, so a submitted order's card cannot show a price the
  // builder never drew.
  it("draws the same price on the read-only card", () => {
    const grid = bulkCell();

    render(
      <MarketContext.Provider value={marketValue}>
        <ReadOnlyGridCell
          colIndex={0}
          rowIndex={1}
          blocks={grid[0][1]}
          currentPrice={MARKET_PRICE}
        />
      </MarketContext.Provider>,
    );

    expect(screen.getAllByText("$37,500.0")).toHaveLength(2);
    expect(screen.queryByText("$62,500.0")).toBeNull();
  });
});

// =============================================================================
// THE ORDER A MARKET ORDER USED TO HIDE
// =============================================================================
//
// Reported 2026-08-30 and reproduced in Chrome at BTC/USD $77,760.7: in the
// bulk pattern, a Market order dropped into Entry row 1 and a Limit dropped
// into the same cell left the cell's whole visible text reading "Market". No
// price, no percentage, no market line and no axis - while the chart beside it
// drew `Entry Lmt 58,320.5` and `mapGridToOrders` emitted
// `limit_price: 58257.5`. `cellDrawsPriceAxis` was `every`, so one axis-less
// block flattened the cell, and the order path never asked it at all. A
// resting buy limit 25% below the market that the user was never shown and,
// wired to a free drag for want of a leg, could not correct.
//
// The rule is `some` now: the cell keeps its ruler for the orders that are
// placed against it and draws the ones that are not in the at-market strip.

describe("a bulk cell holding a Market order beside a Limit", () => {
  /** The Market lands first, exactly as the reproduction placed it. */
  const mixedCell = (): GridData => {
    const withMarket = addBlocksToCell(
      clearGrid(2, 3),
      { col: 0, row: 1 },
      [marketOrder],
      "bulk",
    );
    return addBlocksToCell(withMarket, { col: 0, row: 1 }, [limit], "bulk");
  };

  it("draws the price it sends, rather than hiding it behind the Market order", () => {
    const grid = mixedCell();

    renderCell(grid[0][1]);

    // The price the payload carries, on screen, where the user placed it.
    expect(screen.getByText("$37,500.0")).toBeInTheDocument();
    expect(screen.getByText("-25.00%")).toBeInTheDocument();

    expect(chartPrices(grid).limit).toBe(37_500);
    expect(payloadPrices(grid).limit).toBe("37500.0");
  });

  it("draws the Market order off the ruler, and sends it with no price", () => {
    const grid = mixedCell();

    renderCell(grid[0][1]);

    // It is in the cell, named, and said to execute at the market - it is not
    // given a position on an axis it has no offset to be placed on.
    expect(screen.getByText("At market")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Market order/ }),
    ).toBeInTheDocument();
    // A slider is a block on a price axis. The Market order is not one, so it
    // offers no arrow keys and reports no value.
    expect(screen.getAllByRole("slider")).toHaveLength(1);

    const market = ordersFor(grid).find((o) => o.order_type === "market");
    expect(market).toBeDefined();
    expect(market?.limit_price).toBeUndefined();
    expect(market?.triggers).toBeUndefined();
  });

  it("keeps the Limit on its axis when the Market order is removed", () => {
    const grid = mixedCell();

    renderCell(grid[0][1]);
    expect(screen.getByText("At market")).toBeInTheDocument();
    cleanup();

    grid[0][1] = grid[0][1].filter((b) => b.id !== "m1");

    renderCell(grid[0][1]);
    expect(screen.queryByText("At market")).toBeNull();
    expect(screen.getByText("$37,500.0")).toBeInTheDocument();
    expect(payloadPrices(grid).limit).toBe("37500.0");
  });

  it("draws the same price on the read-only card", () => {
    const grid = mixedCell();

    render(
      <MarketContext.Provider value={marketValue}>
        <ReadOnlyGridCell
          colIndex={0}
          rowIndex={1}
          blocks={grid[0][1]}
          currentPrice={MARKET_PRICE}
        />
      </MarketContext.Provider>,
    );

    expect(screen.getByText("$37,500.0")).toBeInTheDocument();
    expect(screen.getByText("At market")).toBeInTheDocument();
  });
});
