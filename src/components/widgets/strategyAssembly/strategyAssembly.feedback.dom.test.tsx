// @vitest-environment jsdom
//
// The feedback strip's mount gate. The grid, the market row and the action bar
// are stubbed: this is about *when* the strip is on screen, not about anything
// it sits next to.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@widgets/strategyAssembly/components", async () => {
  const actual = await import(
    "@widgets/strategyAssembly/components/ExecuteTradePanel"
  );
  return {
    PatternSelector: () => null,
    GridArea: () => null,
    UtilityButtons: () => null,
    ExecuteTradePanel: actual.default,
  };
});

vi.mock("@common/MarketSelector", () => ({ default: () => null }));

vi.mock("@hooks", () => ({
  useKrakenAPI: () => ({ currentPrice: null, tickerError: null }),
}));

import StrategyAssembly from "@widgets/strategyAssembly/strategyAssembly";

// =============================================================================
// HARNESS
// =============================================================================

const renderPanel = (
  props: Partial<Parameters<typeof StrategyAssembly>[0]> = {},
) =>
  render(
    <StrategyAssembly
      orderCount={0}
      showSuccess={false}
      error={null}
      simulationMessage="Simulation mode"
      isEffectivelySimulation
      canToggle={false}
      isSimulationMode
      onToggleSimulationMode={vi.fn()}
      onViewActiveOrders={vi.fn()}
      {...props}
    />,
  );

const successMessage = () =>
  screen.queryByText(/Orders submitted successfully/);

// =============================================================================
// TESTS
// =============================================================================

describe("the feedback strip", () => {
  it("stays down while there is nothing to say", () => {
    renderPanel();

    expect(successMessage()).not.toBeInTheDocument();
    expect(screen.queryByText("Simulation mode")).not.toBeInTheDocument();
  });

  it("is up while a strategy is being built", () => {
    renderPanel({ orderCount: 2 });

    expect(screen.getByText("Simulation mode")).toBeInTheDocument();
  });

  it("reports a successful submission, which empties the grid as it happens", () => {
    // The bug this pins: `handleExecuteTrade` raises `showSuccess` and calls
    // `setOrderConfig({})` in one React update, so the render carrying the
    // success message is also the first render with `orderCount` back at 0. A
    // gate on `orderCount` alone unmounted the strip on exactly that render,
    // and "Orders submitted successfully!" - with the Active Orders control
    // beside it - was never once visible to a user.
    renderPanel({ orderCount: 0, showSuccess: true });

    expect(successMessage()).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View Active Orders" }),
    ).toBeInTheDocument();
  });

  it("still reports a failed submission, which leaves the grid loaded", () => {
    // The failure path never lost its message: a refused submission keeps the
    // orders on the grid, so `orderCount` was still above zero.
    renderPanel({ orderCount: 2, error: "Kraken refused the order" });

    expect(screen.getByText("Kraken refused the order")).toBeInTheDocument();
  });
});
