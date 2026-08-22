// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The assembly panel is stubbed down to the two things this is about - choosing
// a market and submitting - so the test is about what a *submitted* strategy
// remembers rather than about the grid. The orders panel is the real one,
// because its cards and its Edit button are half of what is under test.
vi.mock("./components/widgets/strategyAssembly/strategyAssembly", async () => ({
  default: (await import("@/test/panelStubs")).MarketAssemblyPanelStub,
}));

vi.mock("./components/widgets/orderChart", () => ({
  OrderChart: () => <div data-testid="chart" />,
}));

import App from "./App";
import { resetMountTracker } from "@/test/mountTracker";

// =============================================================================
// A SUBMITTED STRATEGY REMEMBERS ITS MARKET
// =============================================================================
//
// Every position an order records is a percentage offset from a market price,
// so an entry that does not name its pair means whatever pair happens to be
// selected when it is read back. That was harmless while the app traded one
// market; with a selector it is a three-click path to a strategy that reloads
// as a completely different order set with nothing on screen saying so.
//
// The market the stub reports is the *selected* one, so any other mention of a
// pair in the document comes from an order card - which is what makes the
// assertions below unambiguous.

const selectedMarket = () => screen.getByTestId("selected-market");
const editStrategy = () => screen.getByTitle("Edit strategy in builder");

/** Build one order and submit it, under whatever market is selected. */
const submitStrategy = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "build a strategy" }));
  await user.click(screen.getByRole("button", { name: "execute" }));

  // The simulated submission takes 800ms before the order exists.
  await waitFor(() => expect(editStrategy()).toBeInTheDocument(), {
    timeout: 3000,
  });
};

beforeEach(resetMountTracker);

describe("a strategy and the market it was built on", () => {
  it("names the market on the order it was submitted for", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "pick arb" }));
    await submitStrategy(user);

    await user.click(screen.getByRole("button", { name: "pick btc" }));
    expect(selectedMarket()).toHaveTextContent("BTC/USD");

    // The card still says ARB/USD, because that is what the order was placed
    // on. "+25.0%" says nothing at all without the pair it is 25% away from.
    expect(screen.getByText("ARB/USD")).toBeInTheDocument();
  });

  it("comes back on its own market rather than the one now selected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "pick arb" }));
    await submitStrategy(user);
    expect(selectedMarket()).toHaveTextContent("ARB/USD");

    await user.click(screen.getByRole("button", { name: "pick btc" }));
    expect(selectedMarket()).toHaveTextContent("BTC/USD");

    await user.click(editStrategy());

    // Without this the builder reloads an ARB/USD strategy priced against
    // BTC/USD: the same 25% offset, a price five orders of magnitude away, and
    // nothing on screen saying the market changed underneath it.
    expect(selectedMarket()).toHaveTextContent("ARB/USD");
  });
});
