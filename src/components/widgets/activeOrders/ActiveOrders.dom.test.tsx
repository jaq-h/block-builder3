// @vitest-environment jsdom
//
// A refused strategy load has to reach the person who pressed Edit.
//
// The grid announces it, but only into `LiveAnnouncer`'s region inside the
// assembly panel - and below `lg` that panel carries `display: none`, which
// takes the whole subtree out of the accessibility tree, so the announcement
// reaches nobody at all. A sighted user on any width sees a button that did
// nothing. This is the half that is on screen, in the group the press came
// from.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ActiveOrders from "./ActiveOrders";
import { OrdersStoreProvider } from "@store/OrdersStore";
import type {
  ActiveOrderEntry,
  ActiveOrdersConfig,
} from "@/types/activeOrders";

// =============================================================================
// HARNESS
// =============================================================================

const entry = (
  overrides: Partial<ActiveOrderEntry> & { id: string },
): ActiveOrderEntry => ({
  orderId: `ORD-${overrides.id}`,
  strategyId: "STR-ARB",
  symbol: "ARB/USD",
  col: 0,
  row: 1,
  type: "limit",
  yPosition: 10,
  direction: "downside",
  status: "pending",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  ...overrides,
});

const orders: ActiveOrdersConfig = {
  "sa-limit-1": entry({ id: "sa-limit-1" }),
  "sa-limit-2": entry({
    id: "sa-limit-2",
    strategyId: "STR-BTC",
    symbol: "BTC/USD",
    col: 1,
    // Older, so the ARB strategy is the first group the panel lists.
    createdAt: new Date("2023-01-01T00:00:00Z"),
  }),
};

const panel = (
  refusedStrategy?: { strategyId: string | null; symbol: string } | null,
  onEditGroup = vi.fn(),
) => {
  const view = render(
    <OrdersStoreProvider>
      <ActiveOrders
        initialOrders={orders}
        onEditGroup={onEditGroup}
        refusedStrategy={refusedStrategy}
      />
    </OrdersStoreProvider>,
  );
  return { ...view, onEditGroup, user: userEvent.setup() };
};

const refusal = () => screen.queryByText(/^Not loaded:/);

// =============================================================================
// TESTS
// =============================================================================

describe("a strategy whose market is no longer on offer", () => {
  it("says nothing while nothing has been refused", () => {
    panel(null);

    expect(refusal()).toBeNull();
  });

  it("shows the refusal on the strategy it was pressed on", () => {
    panel({ strategyId: "STR-ARB", symbol: "ARB/USD" });

    const message = refusal();
    expect(message).not.toBeNull();
    // The pair is named, because the point of the refusal is that this
    // strategy's prices mean something else on the pair now selected.
    expect(message).toHaveTextContent("ARB/USD");
  });

  it("shows it once, on that strategy and not on the others", () => {
    panel({ strategyId: "STR-ARB", symbol: "ARB/USD" });

    const messages = screen.getAllByText(/^Not loaded:/);
    expect(messages).toHaveLength(1);

    // Same group as the Edit button that was pressed: an unrelated strategy
    // carrying the message would name a market it was never placed on.
    const group = messages[0].closest("div");
    expect(group?.textContent).toContain("Entry Order");
    expect(group?.textContent).not.toContain("Exit Order");
  });

  it("still hands a pressable strategy to the builder", async () => {
    const { user, onEditGroup } = panel(null);

    await user.click(screen.getAllByRole("button", { name: /Edit/ })[0]);

    expect(onEditGroup).toHaveBeenCalledTimes(1);
    expect(onEditGroup.mock.calls[0][0][0]).toMatchObject({
      strategyId: "STR-ARB",
    });
  });
});
