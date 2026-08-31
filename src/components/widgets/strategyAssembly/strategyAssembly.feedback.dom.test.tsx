// @vitest-environment jsdom
//
// The feedback strip's mount gate. The grid, the market row and the action bar
// are stubbed: this is about *when* the strip is on screen, not about anything
// it sits next to.
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
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
      feedbackRef={createRef<HTMLDivElement>()}
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

describe("the panel as a place on the page", () => {
  it("is a region named by its own heading", () => {
    renderPanel();

    // A landmark per panel is what makes the page three places a screen-reader
    // user can jump between rather than one undivided `main`. The name comes
    // from the heading through `aria-labelledby` rather than a second
    // `aria-label`, so the two cannot drift apart.
    const region = screen.getByRole("region", { name: "Strategy Builder" });
    const heading = screen.getByRole("heading", {
      name: "Strategy Builder",
      level: 2,
    });

    expect(region).toContainElement(heading);
    expect(region.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(heading.id).not.toBe("");
  });

  it("claims no layout for that heading", () => {
    renderPanel();

    // This panel's header bar is `PatternSelector`, a group of two buttons with
    // no title in it and a fixed `h-16` that already overflows at narrow widths
    // (`AGENTS.md`, "Known gap"). So the heading is `sr-only`: the panel names
    // itself to the accessibility tree and takes no room to do it.
    expect(
      screen.getByRole("heading", { name: "Strategy Builder", level: 2 }),
    ).toHaveClass("sr-only");
  });
});

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
