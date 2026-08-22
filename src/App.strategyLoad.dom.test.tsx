// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The chart is the one panel with a canvas in it, and this test is about what
// the grid says rather than what the chart draws.
vi.mock("./components/widgets/orderChart", () => ({
  OrderChart: () => <div data-testid="chart" />,
}));

// The ticker, which needs a socket and an exchange. Everything downstream of it
// - the grid, the announcer, the submission, the reload - is the real code.
vi.mock("./hooks/useKrakenAPI", () => ({
  useKrakenAPI: () => ({
    currentPrice: 0.4231,
    tickerError: null,
    publicStatus: "connected",
  }),
}));

import App from "./App";
import {
  installPointerCapture,
  type PointerCaptureTracker,
} from "@/test/pointerCapture";

// =============================================================================
// LOADING A SAVED STRATEGY, WITH THE REAL ASSEMBLY PANEL
// =============================================================================
//
// The panel is the real one here, and that is the whole point: `App.markets.
// test.tsx` stubs it, which is exactly why nothing caught the grid saying
// nothing at all on this path.
//
// Pressing Edit calls `selectMarket` and `loadConfig` in one handler, and
// `loadConfig` bumps the key the panel is rendered with - so both updates land
// in one commit and React remounts the whole builder. A `GridArea` that noticed
// market changes by comparing against a ref of its own therefore came up
// already holding the new symbol and had nothing to notice: the market changed
// under every block on the grid, a `<select>` whose value is set
// programmatically says nothing, and the live region that would have spoken was
// itself just remounted.

/** Pointer down, up, and the click a browser appends - in that order. */
const tap = (element: Element) => {
  for (const type of ["pointerdown", "pointerup"]) {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      isPrimary: { value: true },
      pointerType: { value: "touch" },
      clientX: { value: 30 },
      clientY: { value: 0 },
    });
    fireEvent(element, event);
  }
  fireEvent.click(element, { bubbles: true });
};

const cell = (col: number, row: number) =>
  document.querySelector(`[data-col="${col}"][data-row="${row}"]`)!;

const marketSelect = () => screen.getByLabelText("Market");
const editStrategy = () => screen.getByTitle("Edit strategy in builder");

/** Whatever the grid's live region is saying; only one slot holds text. */
const announcement = () =>
  screen
    .getAllByRole("status")
    .map((region) => region.textContent)
    .filter(Boolean)
    .join("");

/** Put one Limit on the grid, the way a tap does, and submit it. */
const buildAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
  tap(screen.getByRole("button", { name: "Add Limit order" }));
  fireEvent.click(cell(0, 1));

  await user.click(screen.getByRole("button", { name: /Execute Trade/ }));

  // The simulated submission takes 800ms before the order exists.
  await waitFor(() => expect(editStrategy()).toBeInTheDocument(), {
    timeout: 3000,
  });
};

let capture: PointerCaptureTracker;

beforeEach(() => {
  capture = installPointerCapture();
});

afterEach(() => {
  capture.restore();
});

describe("loading a saved strategy back into the builder", () => {
  it("says the strategy loaded and that the market moved with it", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(marketSelect(), "ARB/USD");
    await buildAndSubmit(user);

    await user.selectOptions(marketSelect(), "BTC/USD");
    expect(announcement()).toContain("Market changed to Bitcoin");

    await user.click(editStrategy());

    // One sentence for one press of Edit, from the grid's one announcer: the
    // strategy is back, and every block on it is priced from a market five
    // orders of magnitude away from the one the user was just looking at.
    await waitFor(() =>
      expect(announcement()).toBe(
        "Saved strategy loaded onto the grid. The market changed to Arbitrum, so every block is now priced from the ARB/USD market price.",
      ),
    );
    expect(marketSelect()).toHaveValue("ARB/USD");
  });

  // The same press with the market already selected has not moved the user
  // anywhere, and saying it did would be a sentence about something that did
  // not happen - which is the defect this whole module was restructured around.
  it("claims no market change when the strategy comes back on the selected pair", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(marketSelect(), "ARB/USD");
    await buildAndSubmit(user);

    await user.click(editStrategy());

    await waitFor(() =>
      expect(announcement()).toBe(
        "Saved strategy loaded onto the grid, priced from the ARB/USD market price.",
      ),
    );
  });
});
