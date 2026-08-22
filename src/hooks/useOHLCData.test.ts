// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useOHLCData } from "./useOHLCData";
import { withLatestCandle } from "@utils/liveCandles";
import { FakeWebSocket, installFakeWebSocket } from "@/test/fakeWebSocket";
import { resetWebSocketManager } from "@api/krakenWebSocket";

// =============================================================================
// HARNESS
// =============================================================================

const BACKFILL_TIME = 1_700_000_000;

/** A Kraken REST OHLC response with one candle at the given close price. */
const ohlcResponse = (close: number) => ({
  error: [],
  result: {
    XXBTZUSD: [[BACKFILL_TIME, "1", "2", "0.5", String(close), "1", "1", 1]],
    last: BACKFILL_TIME,
  },
});

/** A live `ohlc` update for one bar, as the socket delivers it. */
const ohlcUpdate = (
  intervalBegin: string,
  close: number,
  interval = 60,
) => ({
  channel: "ohlc",
  type: "update",
  data: [
    {
      symbol: "BTC/USD",
      interval,
      interval_begin: intervalBegin,
      open: close,
      high: close,
      low: close,
      close,
    },
  ],
});

/** The unix second an `interval_begin` names, which is the bar's `time`. */
const at = (intervalBegin: string) =>
  Math.floor(Date.parse(intervalBegin) / 1000);

let uninstall: () => void;

beforeEach(() => {
  uninstall = installFakeWebSocket();
});

afterEach(() => {
  resetWebSocketManager();
  uninstall();
  vi.restoreAllMocks();
});

// =============================================================================
// TESTS
// =============================================================================

