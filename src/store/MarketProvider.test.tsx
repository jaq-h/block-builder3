// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

import { MarketProvider } from "./MarketProvider";
import { precisionOf } from "@utils/priceFormatReadiness";
import { useMarket } from "./useMarket";
import {
  ARB_USD,
  BTC_USD,
  KRAKEN_ASSET_PAIRS_RESPONSE,
} from "@/test/marketFixtures";
import { METADATA_TIMEOUT_MS } from "@api/assetMetadata";

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
  const { market, priceFormat, metadataError, selectMarket } = useMarket();
  // The provider hands out one readiness rather than a precision and a settled
  // flag, so this reads both what it says and what it carries. See
  // `utils/priceFormatReadiness.ts`.
  const precision = precisionOf(priceFormat);
  return (
    <div>
      <span data-testid="symbol">{market.symbol}</span>
      <span data-testid="format-status">{priceFormat.status}</span>
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
/**
 * Kraken answering normally about a catalogue it describes none of: HTTP 200,
 * no error, and a result that matches no market this app offers. It resolves
 * through the success path, so it is a settled answer rather than a failure -
 * and asking again cannot change it.
 */
const assetPairsEmpty = () =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ error: [], result: {} }),
  }) as Response;

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
// THE READINESS THE PROVIDER HANDS OUT
// =============================================================================
//
// One value with three states, and this is where they are pinned against the
// provider that produces them rather than against the fold in isolation. What
// makes them worth pinning here is that the two unready states are reached by
// different routes through this file - one is simply "the request has not come
// back", the other is "it came back and said nothing about this pair" - and a
// surface reading them cannot tell which route it took, only which state it is
// in. `utils/priceFormatReadiness.test.ts` is where nothing else is allowed to
// answer the question at all.

describe("MarketProvider's price format readiness", () => {
  const status = () => screen.getByTestId("format-status").textContent;

  it("is pending while the request is in flight, then ready with the rules", async () => {
    let answer: (response: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
    );

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    // The window that used to be indistinguishable from "this pair has no
    // rules", and the one every surface drew a confident wrong value in.
    expect(status()).toBe("pending");
    expect(screen.getByTestId("decimals")).toHaveTextContent("none");

    await act(async () => {
      answer(assetPairsOk());
    });

    await waitFor(() => {
      expect(status()).toBe("ready");
    });
    expect(screen.getByTestId("decimals")).toHaveTextContent("1");
  });

  // Kraken answering normally about a catalogue it describes none of. There is
  // nothing more to wait for, so this is not pending - and asking again returns
  // the same answer.
  it("is unavailable once an answer arrives without the pair", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(assetPairsEmpty());

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await waitFor(() => {
      expect(status()).toBe("unavailable");
    });
    expect(screen.getByTestId("error")).toHaveTextContent("none");
  });

  // The same state by the other route: the request failed rather than answering
  // short. A surface has the same thing to say about both - there are no rules
  // and none are coming - which is why they are one state and not four.
  it("is unavailable when the request fails outright", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await waitFor(() => {
      expect(status()).toBe("unavailable");
    });
    expect(screen.getByTestId("error")).toHaveTextContent("offline");
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
    // The rules being on screen is not yet the provider having finished with
    // them: the render that shows them commits one task before the effect that
    // takes the focus and online listeners back off, and `waitFor` watches the
    // DOM, so it can return inside that window. Flush it, or the listeners the
    // load was supposed to retire are still attached when the events below
    // fire - which is a second request for an answer already in hand, and the
    // exact defect this test exists to catch reported as a flake.
    await act(async () => {});
    const afterLoad = fetchSpy.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      screen.getByRole("button", { name: "pick current" }).click();
    });

    expect(fetchSpy.mock.calls.length).toBe(afterLoad);
  });

  // A successful answer that happens to be empty is still an answer. Gating the
  // recovery on the map being empty rather than on the request having answered
  // left the focus and online listeners attached and `selectMarket` asking
  // again, once per tab switch and once per selection, for the rest of the
  // session - the unbounded request loop the bounded retry exists to avoid.
  it("stops asking after a successful answer that describes no market", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(assetPairsEmpty());

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    await act(async () => {});
    // Nothing is priceable, and the provider says so honestly rather than
    // inventing a rule - it just does not keep asking.
    expect(screen.getByTestId("decimals")).toHaveTextContent("none");
    expect(screen.getByTestId("error")).toHaveTextContent("none");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      screen.getByRole("button", { name: "pick current" }).click();
      screen.getByRole("button", { name: "pick arb" }).click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // The other half of the same rule: a request that FAILED has not answered, so
  // every one of those moments is still worth a retry.
  it("keeps asking after a failed answer, on focus, online and on a selection", async () => {
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
    let seen = fetchSpy.mock.calls.length;

    for (const ask of [
      () => window.dispatchEvent(new Event("focus")),
      () => window.dispatchEvent(new Event("online")),
      () => screen.getByRole("button", { name: "pick current" }).click(),
    ]) {
      await act(async () => {
        ask();
      });
      // Each one asks once; the backoff chain it starts is bounded, and the
      // timers are drained before the next so the counts stay attributable.
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(seen);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      seen = fetchSpy.mock.calls.length;
    }
  });

  // The race the retries themselves introduced. A failure arms a backoff; the
  // tab coming back starts a fresh chain that succeeds; the armed timer was
  // still standing, fired against a provider that no longer needed it, and its
  // failure wrote `metadataError` over a fully populated map. The app then said
  // orders could not be submitted while every chip drew a real price, every
  // payload built fine, and every later tab switch asked again for an answer
  // already in hand.
  it("keeps the rules a later chain loaded when an earlier retry fails", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(assetPairsOk())
      // Anything after the load is a request nothing is waiting for, and its
      // failure is what used to be written over the loaded metadata.
      .mockRejectedValue(new Error("a request nothing was waiting for"));

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    // Attempt 1 fails and arms its retry for one second from now.
    await act(async () => {});
    expect(screen.getByTestId("error")).toHaveTextContent("network down");

    // The tab comes back before that second is up, and its chain succeeds.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => {});
    expect(screen.getByTestId("decimals")).toHaveTextContent(
      String(BTC_USD.priceDecimals),
    );
    expect(screen.getByTestId("error")).toHaveTextContent("none");
    const afterLoad = fetchSpy.mock.calls.length;

    // The armed retry's moment passes, and every later prompt to ask again with
    // it. Both are answered, so neither may put a request on the wire.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(afterLoad);
    expect(screen.getByTestId("error")).toHaveTextContent("none");
    expect(screen.getByTestId("decimals")).toHaveTextContent(
      String(BTC_USD.priceDecimals),
    );
  });

  // The same defect one interleaving deeper, and the shape the test above
  // cannot reach: TWO failures each arm a retry, so there are two live timers
  // and only one slot to hold them in.
  //
  // Trace, with the backoff at one second. Chain 1 fails at t=0 and arms timer
  // A for t=1000. A focus at t=500 starts chain 2 - nothing is in flight
  // between attempts - and it fails too, arming timer B for t=1500 and
  // overwriting the handle to A without clearing it. A still fires at t=1000,
  // and the callback nulls the slot, which is now B's handle rather than its
  // own. From there nothing can clear B: a load that succeeds finds the slot
  // empty, so B fires against a provider holding a complete set of rules and
  // asks Kraken for them again.
  it("supersedes a retry armed by a chain that a later one has replaced", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network still down"))
      .mockResolvedValueOnce(assetPairsOk())
      // Only an orphaned timer can reach this. It is the request the provider
      // no longer needs, and its failure is what lands on the loaded map.
      .mockRejectedValue(new Error("a request nothing was waiting for"));

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    // Chain 1 fails and arms timer A for t=1000.
    await act(async () => {});
    expect(screen.getByTestId("error")).toHaveTextContent("network down");

    // t=500: the tab comes back, starting chain 2 while A is still pending.
    // It fails as well, arming timer B for t=1500 and orphaning A.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // t=1000: A's moment. It belongs to a chain that chain 2 replaced, so it
    // must not ask again - chain 2 owns the retry from here.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // t=1500: B's moment. B is the live chain's own retry, so this one does
    // ask, and it succeeds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("decimals")).toHaveTextContent(
      String(BTC_USD.priceDecimals),
    );
    expect(screen.getByTestId("error")).toHaveTextContent("none");

    // Nothing armed by either chain may outlive the answer: no further request,
    // no failure written over the populated map, and recovery not re-armed.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("error")).toHaveTextContent("none");
    expect(screen.getByTestId("decimals")).toHaveTextContent(
      String(BTC_USD.priceDecimals),
    );
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

