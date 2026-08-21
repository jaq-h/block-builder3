import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { KrakenWebSocketManager } from "@api/krakenWebSocket";
import type { WebSocketErrorEvent } from "@api/krakenWebSocket";
import { FakeWebSocket, installFakeWebSocket } from "@/test/fakeWebSocket";

// =============================================================================
// HARNESS
// =============================================================================

let uninstall: () => void;
let manager: KrakenWebSocketManager;

beforeEach(() => {
  uninstall = installFakeWebSocket();
  vi.useFakeTimers();
  manager = new KrakenWebSocketManager();
});

afterEach(() => {
  vi.useRealTimers();
  uninstall();
});

/** Every `subscribe` frame a socket was asked to send, as `channel:symbol`. */
const subscribedChannels = (socket: FakeWebSocket): string[] =>
  socket.sentMessages
    .filter((m) => m.method === "subscribe")
    .map((m) => {
      const params = m.params as { channel: string; symbol: string[] };
      return `${params.channel}:${params.symbol[0]}`;
    });

/** Let queued microtasks (the connect promise chain) settle. */
const flush = () => vi.advanceTimersByTimeAsync(0);

// =============================================================================
// THE CONNECT RACE (F4)
// =============================================================================

describe("KrakenWebSocketManager - concurrent connects", () => {
  it("opens one socket when two callers race on mount", async () => {
    const first = manager.connectPublic();
    const second = manager.connectPublic();

    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.last.openConnection();
    await expect(Promise.all([first, second])).resolves.toBeDefined();
  });

  it("hands the second caller the in-flight promise rather than a new socket", async () => {
    const first = manager.connectPublic();
    const second = manager.connectPublic();

    expect(second).toBe(first);

    FakeWebSocket.last.openConnection();
    await first;
  });

  it("does not send on a replaced socket when two subscriptions race on mount", async () => {
    // This is the production failure exactly: `useKrakenAPI` subscribes to the
    // ticker while `useOHLCData` subscribes to candles, both on the same tick.
    // The second connect used to overwrite the socket the first was waiting on,
    // so the first then sent on a still-CONNECTING socket and threw
    // InvalidStateError.
    const ticker = manager.subscribeTicker("BTC/USD");
    const ohlc = manager.subscribeOHLC("BTC/USD", 60);

    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);

    const socket = FakeWebSocket.last;
    socket.openConnection();

    await expect(Promise.all([ticker, ohlc])).resolves.toBeDefined();
    expect(subscribedChannels(socket)).toEqual([
      "ticker:BTC/USD",
      "ohlc:BTC/USD",
    ]);
  });

  it("sends each subscribe frame exactly once", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    await flush();
    FakeWebSocket.last.openConnection();
    await ticker;

    expect(subscribedChannels(FakeWebSocket.last)).toEqual(["ticker:BTC/USD"]);
  });

  it("subscribes on an already-open socket without reconnecting", async () => {
    const connecting = manager.connectPublic();
    FakeWebSocket.last.openConnection();
    await connecting;

    await manager.subscribeTicker("BTC/USD");

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(subscribedChannels(FakeWebSocket.last)).toEqual(["ticker:BTC/USD"]);
  });

  it("ignores a repeat subscribe for a channel it already holds", async () => {
    const first = manager.subscribeTicker("BTC/USD");
    await flush();
    FakeWebSocket.last.openConnection();
    await first;

    await manager.subscribeTicker("BTC/USD");

    expect(subscribedChannels(FakeWebSocket.last)).toEqual(["ticker:BTC/USD"]);
  });

  it("never sends on a socket that is not open", async () => {
    const connecting = manager.connectPublic();
    FakeWebSocket.last.openConnection();
    await connecting;
    await manager.subscribeTicker("BTC/USD");

    // The socket goes away underneath a caller that is mid-teardown.
    FakeWebSocket.last.readyState = FakeWebSocket.CLOSING;

    expect(() => manager.unsubscribeTicker("BTC/USD")).not.toThrow();
  });

  it("drops the subscription when the connect it was waiting on fails", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    await flush();
    FakeWebSocket.last.dropConnection();

    await expect(ticker).rejects.toThrow();

    // Nothing left behind to be replayed onto a later connection.
    const reconnect = manager.connectPublic();
    FakeWebSocket.last.openConnection();
    await reconnect;
    expect(subscribedChannels(FakeWebSocket.last)).toEqual([]);
  });
});

// =============================================================================
// RECONNECT (F8)
// =============================================================================

