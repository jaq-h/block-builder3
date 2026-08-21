// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useOHLCData } from "./useOHLCData";
import { FakeWebSocket, installFakeWebSocket } from "@/test/fakeWebSocket";
import { resetWebSocketManager } from "@api/krakenWebSocket";

// =============================================================================
// HARNESS
// =============================================================================

/** A Kraken REST OHLC response with one candle at the given close price. */
const ohlcResponse = (close: number) => ({
  error: [],
  result: {
    XXBTZUSD: [[1_700_000_000, "1", "2", "0.5", String(close), "1", "1", 1]],
    last: 1_700_000_000,
  },
});

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
});