// =============================================================================
// A REQUEST THAT NEVER ANSWERS
// =============================================================================
//
// `fetch` waits as long as the browser will let it, and until this request
// answers "this pair has no rules yet" and "this pair has no rules" are the
// same state on screen. An unbounded wait is what turns that transient window
// into a permanent one - the selector's warning suppressed, the chart's plot
// covered and the order path refusing, with nothing saying why.

/**
 * A request that hangs until it is abandoned, and reports every signal it was
 * given so a test can see what the provider did with it.
 */
const hangingFetch = () => {
  const signals: AbortSignal[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(((
    _input: RequestInfo | URL,
    init?: RequestInit,
  ) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      signals.push(signal);
      signal.addEventListener("abort", () =>
        reject(new Error("The request was aborted")),
      );
    })) as unknown as typeof fetch);
  return { spy, signals };
};

describe("MarketProvider when Kraken never answers", () => {
  it("ends in the ordinary failure path rather than waiting", async () => {
    vi.useFakeTimers();
    hangingFetch();

    render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    // Still honestly nothing: not known yet is not the same as known absent.
    await act(async () => {});
    expect(screen.getByTestId("error")).toHaveTextContent("none");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(METADATA_TIMEOUT_MS + 1);
    });

    // The same path a refused or unreachable request takes, so the retries, the
    // recovery on focus and on `online` and the warning all apply to it too.
    expect(screen.getByTestId("error")).toHaveTextContent(/Timed out/);
  });

  it("abandons the request in flight when it is unmounted", async () => {
    vi.useFakeTimers();
    const { signals } = hangingFetch();

    const { unmount } = render(
      <MarketProvider>
        <Probe />
      </MarketProvider>,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    unmount();

    // The cancelled flag only stops the answer being written. This is what
    // stops the request outliving the tree that asked for it.
    expect(signals[0].aborted).toBe(true);
  });
});
