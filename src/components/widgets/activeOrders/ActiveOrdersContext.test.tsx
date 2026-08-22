// @vitest-environment jsdom
//
// The Active Orders panel rebuilds a grid from submitted orders, which is a
// hydration path just like the assembly grid's. Both have to answer "which leg
// of its order type is this block?" the same way for the same saved order.
import { describe, it, expect } from "vitest";
import { useEffect } from "react";
import { render, cleanup } from "@testing-library/react";

import { ActiveOrdersProvider, useActiveOrders } from "@widgets/activeOrders";
import { StrategyAssemblyProvider } from "@widgets/strategyAssembly/StrategyAssemblyContext";
import { useGridData } from "@widgets/strategyAssembly/contexts";
import { getCellDisplayMode } from "@utils/grid";
import type { ActiveOrderEntry, ActiveOrdersConfig } from "@/types/activeOrders";
import type { GridData, OrderConfig } from "@/types/grid";

// =============================================================================
// HARNESS
// =============================================================================

const Publish = ({
  grid,
  onGrid,
}: {
  grid: GridData;
  onGrid: (grid: GridData) => void;
}): null => {
  useEffect(() => {
    onGrid(grid);
  }, [grid, onGrid]);

  return null;
};

const OrdersProbe = (props: {
  onGrid: (grid: GridData) => void;
}): React.ReactElement => <Publish grid={useActiveOrders().grid} {...props} />;

const AssemblyProbe = (props: {
  onGrid: (grid: GridData) => void;
}): React.ReactElement => <Publish grid={useGridData().grid} {...props} />;

const gridOf = (render_: (onGrid: (g: GridData) => void) => void): GridData => {
  let grid: GridData | undefined;

  render_((published) => {
    grid = published;
  });

  if (!grid) {
    throw new Error("No grid was published");
  }

  return grid;
};

/** The grid the Active Orders panel shows for a set of submitted orders. */
const ordersGrid = (orders: ActiveOrdersConfig): GridData =>
  gridOf((onGrid) => {
    render(
      <ActiveOrdersProvider initialOrders={orders}>
        <OrdersProbe onGrid={onGrid} />
      </ActiveOrdersProvider>,
    );
  });

/** The grid the assembly panel rebuilds for the same saved strategy. */
const assemblyGrid = (config: OrderConfig): GridData =>
  gridOf((onGrid) => {
    render(
      <StrategyAssemblyProvider initialConfig={config}>
        <AssemblyProbe onGrid={onGrid} />
      </StrategyAssemblyProvider>,
    );
  });

// =============================================================================
// FIXTURES
// =============================================================================

const submitted = (
  overrides: Partial<ActiveOrderEntry> = {},
): ActiveOrdersConfig => ({
  "sa-stop-loss-1": {
    id: "sa-stop-loss-1",
    orderId: "OQCLML-BW3P3-BUCMWZ",
    strategyId: "strategy-1",
    symbol: "BTC/USD",
    col: 0,
    row: 1,
    type: "stop-loss",
    axis: 2,
    yPosition: 15,
    direction: "downside",
    status: "active",
    createdAt: new Date("2026-08-21T00:00:00Z"),
    ...overrides,
  },
});

// =============================================================================
// TESTS
// =============================================================================

describe("the grid the Active Orders panel derives from submitted orders", () => {
  // The discriminating case. GridArea's drop handler writes `axis` from the
  // pointer's x-half, so a Stop Loss released in the right half of its cell is
  // saved with axis 2 even though the type is trigger-only. This panel used to
  // read that axis as the whole answer and come back with ["limit"], while the
  // assembly grid reloaded the same order as ["trigger"] - one saved order,
  // two different answers about which leg it is.
  it("keeps a single-axis stop-loss saved at axis 2 on its trigger axis", () => {
    const [block] = ordersGrid(submitted())[0][1];

    expect(block.axes).toEqual(["trigger"]);
  });

  it("agrees with the assembly grid about the same saved stop-loss", () => {
    const orders = ordersGrid(submitted());
    cleanup();

    const assembly = assemblyGrid({
      "sa-stop-loss-1": {
        col: 0,
        row: 1,
        type: "stop-loss",
        axis: 2,
        yPosition: 15,
        direction: "downside",
      },
    });

    expect(orders[0][1][0].axes).toEqual(assembly[0][1][0].axes);
    expect(getCellDisplayMode(orders[0][1])).toBe(
      getCellDisplayMode(assembly[0][1]),
    );
  });

  it("still shows an order whose type is not in the palette", () => {
    const grid = ordersGrid(submitted({ type: "not-a-palette-type" }));

    expect(grid[0][1]).toHaveLength(1);
    expect(grid[0][1][0].axes).toEqual(["limit"]);
  });

  it("gives an order with no axis no axes at all", () => {
    const grid = ordersGrid(submitted({ type: "market", axis: undefined }));

    expect(grid[0][1][0].axes).toEqual([]);
    expect(getCellDisplayMode(grid[0][1])).toBe("no-axis");
  });
});
