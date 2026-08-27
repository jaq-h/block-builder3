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

// =============================================================================
// INTENT vs STATE
// =============================================================================
//
// Registered subscription intent and live connection state are two different
// things held in two different places (`SubscriptionRegistry` and
// `SocketLifecycle`). Every case below used to need its own special handling
// because the manager kept one blurred idea of both.

describe("KrakenWebSocketManager - intent and state are separate", () => {
  it("keeps intent through a failed connect, a backoff and the terminal state", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    await flush();

    FakeWebSocket.last.dropConnection();
    await expect(ticker).rejects.toThrow();

    // The connection is retrying; the intent is untouched by that.
    expect(manager.getConnectionState().public).toBe("reconnecting");
    expect(manager.getRegisteredChannels()).toEqual(["ticker:BTC/USD"]);

    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      await vi.advanceTimersByTimeAsync(delay);
      FakeWebSocket.last.dropConnection();
    }
    await flush();

    expect(manager.getConnectionState().public).toBe("failed");
    expect(manager.getRegisteredChannels()).toEqual(["ticker:BTC/USD"]);
  });

  it("names the connection state rather than collapsing it into a status", async () => {
    expect(manager.getConnectionState().public).toBe("idle");

    const connecting = manager.connectPublic();
    expect(manager.getConnectionState().public).toBe("connecting");

    FakeWebSocket.last.openConnection();
    await connecting;
    expect(manager.getConnectionState().public).toBe("open");

    FakeWebSocket.last.dropConnection();
    // `idle` and `reconnecting` both report "disconnected" to the app, and are
    // not the same thing: one is a teardown, the other is a live retry.
    expect(manager.getConnectionState().public).toBe("reconnecting");
    expect(manager.getStatus().public).toBe("disconnected");

    manager.disconnect();
    expect(manager.getConnectionState().public).toBe("idle");
    expect(manager.getStatus().public).toBe("disconnected");
  });

  it("clears intent as well as state on an explicit disconnect", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    await flush();
    FakeWebSocket.last.openConnection();
    await ticker;

    expect(manager.getRegisteredChannels()).toEqual(["ticker:BTC/USD"]);

    manager.disconnect();

    expect(manager.getRegisteredChannels()).toEqual([]);
    expect(manager.getConnectionState().public).toBe("idle");
  });

  it("holds intent for a channel it has never managed to send", async () => {
    // Nothing is connected and nothing will be until the socket opens, so the
    // only record that this channel is wanted is the registry.
    const ticker = manager.subscribeTicker("ETH/USD").catch(() => {});
    await flush();

    expect(manager.getConnectionState().public).toBe("connecting");
    expect(manager.getRegisteredChannels()).toEqual(["ticker:ETH/USD"]);

    FakeWebSocket.last.openConnection();
    await ticker;

    expect(subscribedChannels(FakeWebSocket.last)).toEqual(["ticker:ETH/USD"]);
  });
});

// =============================================================================
// CONNECT / SUBSCRIBE / REPLAY ORDERING
// =============================================================================

describe("KrakenWebSocketManager - connect, subscribe and replay ordering", () => {
  it("has replayed every channel before it announces the connection", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    const ohlc = manager.subscribeOHLC("BTC/USD", 60);
    await flush();

    const socket = FakeWebSocket.last;
    const seenOnConnected: string[][] = [];
    manager.on("status", (data) => {
      const event = data as { type: string; status: string };
      if (event.type === "public" && event.status === "connected") {
        seenOnConnected.push(subscribedChannels(socket));
      }
    });

    socket.openConnection();
    await Promise.all([ticker, ohlc]);

    // A consumer that reacts to "connected" must never see a socket that has
    // not had its channels restored - that window is a live connection quietly
    // subscribed to nothing.
    expect(seenOnConnected).toEqual([["ticker:BTC/USD", "ohlc:BTC/USD"]]);
  });

  it("has replayed every channel before a connect promise resolves", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    await flush();
    FakeWebSocket.last.openConnection();
    await ticker;

    FakeWebSocket.last.dropConnection();
    await vi.advanceTimersByTimeAsync(1000);

    const reopened = FakeWebSocket.last;
    const connecting = manager.connectPublic();
    reopened.openConnection();
    await connecting;

    expect(subscribedChannels(reopened)).toEqual(["ticker:BTC/USD"]);
  });

  it("does not send a frame the replay has already carried", async () => {
    // The socket is open when this caller starts, so it would ordinarily send
    // for itself - but the connection is replaced underneath it before the
    // await returns, and the replay on the new socket carries the frame.
    const first = manager.subscribeTicker("BTC/USD");
    await flush();
    const original = FakeWebSocket.last;
    original.openConnection();
    await first;

    const generationBefore = manager.getConnectionState().public;
    expect(generationBefore).toBe("open");

    original.dropConnection();
    await vi.advanceTimersByTimeAsync(1000);
    const reopened = FakeWebSocket.last;

    const second = manager.subscribeOHLC("BTC/USD", 60);
    reopened.openConnection();
    await second;

    // Exactly once each, in registration order, from the replay alone.
    expect(subscribedChannels(reopened)).toEqual([
      "ticker:BTC/USD",
      "ohlc:BTC/USD",
    ]);
  });

  it("registers intent before it asks for a connection", async () => {
    // Read synchronously, before any await has had a chance to run: the
    // registry is written on the way in, not once a socket answers.
    void manager.subscribeTicker("SOL/USD").catch(() => {});
    expect(manager.getRegisteredChannels()).toEqual(["ticker:SOL/USD"]);
    expect(manager.getConnectionState().public).toBe("connecting");
  });
});

