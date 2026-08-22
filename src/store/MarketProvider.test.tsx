// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

import { MarketProvider } from "./MarketProvider";
import { useMarket } from "./useMarket";
import {
  ARB_USD,
  BTC_USD,
  KRAKEN_ASSET_PAIRS_RESPONSE,
} from "@/test/marketFixtures";

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
  const { market, precision, metadataError, selectMarket } = useMarket();
  return (
    <div>
      <span data-testid="symbol">{market.symbol}</span>
      <span data-testid="decimals">{precision?.priceDecimals ?? "none"}</span>
      <span data-testid="order-min">{precision?.orderMin ?? "none"}</span>
      <span data-testid="error">{metadataError ?? "none"}</span>
      <button type="button" onClick={() => selectMarket("ARB/USD")}>
        pick arb
      </button>
      <button type="button" onClick={() => selectMarket(market.symbol)}>
        pick current
      </button>
    </div>
  );
};

/** The AssetPairs answer, in the shape `fetch` hands back. */
const assetPairsOk = () =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => KRAKEN_ASSET_PAIRS_RESPONSE,
  }) as Response;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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
  });
});

// =============================================================================
// RECOVERY
// =============================================================================
//
// This metadata is a hard prerequisite for the whole order path, so a single
// dropped connection used to disable trading for the rest of the session with a
// page reload as the only way out. These are about getting back from that.

describe("MarketProvider after a failed request", () => {
  it("retries, and prices the grid once a retry succeeds", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(assetPairsOk());

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await act(async () => {});
    expect(screen.getByTestId("decimals")).toHaveTextContent("none");
    expect(screen.getByTestId("error")).toHaveTextContent("network down");

    // The first backoff. Before this, a blip meant no trading until reload.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("decimals")).toHaveTextContent(
      String(BTC_USD.priceDecimals),
    );
    expect(screen.getByTestId("error")).toHaveTextContent("none");
  });

  // A pair Kraken has stopped listing, or a typo in the catalogue, fails
  // identically every time. Retrying that forever is a request loop, not a
  // recovery.
  it("gives up rather than retrying forever", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network down"));

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("asks again when the user picks a market and nothing has loaded", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network down"));

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const afterRetries = fetchSpy.mock.calls.length;

    fetchSpy.mockResolvedValue(assetPairsOk());
    await act(async () => {
      screen.getByRole("button", { name: "pick arb" }).click();
    });

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(afterRetries);
    await act(async () => {});
    expect(screen.getByTestId("decimals")).toHaveTextContent(
      String(ARB_USD.priceDecimals),
    );
  });

  // Switching pair during a slow request must not put a request on the wire per
  // click: the endpoint would take a burst of identical calls for one answer.
  it("does not start a second request while one is in flight", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (async () => {
        await gate;
        return assetPairsOk();
      }) as typeof fetch,
    );

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    const button = screen.getByRole("button", { name: "pick arb" });
    await act(async () => {
      button.click();
      button.click();
      button.click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });
    expect(screen.getByTestId("decimals")).toHaveTextContent(
      String(ARB_USD.priceDecimals),
    );
  });

  // The escape that used to require picking a pair you do not want. Choosing
  // the pair already selected is a React bail-out - `findMarket` hands back the
  // same frozen object - so an effect watching the selection never fires, and
  // the user sitting on the pair they actually want had no way back but reload.
  it("asks again when the user picks the pair that is already selected", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network down"));

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const afterRetries = fetchSpy.mock.calls.length;
    expect(screen.getByTestId("symbol")).toHaveTextContent("BTC/USD");

    fetchSpy.mockResolvedValue(assetPairsOk());
    await act(async () => {
      screen.getByRole("button", { name: "pick current" }).click();
    });

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(afterRetries);
    await act(async () => {});
    expect(screen.getByTestId("symbol")).toHaveTextContent("BTC/USD");
    expect(screen.getByTestId("decimals")).toHaveTextContent(
      String(BTC_USD.priceDecimals),
    );
  });

  // The two moments the environment has actually changed rather than the user
  // merely waiting. A wifi handoff or a captive portal outlasts the four
  // seconds of backoff easily.
  it.each(["focus", "online"])(
    "asks again when the window reports %s",
    async (eventName) => {
      vi.useFakeTimers();
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("network down"));

      render(
        <MarketProvider>
          <Probe />
        </MarketProvider>,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      const afterRetries = fetchSpy.mock.calls.length;

      fetchSpy.mockResolvedValue(assetPairsOk());
      await act(async () => {
        window.dispatchEvent(new Event(eventName));
      });

      expect(fetchSpy.mock.calls.length).toBe(afterRetries + 1);
      await act(async () => {});
      expect(screen.getByTestId("decimals")).toHaveTextContent(
        String(BTC_USD.priceDecimals),
      );
    },
  );

  // Every one of those recoveries goes through the same in-flight flag, or a
  // tab being brought forward while a slow request runs is a second request for
  // the same answer.
  it("starts no second request from a focus, an online event or a re-select while one is in flight", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (async () => {
        await gate;
        return assetPairsOk();
      }) as typeof fetch,
    );

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      screen.getByRole("button", { name: "pick current" }).click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });
    expect(screen.getByTestId("decimals")).toHaveTextContent(
      String(BTC_USD.priceDecimals),
    );
  });

  // Once the rules are in hand there is nothing to recover, and a request per
  // tab switch for the rest of the session is a cost with no purpose.
  it("stops asking once the rules have loaded", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(assetPairsOk());

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
    const afterLoad = fetchSpy.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      screen.getByRole("button", { name: "pick current" }).click();
    });

    expect(fetchSpy.mock.calls.length).toBe(afterLoad);
  });

  it("sets nothing after it has been unmounted", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const errors: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });

    const { unmount } = render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(errors).toEqual([]);
  });
});