describe("KrakenWebSocketManager - reconnect", () => {
  /** Connect and subscribe to both channels on one open socket. */
  const connectAndSubscribe = async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    const ohlc = manager.subscribeOHLC("BTC/USD", 60);
    await flush();
    FakeWebSocket.last.openConnection();
    await Promise.all([ticker, ohlc]);
    return FakeWebSocket.last;
  };

  it("replays every subscription after the connection comes back", async () => {
    const original = await connectAndSubscribe();
    expect(subscribedChannels(original)).toHaveLength(2);

    original.dropConnection();
    await vi.advanceTimersByTimeAsync(1000);

    const reopened = FakeWebSocket.last;
    expect(reopened).not.toBe(original);

    reopened.openConnection();
    await flush();

    // Without the replay the app comes back connected but subscribed to
    // nothing, showing a stale price with no error.
    expect(subscribedChannels(reopened)).toEqual([
      "ticker:BTC/USD",
      "ohlc:BTC/USD",
    ]);
  });

  it("keeps delivering ticker events after a reconnect", async () => {
    const original = await connectAndSubscribe();
    const ticks: unknown[] = [];
    manager.on("ticker", (data) => ticks.push(data));

    original.dropConnection();
    await vi.advanceTimersByTimeAsync(1000);
    FakeWebSocket.last.openConnection();
    await flush();

    FakeWebSocket.last.receive({ channel: "ticker", data: [{ last: 42 }] });
    expect(ticks).toHaveLength(1);
  });

  it("backs off exponentially and gives up at the cap", async () => {
    const connecting = manager.connectPublic().catch(() => {});
    FakeWebSocket.last.openConnection();
    await connecting;

    const fatal: WebSocketErrorEvent[] = [];
    manager.on("error", (data) => {
      const event = data as WebSocketErrorEvent;
      if (event.fatal) fatal.push(event);
    });

    // Every attempt fails immediately. Delays double: 1s, 2s, 4s, 8s, 16s.
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      FakeWebSocket.last.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    FakeWebSocket.last.dropConnection();
    await vi.advanceTimersByTimeAsync(60000);

    // The first socket plus five retries, and no sixth.
    expect(FakeWebSocket.instances).toHaveLength(6);
    expect(fatal).toHaveLength(1);
    expect(fatal[0].type).toBe("public");
  });

  it("tells the UI the connection is dead instead of failing silently", async () => {
    const connecting = manager.connectPublic().catch(() => {});
    FakeWebSocket.last.openConnection();
    await connecting;

    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      FakeWebSocket.last.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    FakeWebSocket.last.dropConnection();
    await vi.advanceTimersByTimeAsync(60000);

    expect(manager.getStatus().public).toBe("error");
  });

  it("resets the budget once a reconnect succeeds", async () => {
    const connecting = manager.connectPublic().catch(() => {});
    FakeWebSocket.last.openConnection();
    await connecting;

    // Four failures, then a success.
    for (const delay of [1000, 2000, 4000, 8000]) {
      FakeWebSocket.last.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    FakeWebSocket.last.openConnection();
    await flush();
    expect(manager.getStatus().public).toBe("connected");

    // The backoff starts over from 1s rather than continuing at 32s.
    const before = FakeWebSocket.instances.length;
    FakeWebSocket.last.dropConnection();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances.length).toBe(before + 1);
  });
});

// =============================================================================
// ORPHANED SOCKETS
// =============================================================================

describe("KrakenWebSocketManager - teardown", () => {
  it("closes a pending socket and stops reconnecting on disconnect", async () => {
    manager.connectPublic().catch(() => {});
    const pending = FakeWebSocket.last;

    manager.disconnect();

    expect(pending.closedByClient).toBe(true);
    expect(pending.onclose).toBeNull();

    await vi.advanceTimersByTimeAsync(60000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("does not replay subscriptions that were explicitly torn down", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    await flush();
    FakeWebSocket.last.openConnection();
    await ticker;

    manager.disconnect();

    const reconnect = manager.connectPublic();
    FakeWebSocket.last.openConnection();
    await reconnect;

    expect(subscribedChannels(FakeWebSocket.last)).toEqual([]);
  });

  it("stops an abandoned socket from driving status after it is replaced", async () => {
    manager.connectPublic().catch(() => {});
    const abandoned = FakeWebSocket.last;

    manager.disconnect();
    const reconnect = manager.connectPublic();
    FakeWebSocket.last.openConnection();
    await reconnect;

    // The orphan finally closes. It must not flip a live connection to
    // disconnected, nor schedule a reconnect for itself.
    abandoned.dropConnection();
    await vi.advanceTimersByTimeAsync(60000);

    expect(manager.getStatus().public).toBe("connected");
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
