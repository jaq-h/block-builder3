// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FC, ReactNode } from "react";

import ReadOnlyGridCell from "./ReadOnlyGridCell";
import { MarketContext, type MarketContextValue } from "@store/MarketContext";
import { MARKETS, findMarket } from "@data/markets";
import { BTC_USD } from "@/test/marketFixtures";
import type { BlockData } from "@/types/grid";

// =============================================================================
// HARNESS
// =============================================================================

const MARKET_PRICE = 100_000;

const limit = (yPosition: number): BlockData => ({
  id: "b1",
  orderType: "limit",
  label: "Limit",
  abrv: "Lmt",
  allowedRows: [0, 1, 2],
  axis: 2,
  yPosition,
  direction: "downside",
  axes: ["limit"],
});

/**
 * Given the opposite direction from the Limit it shares a cell with, on
 * purpose: this fixture is pushed straight into the cell rather than through
 * `addBlocksToCell`, so it is the unstamped grid a card can be handed rather
 * than what the app produces. `directionForNewCell` decides a cell's scale once,
 * when its first block lands, and every later arrival is stamped with it.
 */
const stopLoss = (yPosition: number): BlockData => ({
  id: "s1",
  orderType: "stop-loss",
  label: "Stop Loss",
  abrv: "SL",
  allowedRows: [0, 1, 2],
  axis: 1,
  yPosition,
  direction: "upside",
  axes: ["trigger"],
});

// The panel draws every price at the selected pair's own precision, so the
// expectation has to be built from the same record rather than from a fixed two
// decimals: BTC/USD prices to one, and without a precision nothing is drawn at
// all. Wrapping in the context is what a real render has.
const priceBelowMarket = (yPosition: number) =>
  `$${(MARKET_PRICE * (1 - yPosition / 100)).toLocaleString("en-US", {
    minimumFractionDigits: BTC_USD.priceDecimals,
    maximumFractionDigits: BTC_USD.priceDecimals,
  })}`;

const market = findMarket("BTC/USD")!;

const marketValue: MarketContextValue = {
  market,
  precision: BTC_USD,
  activeMarket: { market, precision: BTC_USD },
  markets: MARKETS,
  selectMarket: () => false,
  metadataError: null,
  metadataSettled: true,
};

const InMarket: FC<{ children: ReactNode }> = ({ children }) => (
  <MarketContext.Provider value={marketValue}>
    {children}
  </MarketContext.Provider>
);

// =============================================================================
// TESTS
// =============================================================================

describe("ReadOnlyGridCell", () => {
  it("describes each block by the price the panel actually shows", () => {
    render(
      <InMarket>
        <ReadOnlyGridCell
          colIndex={0}
          rowIndex={1}
          blocks={[limit(25), stopLoss(7)]}
          currentPrice={MARKET_PRICE}
        />
      </InMarket>,
    );

    // The cell draws one descending scale, taken from the Limit, so the Stop
    // Loss is priced below the market however its own `direction` is stamped.
    // A description signed the other way tells a screen-reader user the order
    // sits above the market when the panel is showing it below.
    expect(screen.getByText("-7.00%")).toBeInTheDocument();
    expect(screen.getByText(priceBelowMarket(7))).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: `Stop Loss trigger price, -7.00%, ${priceBelowMarket(7)}`,
      }),
    ).toBeInTheDocument();
  });

  it("describes a single-family cell on its own scale", () => {
    render(
      <InMarket>
        <ReadOnlyGridCell
          colIndex={0}
          rowIndex={1}
          blocks={[limit(25)]}
          currentPrice={MARKET_PRICE}
        />
      </InMarket>,
    );

    expect(
      screen.getByRole("img", {
        name: `Limit limit price, -25.00%, ${priceBelowMarket(25)}`,
      }),
    ).toBeInTheDocument();
  });
});
