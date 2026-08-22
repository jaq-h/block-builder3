// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

import { useKrakenAPI } from "./useKrakenAPI";
import { MarketProvider } from "@store/MarketProvider";
import { useMarket } from "@store/useMarket";
import { resetTradingMode, resetWebSocketManager, STATUS_ENDPOINT } from "@/api";
import { KRAKEN_ASSET_PAIRS_RESPONSE } from "@/test/marketFixtures";

// =============================================================================
// THE TICKER FOLLOWS THE SELECTED MARKET, AND ONLY THE SELECTED MARKET
// =============================================================================
//
// Switching pair leaves the previous pair's REST request in flight, and it can
// resolve *after* the new pair's. The response is filed under the market it was
// asked for, so a late one has to be dropped rather than written back: writing
// it retags the state with a pair nobody is looking at, and the hook then
// reports no price at all - every grid chip falls back to "Loading price..."
// and the order path refuses until the next tick arrives.

/** A `/0/public/Ticker` body, in Kraken's own shape, for one price. */
const tickerBody = (krakenPair: string, last: string) => ({
  error: [],
  result: {
    [krakenPair]: {
      a: [last, "1", "1"],
      b: [last, "1", "1"],
      c: [last, "0.1"],
      v: ["1", "1"],
      p: [last, last],
      t: [1, 1],
      l: [last, last],
      h: [last, last],
      o: last,
    },
  },
});

/**
 * Answers each ticker request only when the test says so, so the two responses
 * can be made to land in the opposite order to the requests.
 */
const deferredTicker = () => {
  const pending = new Map<string, (body: unknown) => void>();

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes(STATUS_ENDPOINT)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          mode: "simulation",
          liveAvailable: false,
          errors: [],
        }),
      } as Response;
    }

    if (url.includes("/0/public/AssetPairs")) {
      return {
        ok: true,
        status: 200,
        json: async () => KRAKEN_ASSET_PAIRS_RESPONSE,
      } as Response;
    }

    const pair = new URL(url, "http://localhost").searchParams.get("pair")!;
    const body = await new Promise<unknown>((resolve) => {
      pending.set(pair, resolve);
    });

    return { ok: true, status: 200, json: async () => body } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    /** Wait until a request for this pair is in flight. */
    inFlight: (pair: string) => waitFor(() => expect(pending.has(pair)).toBe(true)),
    /** Answer the in-flight request for this pair with a price. */
    answer: async (pair: string, last: string) => {
      const resolve = pending.get(pair)!;
      pending.delete(pair);
      await act(async () => {
        resolve(tickerBody(pair, last));
      });
    },
  };
};

const Probe = () => {
  const { tickerData, currentPrice, isLoadingTicker } = useKrakenAPI({
    autoConnect: false,
    pollInterval: 0,
  });
  const { market, selectMarket } = useMarket();

  return (
    <div>
      <span data-testid="selected">{market.symbol}</span>
      <span data-testid="ticker-symbol">{tickerData?.symbol ?? "none"}</span>
      <span data-testid="price">{currentPrice ?? "none"}</span>
      <span data-testid="loading">{String(isLoadingTicker)}</span>
      <button type="button" onClick={() => selectMarket("ETH/USD")}>
        pick eth
      </button>
    </div>
  );
};

beforeEach(() => {
  resetTradingMode();
  resetWebSocketManager();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTradingMode();
  resetWebSocketManager();
});

describe("useKrakenAPI's ticker across a market switch", () => {
  it("drops a response for the previous market that lands after the new one", async () => {
    const ticker = deferredTicker();

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    // BTC's request is in flight and deliberately left unanswered.
    await ticker.inFlight("XBTUSD");

    await act(async () => {
      screen.getByRole("button", { name: "pick eth" }).click();
    });
    expect(screen.getByTestId("selected")).toHaveTextContent("ETH/USD");

    // ETH answers first: the grid is priced against the pair on screen.
    await ticker.inFlight("ETHUSD");
    await ticker.answer("ETHUSD", "3456.78");

    expect(screen.getByTestId("ticker-symbol")).toHaveTextContent("ETH/USD");
    expect(screen.getByTestId("price")).toHaveTextContent("3456.78");

    // Now BTC's, late. Before the guard this retagged the state as BTC/USD, and
    // because the tag no longer matched the selection the hook reported *no*
    // price - not a stale one, none at all.
    await ticker.answer("XBTUSD", "109000.5");

    expect(screen.getByTestId("ticker-symbol")).toHaveTextContent("ETH/USD");
    expect(screen.getByTestId("price")).toHaveTextContent("3456.78");
  });

  it("keeps showing the request as in flight until the current market answers", async () => {
    const ticker = deferredTicker();

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await ticker.inFlight("XBTUSD");

    await act(async () => {
      screen.getByRole("button", { name: "pick eth" }).click();
    });
    await ticker.inFlight("ETHUSD");

    // The previous market's response says nothing about whether the pair the
    // user is waiting on has arrived, so it must not clear the spinner.
    await ticker.answer("XBTUSD", "109000.5");
    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    await ticker.answer("ETHUSD", "3456.78");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });
});