describe("useOHLCData", () => {
  it("starts out loading, without an extra render pass to say so", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(ohlcResponse(100))),
    );

    const { result } = renderHook(() =>
      useOHLCData({ symbol: "BTC/USD", interval: 60 }),
    );

    // Loading is derived during render from the fact that no request has
    // resolved for this symbol/interval yet - it is not seeded from an effect.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.candles).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.candles).toHaveLength(1);
  });

  it("reports loading again the moment the timeframe changes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(ohlcResponse(100))),
    );

    const { result, rerender } = renderHook(
      ({ interval }) => useOHLCData({ symbol: "BTC/USD", interval }),
      { initialProps: { interval: 60 } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender({ interval: 1440 });

    // No stale candles from the previous timeframe, and no cascading render.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.candles).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("surfaces a fetch failure and stops loading", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() =>
      useOHLCData({ symbol: "BTC/USD", interval: 60 }),
    );

    await waitFor(() => expect(result.current.error).toBe("network down"));
    expect(result.current.isLoading).toBe(false);
  });

  it("applies a live candle from the socket", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(ohlcResponse(100))),
    );

    const { result } = renderHook(() =>
      useOHLCData({ symbol: "BTC/USD", interval: 60 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      FakeWebSocket.last.openConnection();
    });

    await act(async () => {
      FakeWebSocket.last.receive({
        channel: "ohlc",
        type: "update",
        data: [
          {
            symbol: "BTC/USD",
            interval: 60,
            interval_begin: "2026-08-21T00:00:00.000000Z",
            open: 1,
            high: 3,
            low: 0.5,
            close: 2.5,
          },
        ],
      });
    });

    expect(result.current.latestCandle?.close).toBe(2.5);
  });

  it("ignores a live candle for a timeframe the caller is not showing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(ohlcResponse(100))),
    );

    const { result } = renderHook(() =>
      useOHLCData({ symbol: "BTC/USD", interval: 60 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const before = result.current.latestCandle;

    await act(async () => {
      FakeWebSocket.last.openConnection();
    });

    await act(async () => {
      FakeWebSocket.last.receive({
        channel: "ohlc",
        type: "update",
        data: [
          {
            symbol: "BTC/USD",
            interval: 1440,
            interval_begin: "2026-08-21T00:00:00.000000Z",
            open: 1,
            high: 3,
            low: 0.5,
            close: 999,
          },
        ],
      });
    });

    expect(result.current.latestCandle).toBe(before);
  });

  // ===========================================================================
  // ACCUMULATION
  // ===========================================================================
  //
  // `candles` is every bar that has closed and `latestCandle` is the bar still
  // being written, so the two folded together are the series exactly as it
  // stands. `candles` used to be frozen at the REST fetch while only
  // `latestCandle` moved, which meant that fold produced the backfill plus one
  // bar no matter how long the page stayed open: every bar that had closed in
  // between was silently dropped, and a 20-period average was drawn over a
  // window with an hour-wide hole in it.

  /** Mount, resolve the backfill, and open the socket. */
  const mounted = async (interval = 60) => {
    // A fresh `Response` per call: a body can only be read once, so a shared
    // one would make the second timeframe's fetch fail rather than backfill.
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(ohlcResponse(100)))),
    );

    const hook = renderHook(
      ({ interval }) => useOHLCData({ symbol: "BTC/USD", interval }),
      { initialProps: { interval } },
    );

    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => {
      FakeWebSocket.last.openConnection();
    });

    return hook;
  };

  const send = async (payload: unknown) => {
    await act(async () => {
      FakeWebSocket.last.receive(payload);
    });
  };

  it("keeps every bar that closes, so consecutive rollovers leave no gap", async () => {
    const { result } = await mounted();

    const rollovers = [
      ["2026-08-21T01:00:00.000000Z", 101],
      ["2026-08-21T02:00:00.000000Z", 102],
      ["2026-08-21T03:00:00.000000Z", 103],
    ] as const;

    for (const [begin, close] of rollovers) {
      await send(ohlcUpdate(begin, close));
    }

    // The two bars that closed between the first and the last must still be
    // there, in time order, with the bar being written last.
    const live = withLatestCandle(
      result.current.candles,
      result.current.latestCandle,
    );

    expect(live.map((c) => c.close)).toEqual([100, 101, 102, 103]);
    expect(live.map((c) => c.time)).toEqual([
      BACKFILL_TIME,
      at(rollovers[0][0]),
      at(rollovers[1][0]),
      at(rollovers[2][0]),
    ]);
  });

  it("holds `candles` identity steady while one bar is still forming", async () => {
    // The reason the feed is split in two at all: a consumer's effect must run
    // once per bar close, not once per tick.
    const { result } = await mounted();

    await send(ohlcUpdate("2026-08-21T01:00:00.000000Z", 101));
    const afterRollover = result.current.candles;

    await send(ohlcUpdate("2026-08-21T01:00:00.000000Z", 150));
    await send(ohlcUpdate("2026-08-21T01:00:00.000000Z", 175));

    expect(result.current.candles).toBe(afterRollover);
    expect(result.current.latestCandle?.close).toBe(175);

    // The forming bar is rewritten rather than appended.
    expect(
      withLatestCandle(result.current.candles, result.current.latestCandle).map(
        (c) => c.close,
      ),
    ).toEqual([100, 175]);
  });

  it("ignores a tick for a bar older than the one being written", async () => {
    const { result } = await mounted();

    await send(ohlcUpdate("2026-08-21T02:00:00.000000Z", 102));
    const settled = result.current.candles;

    await send(ohlcUpdate("2026-08-21T01:00:00.000000Z", 999));

    expect(result.current.candles).toBe(settled);
    expect(result.current.latestCandle?.close).toBe(102);
  });

  it("starts the accumulation clean when the timeframe changes", async () => {
    const { result, rerender } = await mounted();

    await send(ohlcUpdate("2026-08-21T01:00:00.000000Z", 101));
    await send(ohlcUpdate("2026-08-21T02:00:00.000000Z", 102));

    rerender({ interval: 1440 });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Bars accumulated on the previous timeframe must not carry across.
    expect(result.current.candles.map((c) => c.close)).toEqual([100]);
    expect(result.current.latestCandle?.time).toBe(BACKFILL_TIME);
  });
});
