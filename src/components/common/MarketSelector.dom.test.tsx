// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FC, ReactNode } from "react";

import MarketSelector from "./MarketSelector";
import { MarketContext, type MarketContextValue } from "@store/MarketContext";
import { MARKETS, findMarket } from "@data/markets";
import { ARB_USD, BTC_USD } from "@/test/marketFixtures";

// =============================================================================
// MARKET SELECTOR
// =============================================================================
//
// The control has to be reachable by keyboard and carry an accessible name, and
// the price beside it has to be drawn at the selected pair's precision - not at
// a fixed two decimals, which is the number of digits that made every market
// look like BTC.

const harness = (
  overrides: Partial<MarketContextValue> = {},
): { Wrapper: FC<{ children: ReactNode }>; selectMarket: ReturnType<typeof vi.fn> } => {
  const selectMarket = vi.fn();
  const market = overrides.market ?? findMarket("BTC/USD")!;
  const precision = overrides.precision ?? BTC_USD;

  const value: MarketContextValue = {
    market,
    precision,
    activeMarket: { market, precision },
    markets: MARKETS,
    selectMarket,
    metadataError: null,
    ...overrides,
  };

  const Wrapper: FC<{ children: ReactNode }> = ({ children }) => (
    <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
  );

  return { Wrapper, selectMarket };
};

describe("MarketSelector", () => {
  it("has an accessible name from a real label", () => {
    const { Wrapper } = harness();
    render(
      <Wrapper>
        <MarketSelector currentPrice={null} />
      </Wrapper>,
    );

    // `getByLabelText` resolves through the accessibility tree, so this fails
    // if the label is decorative text sitting next to the control.
    expect(screen.getByLabelText("Market")).toBe(
      screen.getByRole("combobox", { name: "Market" }),
    );
  });

  it("offers every market in the catalogue, named as well as spelled", () => {
    const { Wrapper } = harness();
    render(
      <Wrapper>
        <MarketSelector currentPrice={null} />
      </Wrapper>,
    );

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(MARKETS.length);
    expect(options.map((option) => option.textContent)).toEqual(
      MARKETS.map((market) => `${market.name} (${market.symbol})`),
    );
  });

  // A native `<select>` is keyboard operable and announces its own value
  // change without any work; that is the reason it is a `<select>` and not a
  // styled button-and-listbox. This pins the behaviour rather than the markup.
  it("selects a market from the keyboard", () => {
    const { Wrapper, selectMarket } = harness();
    render(
      <Wrapper>
        <MarketSelector currentPrice={null} />
      </Wrapper>,
    );

    const select = screen.getByRole("combobox", { name: "Market" });
    select.focus();
    expect(document.activeElement).toBe(select);

    fireEvent.change(select, { target: { value: "SOL/USD" } });
    expect(selectMarket).toHaveBeenCalledWith("SOL/USD");
  });

  it("shows the selected market as the current value", () => {
    const { Wrapper } = harness({
      market: findMarket("ARB/USD")!,
      precision: ARB_USD,
    });
    render(
      <Wrapper>
        <MarketSelector currentPrice={null} />
      </Wrapper>,
    );

    expect(
      (screen.getByRole("combobox", { name: "Market" }) as HTMLSelectElement)
        .value,
    ).toBe("ARB/USD");
  });

  // The readout is the pair's own precision. A flat two decimals draws an ARB
  // price of $0.4568 as "$0.46", which is a different price level.
  it("draws the price at the selected pair's precision", () => {
    const { Wrapper } = harness({
      market: findMarket("ARB/USD")!,
      precision: ARB_USD,
    });
    render(
      <Wrapper>
        <MarketSelector currentPrice={0.4567891} />
      </Wrapper>,
    );

    expect(screen.getByText("$0.4568")).toBeInTheDocument();
  });

  it("says the price is loading rather than showing a stale one", () => {
    const { Wrapper } = harness();
    render(
      <Wrapper>
        <MarketSelector currentPrice={null} />
      </Wrapper>,
    );

    expect(screen.getByText("Loading price…")).toBeInTheDocument();
  });

  it("says so when the feed is failing", () => {
    const { Wrapper } = harness();
    render(
      <Wrapper>
        <MarketSelector currentPrice={null} priceError="boom" />
      </Wrapper>,
    );

    expect(screen.getByText("Price unavailable")).toBeInTheDocument();
  });

  // Without Kraken's rules the order path refuses to build a payload. Saying so
  // here means the refusal is not the first the user hears of it, at the moment
  // they press Execute.
  it("warns when the precision rules could not be loaded", () => {
    const { Wrapper } = harness({
      precision: null,
      metadataError: "Kraken API error: EGeneral:Unavailable",
    });
    render(
      <Wrapper>
        <MarketSelector currentPrice={50_000} />
      </Wrapper>,
    );

    expect(
      screen.getByText(
        "Precision rules unavailable - orders cannot be submitted",
      ),
    ).toBeInTheDocument();
  });

  it("is quiet when the rules loaded fine", () => {
    const { Wrapper } = harness();
    render(
      <Wrapper>
        <MarketSelector currentPrice={50_000} />
      </Wrapper>,
    );

    expect(
      screen.queryByText(
        "Precision rules unavailable - orders cannot be submitted",
      ),
    ).not.toBeInTheDocument();
  });
});
