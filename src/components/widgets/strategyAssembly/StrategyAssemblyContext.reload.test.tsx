// @vitest-environment jsdom
//
// The RELOAD path: a saved OrderConfig -> the grid the provider rehydrates from
// it -> the Kraken payloads the mapper builds. The freshly-built path is
// covered by the end-to-end suite in src/api/orderMapper.test.ts and does not
// exhibit what is pinned here, because a block placed by the block factory
// already carries only its own axis.
import { describe, it, expect } from "vitest";
import { useEffect } from "react";
import { render } from "@testing-library/react";

import { StrategyAssemblyProvider } from "@widgets/strategyAssembly/StrategyAssemblyContext";
import { useGridData } from "@widgets/strategyAssembly/contexts";
import { mapGridToOrders, validateOrder } from "@api/orderMapper";
import type { OrderParams } from "@api/types";
import { orderConfigFromGrid } from "@utils/blockMapping";
import type { GridData, OrderConfig } from "@/types/grid";
import { BTC_USD } from "@/test/marketFixtures";

// =============================================================================
// HARNESS
// =============================================================================

const MARKET_PRICE = 77_762.8;

const Probe = ({ onGrid }: { onGrid: (grid: GridData) => void }): null => {
  const { grid } = useGridData();

  useEffect(() => {
    onGrid(grid);
  }, [grid, onGrid]);

  return null;
};

/** The grid the provider rebuilds when it is mounted with a saved config. */
const rehydrate = (config: OrderConfig): GridData => {
  let grid: GridData | undefined;

  render(
    <StrategyAssemblyProvider initialConfig={config}>
      <Probe
        onGrid={(published) => {
          grid = published;
        }}
      />
    </StrategyAssemblyProvider>,
  );

  if (!grid) {
    throw new Error("The provider never published a grid");
  }

  return grid;
};

const ordersFrom = (config: OrderConfig): OrderParams[] =>
  mapGridToOrders(rehydrate(config), {
    market: BTC_USD,
    currentPrice: MARKET_PRICE,
    quantity: "0.5",
  });

// A Stop Loss Limit that was saved from Entry / Primary: its trigger leg (axis
// 1) sits 15% below market and its limit leg (axis 2) sits 10% below.
const savedStopLossLimit: OrderConfig = {
  "sa-stop-loss-limit-1": {
    col: 0,
    row: 1,
    type: "stop-loss-limit",
    axis: 1,
    yPosition: 15,
    direction: "downside",
  },
  "sa-stop-loss-limit-limit-2": {
    col: 0,
    row: 1,
    type: "stop-loss-limit",
    axis: 2,
    yPosition: 10,
    direction: "downside",
  },
};

// =============================================================================
// TESTS
// =============================================================================

