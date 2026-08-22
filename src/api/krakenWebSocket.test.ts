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

  it("keeps the subscription when the connect it was waiting on fails", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    await flush();
    const first = FakeWebSocket.last;
    first.dropConnection();

    // The caller still hears about the failure.
    await expect(ticker).rejects.toThrow();

    // ...but the intent outlives it. The manager reconnects on its own, and
    // nothing ever asks for this channel a second time, so a dropped key would
    // leave the app connected and subscribed to nothing until a reload.
    await vi.advanceTimersByTimeAsync(1000);
    const reopened = FakeWebSocket.last;
    expect(reopened).not.toBe(first);

    reopened.openConnection();
    await flush();

    expect(subscribedChannels(reopened)).toEqual(["ticker:BTC/USD"]);
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

  it("reopens for a channel it already holds after it gave up reconnecting", async () => {
    const fatal: WebSocketErrorEvent[] = [];
    manager.on("error", (data) => {
      const event = data as WebSocketErrorEvent;
      if (event.fatal) fatal.push(event);
    });

    const original = await connectAndSubscribe();
    expect(subscribedChannels(original)).toHaveLength(2);

    // Burn the whole budget, so the manager stops retrying on its own.
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      FakeWebSocket.last.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    FakeWebSocket.last.dropConnection();
    await vi.advanceTimersByTimeAsync(60000);

    expect(manager.getStatus().public).toBe("error");
    expect(fatal).toHaveLength(1);

    // A consumer remounts and asks for a symbol the manager still holds. That
    // is the app's only way back from the terminal state short of a reload, so
    // it has to reach the connect rather than return on the held key.
    const before = FakeWebSocket.instances.length;
    const resubscribe = manager.subscribeTicker("BTC/USD");
    await flush();
    expect(FakeWebSocket.instances.length).toBe(before + 1);

    const reopened = FakeWebSocket.last;
    reopened.openConnection();
    await resubscribe;

    expect(manager.getStatus().public).toBe("connected");
    expect(subscribedChannels(reopened)).toEqual([
      "ticker:BTC/USD",
      "ohlc:BTC/USD",
    ]);
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

  it("settles an in-flight connect that disconnect abandons", async () => {
    const connecting = manager.connectPublic();

    manager.disconnect();

    // Every path that would settle this promise runs from a handler `disconnect`
    // has just detached, so only an explicit abort can release the caller.
    await expect(connecting).rejects.toThrow("WebSocket disconnected");
  });

  it("releases a subscribe suspended on the connect it was awaiting", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    await flush();

    manager.disconnect();

    await expect(ticker).rejects.toThrow("WebSocket disconnected");
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

// =============================================================================
// FOLLOWING THE SELECTED MARKET
// =============================================================================
//
// Nothing unsubscribed from a public channel before the app could trade more
// than one market, so nothing here could go wrong. With a market selector,
// leaving the previous pair's channel running means the socket keeps delivering
// ticks for a pair nobody is looking at - and those ticks reach the same state
// the grid prices its blocks from.

describe("KrakenWebSocketManager - switching market", () => {
  /** Every `unsubscribe` frame a socket sent, as `channel:symbol`. */
  const unsubscribedChannels = (socket: FakeWebSocket): string[] =>
    socket.sentMessages
      .filter((m) => m.method === "unsubscribe")
      .map((m) => {
        const params = m.params as { channel: string; symbol: string[] };
        return `${params.channel}:${params.symbol[0]}`;
      });

  const openWith = async (symbol: string) => {
    const subscribing = manager.subscribeTicker(symbol);
    await flush();
    FakeWebSocket.last.openConnection();
    await subscribing;
    return FakeWebSocket.last;
  };

  it("subscribes the new market and unsubscribes the old one", async () => {
    const socket = await openWith("BTC/USD");

    manager.unsubscribeTicker("BTC/USD");
    await manager.subscribeTicker("ETH/USD");

    expect(unsubscribedChannels(socket)).toEqual(["ticker:BTC/USD"]);
    expect(subscribedChannels(socket)).toEqual([
      "ticker:BTC/USD",
      "ticker:ETH/USD",
    ]);
  });

  // The channel is dropped from the replay set as well as off the wire.
  // Otherwise the previous market comes back by itself on the next reconnect,
  // which is the same silence-and-then-surprise the replay was added to fix.
  it("does not replay a market it has unsubscribed from", async () => {
    const original = await openWith("BTC/USD");

    manager.unsubscribeTicker("BTC/USD");
    await manager.subscribeTicker("ETH/USD");

    original.dropConnection();
    await vi.advanceTimersByTimeAsync(60000);
    const reopened = FakeWebSocket.last;
    reopened.openConnection();
    await flush();

    expect(subscribedChannels(reopened)).toEqual(["ticker:ETH/USD"]);
  });

  // Two components call `useKrakenAPI`, and both ask for the same ticker. An
  // unrefcounted unsubscribe from either would take the feed away from the
  // other - the chart going quiet because the builder switched market, or the
  // other way round.
  it("keeps a channel alive while another consumer still wants it", async () => {
    const socket = await openWith("BTC/USD");
    await manager.subscribeTicker("BTC/USD"); // the second consumer

    manager.unsubscribeTicker("BTC/USD"); // the first lets go

    expect(unsubscribedChannels(socket)).toEqual([]);

    manager.unsubscribeTicker("BTC/USD"); // and now the second

    expect(unsubscribedChannels(socket)).toEqual(["ticker:BTC/USD"]);
  });

  // A repeat subscribe is still a no-op on the wire; only the count moves.
  it("does not re-send a subscribe frame for a channel it already holds", async () => {
    const socket = await openWith("BTC/USD");
    await manager.subscribeTicker("BTC/USD");

    expect(subscribedChannels(socket)).toEqual(["ticker:BTC/USD"]);
  });

  it("ignores an unsubscribe for a channel nobody ever asked for", async () => {
    const socket = await openWith("BTC/USD");

    manager.unsubscribeTicker("SOL/USD");

    expect(unsubscribedChannels(socket)).toEqual([]);
    expect(subscribedChannels(socket)).toEqual(["ticker:BTC/USD"]);
  });

  // OHLC follows the market too, and it is keyed on the interval as well, so
  // the two must not collide: releasing one candle channel cannot silence
  // another.
  it("refcounts OHLC channels per symbol and interval", async () => {
    const socket = await openWith("BTC/USD");
    await manager.subscribeOHLC("ETH/USD", 60);
    await manager.subscribeOHLC("ETH/USD", 60);
    await manager.subscribeOHLC("ETH/USD", 240);

    manager.unsubscribeOHLC("ETH/USD", 60);
    expect(unsubscribedChannels(socket)).toEqual([]);

    manager.unsubscribeOHLC("ETH/USD", 60);
    manager.unsubscribeOHLC("ETH/USD", 240);
    expect(unsubscribedChannels(socket)).toEqual(["ohlc:ETH/USD", "ohlc:ETH/USD"]);
  });
});
