// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { MarketProvider } from "./MarketProvider";
import { useMarket } from "./useMarket";
import { ARB_USD, BTC_USD } from "@/test/marketFixtures";

// =============================================================================
// THE PROVIDER LOADS KRAKEN'S RULES, WITHOUT REACHING KRAKEN IN A TEST
// =============================================================================
//
// The provider fetches `/0/public/AssetPairs` on mount, and `App` wraps the
// whole tree in it - so before `src/test/setup.ts` answered that request from a
// fixture, every test that rendered `App` made a real call to the exchange.
// That is the dependency the fixtures exist to remove: CI must not pass or fail
// on whether api.kraken.com is reachable.
//
// These cover both halves of that: the precision the provider hands out is
// Kraken's own per-pair record, and no request leaves the process to get it.

const Probe = () => {
  const { market, precision, metadataError } = useMarket();
  return (
    <div>
      <span data-testid="symbol">{market.symbol}</span>
      <span data-testid="decimals">{precision?.priceDecimals ?? "none"}</span>
      <span data-testid="order-min">{precision?.orderMin ?? "none"}</span>
      <span data-testid="error">{metadataError ?? "none"}</span>
    </div>
  );
};

describe("MarketProvider", () => {
  it("hands out Kraken's own rules for the selected pair", async () => {
    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("decimals")).toHaveTextContent(
        String(BTC_USD.priceDecimals),
      );
    });
    expect(screen.getByTestId("order-min")).toHaveTextContent(
      String(BTC_USD.orderMin),
    );
    expect(screen.getByTestId("error")).toHaveTextContent("none");
  });

  it("follows the pair it was opened on rather than the catalogue default", async () => {
    render(
      <MarketProvider
        initialMarket={{
          symbol: "ARB/USD",
          base: "ARB",
          quote: "USD",
          name: "Arbitrum",
          quotePrefix: "$",
        }}
      >
        <Probe />
      </MarketProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("decimals")).toHaveTextContent(
        String(ARB_USD.priceDecimals),
      );
    });
    // Four decimals against BTC's one, and a 60-token minimum against 0.00005:
    // reading the wrong record here is exactly how an order gets rejected for
    // bad precision and reaches the user as an order that never appeared.
    expect(screen.getByTestId("order-min")).toHaveTextContent(
      String(ARB_USD.orderMin),
    );
  });

  // The suite's `fetch` answers Kraken's AssetPairs endpoint from the fixture
  // and refuses everything else, so a test that reaches for the network is a
  // loud failure rather than a quiet round trip to somebody else's server.
  it("gets those rules without the suite being able to reach the network", async () => {
    await expect(
      fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD"),
    ).rejects.toThrow(/makes no network requests/);

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("decimals")).not.toHaveTextContent("none");
    });
  });

  // The honest state when Kraken cannot be reached: no precision for anything,
  // so the order path refuses to build a payload instead of pricing an ARB
  // order to BTC's one decimal place.
  it("reports the failure and prices nothing when the metadata cannot be read", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("offline");
    });
    expect(screen.getByTestId("decimals")).toHaveTextContent("none");

    vi.restoreAllMocks();
  });
});