describe("a saved strategy reloaded for editing", () => {
  // The hydration path is the one most likely to carry a corrupt position, and
  // it used to be the one that quietly repaired it: `gridFromConfig` clamped on
  // the way in and `normaliseCellDirections` clamped again, so a non-finite
  // saved position was already zero - the market price - before the mapper saw
  // it, and the payload validated cleanly as a plausible at-market order.
  // `?? 0` does not catch it either, since `NaN` is not nullish.
  it("refuses a non-finite saved position rather than pricing it at the market", () => {
    const [order] = ordersFrom({
      "sa-limit-1": {
        col: 0,
        row: 1,
        type: "limit",
        axis: 2,
        yPosition: Number.NaN,
        direction: "downside",
      },
    });

    expect(Number(order.limit_price)).not.toBe(MARKET_PRICE);
    expect(Number.isFinite(Number(order.limit_price))).toBe(false);
    expect(validateOrder(order)).toContain(
      "Limit price must be a finite number",
    );
  });

  it("gives each leg of a dual-axis order type only its own axis", () => {
    const [trigger, limit] = rehydrate(savedStopLossLimit)[0][1];

    expect(trigger.axes).toEqual(["trigger"]);
    expect(limit.axes).toEqual(["limit"]);
  });

  it("keeps a single-axis order type's axis intact", () => {
    const grid = rehydrate({
      "sa-limit-1": {
        col: 0,
        row: 1,
        type: "limit",
        axis: 2,
        yPosition: 25,
        direction: "downside",
      },
      "sa-market-1": { col: 1, row: 1, type: "market" },
    });

    expect(grid[0][1][0].axes).toEqual(["limit"]);
    expect(grid[1][1][0].axes).toEqual([]);
  });

  // The discriminating case for the single-axis guard: a Stop Loss is
  // trigger-only, and `axis: 2` is a state real saved strategies carry - the
  // drop handler used to write the axis from whichever half of the cell the
  // release landed in, without touching the matching `axes`. That reader is
  // gone, but the strategies it saved are not. Deriving the axes from such an
  // axis would hand this block ["limit"], and the mapper would then send a
  // plain limit order sitting at the stop price with no trigger at all - the
  // same relabelling this branch exists to remove. A single-axis type keeps its
  // own axis whatever the saved axis says.
  it("keeps a single-axis stop-loss on its trigger axis when saved at axis 2", () => {
    const savedStopLoss: OrderConfig = {
      "sa-stop-loss-1": {
        col: 0,
        row: 1,
        type: "stop-loss",
        axis: 2,
        yPosition: 15,
        direction: "downside",
      },
    };

    expect(rehydrate(savedStopLoss)[0][1][0].axes).toEqual(["trigger"]);

    const [order] = ordersFrom(savedStopLoss);

    expect(order.order_type).toBe("stop-loss");
    expect(order.triggers?.price).toBe("66098.4");
    expect(order.limit_price).toBeUndefined();
  });

  // Rehydration used to rebuild every block with the ORDER TYPE's full axes
  // list, so each leg came back claiming both "trigger" and "limit". The mapper
  // then read that one leg's single slider twice: both legs came out as a
  // stop-loss-limit whose trigger price EQUALLED its limit price - 66098.4 on
  // one and 69986.5 on the other - instead of one leg carrying 66098.4 as its
  // trigger and the other 69986.5 as its limit price. Unlike the freshly-built
  // case, that payload passes validateOrder cleanly, so nothing caught it.
  it("does not collapse a reloaded stop-loss-limit's two prices into one", () => {
    const orders = ordersFrom(savedStopLossLimit);

    const collapsed = orders.filter(
      (order) =>
        order.limit_price !== undefined &&
        order.limit_price === order.triggers?.price,
    );

    expect(collapsed).toEqual([]);
  });

  // Split 6, stated as the invariant rather than as a workaround for its
  // absence. `axis` used to be rewritten on every drop from the pointer's
  // x-half while `axes` was left alone, so a live grid and the same strategy
  // reloaded could disagree about which leg of a dual-axis order was the
  // trigger - harmless only while a split leg failed validation, and a silent
  // wrong payload the moment the two legs are merged into one order. Nothing
  // rewrites `axis` after a block is built now, and `axesForBlockAxis` is the
  // one derivation of the pair, so the round trip is the identity.
  it("comes back as the same legs the live grid held, and the same payload", () => {
    const live = rehydrate(savedStopLossLimit);
    const reloaded = rehydrate(orderConfigFromGrid(live));

    const legs = (grid: GridData) =>
      grid[0][1].map((block) => ({
        id: block.id,
        axis: block.axis,
        axes: block.axes,
        yPosition: block.yPosition,
        direction: block.direction,
      }));

    expect(legs(reloaded)).toEqual(legs(live));
    expect(legs(reloaded)).toEqual([
      {
        id: "sa-stop-loss-limit-1",
        axis: 1,
        axes: ["trigger"],
        yPosition: 15,
        direction: "downside",
      },
      {
        id: "sa-stop-loss-limit-limit-2",
        axis: 2,
        axes: ["limit"],
        yPosition: 10,
        direction: "downside",
      },
    ]);

    const payload = (grid: GridData) =>
      mapGridToOrders(grid, {
        market: BTC_USD,
        currentPrice: MARKET_PRICE,
        quantity: "0.5",
      });

    expect(payload(reloaded)).toEqual(payload(live));
    expect(payload(live).find((order) => order.triggers)?.triggers?.price).toBe(
      "66098.4",
    );
  });

  it("sends each reloaded leg the price its own slider was left at", () => {
    const orders = ordersFrom(savedStopLossLimit);

    const triggerLeg = orders.find((order) => order.triggers);
    const limitLeg = orders.find((order) => order.limit_price);

    // 15% below 77,762.80, formatted at BTC precision.
    expect(triggerLeg?.triggers?.price).toBe("66098.4");
    expect(triggerLeg?.limit_price).toBeUndefined();

    // 10% below 77,762.80.
    expect(limitLeg?.limit_price).toBe("69986.5");
    expect(limitLeg?.triggers).toBeUndefined();

    expect(triggerLeg).not.toBe(limitLeg);
  });
});