// =============================================================================
// TERMINAL STATE
// =============================================================================

describe("KrakenWebSocketManager - terminal state", () => {
  const exhaustPublic = async () => {
    const connecting = manager.connectPublic().catch(() => {});
    FakeWebSocket.last.openConnection();
    await connecting;
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      FakeWebSocket.last.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    FakeWebSocket.last.dropConnection();
    await flush();
    expect(manager.getConnectionState().public).toBe("failed");
  };

  it("refuses to reopen on its own, however long it is left", async () => {
    await exhaustPublic();

    const before = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(3600000);

    expect(FakeWebSocket.instances).toHaveLength(before);
    expect(manager.getConnectionState().public).toBe("failed");
    expect(manager.getStatus().public).toBe("error");
  });

  it("comes back on an explicit connect, with a fresh budget", async () => {
    await exhaustPublic();

    const recovering = manager.connectPublic().catch(() => {});
    expect(manager.getConnectionState().public).toBe("connecting");

    // The recovery attempt fails too. It has to be given real retries, or the
    // way back is only a way back when the very first try succeeds.
    FakeWebSocket.last.dropConnection();
    await recovering;
    expect(manager.getConnectionState().public).toBe("reconnecting");

    await vi.advanceTimersByTimeAsync(1000);
    FakeWebSocket.last.openConnection();
    await flush();

    expect(manager.getConnectionState().public).toBe("open");
  });

  it("comes back for a consumer that resubscribes after giving up", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    await flush();
    FakeWebSocket.last.openConnection();
    await ticker;
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      FakeWebSocket.last.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    FakeWebSocket.last.dropConnection();
    await flush();
    expect(manager.getConnectionState().public).toBe("failed");

    const resubscribe = manager.subscribeTicker("BTC/USD");
    await flush();
    FakeWebSocket.last.openConnection();
    await resubscribe;

    expect(manager.getConnectionState().public).toBe("open");
    expect(subscribedChannels(FakeWebSocket.last)).toEqual(["ticker:BTC/USD"]);
  });

  it("returns to idle from the terminal state on a disconnect", async () => {
    await exhaustPublic();

    manager.disconnect();

    expect(manager.getConnectionState().public).toBe("idle");
    expect(manager.getStatus().public).toBe("disconnected");
  });
});

// =============================================================================
// SIMULATION MODE
// =============================================================================
//
// The default deployment simulates, and `isLiveTradingAvailable()` is false
// here because no test has told the module otherwise. The private socket must
// refuse outright rather than open one and discover it has no token - and it
// must refuse without ever asking the server to mint one.

describe("KrakenWebSocketManager - simulation mode", () => {
  it("refuses the private socket and never leaves it mid-lifecycle", async () => {
    await expect(manager.connectPrivate()).rejects.toThrow(
      "Live trading is not enabled",
    );

    expect(manager.getConnectionState().private).toBe("idle");
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("refuses an order rather than sending it unsigned", async () => {
    await expect(
      manager.submitOrder({
        order_type: "limit",
        side: "buy",
        order_qty: "1",
        symbol: "BTC/USD",
        limit_price: "1",
      }),
    ).rejects.toThrow("Live trading is not enabled");

    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("still runs the public socket normally", async () => {
    const ticker = manager.subscribeTicker("BTC/USD");
    await flush();
    FakeWebSocket.last.openConnection();
    await ticker;

    expect(manager.getConnectionState().public).toBe("open");
    expect(manager.getConnectionState().private).toBe("idle");
  });
});
