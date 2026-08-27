// The private socket, exercised on the live path rather than the simulated
// one. `isLiveTradingAvailable` is mocked true here on purpose: the deployment
// this app ships as always simulates, so the credentialed lifecycle would
// otherwise never be run at all. Module mocks are file-scoped, which is why
// this is a second file rather than another `describe` in
// `krakenWebSocket.test.ts`.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./tradingMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tradingMode")>()),
  isLiveTradingAvailable: () => true,
}));

/**
 * A controllable stand-in for the token mint, hoisted so the module mock below
 * can close over it.
 *
 * It models `fetch` where it matters: it is handed an `AbortSignal`, and by
 * default an abort rejects the request in flight. `rejectOnAbort` turns that
 * off to model the nastier case - a response that had already left the server
 * when the abort landed, so the token exists and arrives regardless.
 */
const tokens = vi.hoisted(() => {
  interface Pending {
    signal: AbortSignal | undefined;
    token: string;
    resolve: () => void;
    reject: (error: unknown) => void;
  }

  const state = {
    /** Every mint the manager has asked for, in order. */
    requests: [] as Pending[],
    /** Park each request instead of answering it straight away. */
    hold: false,
    /** Whether an abort rejects a parked request, as `fetch` does. */
    rejectOnAbort: true,
    /** Make the next mint fail outright. */
    failWith: null as string | null,
    issued: 0,
    reset() {
      state.requests = [];
      state.hold = false;
      state.rejectOnAbort = true;
      state.failWith = null;
      state.issued = 0;
    },
    /** Answer every parked request. */
    releaseAll() {
      for (const request of state.requests) request.resolve();
    },
    mint(signal?: AbortSignal): Promise<string> {
      state.issued += 1;
      const token = `test-token-${state.issued}`;

      if (state.failWith) {
        state.requests.push({
          signal,
          token,
          resolve: () => {},
          reject: () => {},
        });
        return Promise.reject(new Error(state.failWith));
      }

      if (!state.hold) {
        state.requests.push({
          signal,
          token,
          resolve: () => {},
          reject: () => {},
        });
        return Promise.resolve(token);
      }

      return new Promise<string>((resolve, reject) => {
        const pending: Pending = {
          signal,
          token,
          resolve: () => resolve(token),
          reject,
        };
        state.requests.push(pending);
        signal?.addEventListener("abort", () => {
          if (state.rejectOnAbort) {
            reject(new Error("The user aborted a request."));
          }
        });
      });
    },
  };

  return state;
});

vi.mock("./krakenServer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./krakenServer")>()),
  getWebSocketToken: (signal?: AbortSignal) => tokens.mint(signal),
}));

import { KrakenWebSocketManager } from "./krakenWebSocket";
import { FakeWebSocket, installFakeWebSocket } from "@/test/fakeWebSocket";
import type { OrderParams } from "./types";

const PUBLIC_URL = "wss://ws.kraken.com/v2";
const PRIVATE_URL = "wss://ws-auth.kraken.com/v2";

let uninstall: () => void;
let manager: KrakenWebSocketManager;

beforeEach(() => {
  uninstall = installFakeWebSocket();
  vi.useFakeTimers();
  tokens.reset();
  manager = new KrakenWebSocketManager();
});

afterEach(() => {
  vi.useRealTimers();
  uninstall();
});

const socketsFor = (url: string) =>
  FakeWebSocket.instances.filter((s) => s.url === url);

const privateSockets = () => socketsFor(PRIVATE_URL);

const flush = () => vi.advanceTimersByTimeAsync(0);

const ORDER: OrderParams = {
  order_type: "limit",
  side: "buy",
  order_qty: "1",
  symbol: "BTC/USD",
  limit_price: "50000",
};

/** Bring the private socket up and hand back the socket carrying it. */
const openPrivate = async () => {
  const connecting = manager.connectPrivate();
  await flush();
  const socket = privateSockets().at(-1)!;
  socket.openConnection();
  await connecting;
  return socket;
};

/** The `token` on every frame a socket was asked to send. */
const sentTokens = (socket: FakeWebSocket): unknown[] =>
  socket.sentMessages
    .filter((m) => m.method === "add_order" || m.method === "cancel_order")
    .map((m) => (m.params as { token?: unknown }).token);

// =============================================================================
// PER-SOCKET RECONNECT STATE
// =============================================================================

describe("KrakenWebSocketManager - per-socket reconnect state", () => {
  it("does not spend the private socket's budget on public failures", async () => {
    const pub = manager.connectPublic();
    FakeWebSocket.last.openConnection();
    await pub;

    await openPrivate();

    expect(manager.getStatus().private).toBe("authenticated");

    // Burn four of the public socket's five attempts.
    for (const delay of [1000, 2000, 4000, 8000]) {
      socketsFor(PUBLIC_URL).at(-1)!.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(socketsFor(PUBLIC_URL)).toHaveLength(5);

    // The private socket now drops for the first time. With one shared counter
    // it would already be four attempts deep and wait 16s; with its own budget
    // it retries after 1s.
    const privateSocketsBefore = privateSockets().length;
    privateSockets().at(-1)!.dropConnection();
    await vi.advanceTimersByTimeAsync(1000);

    expect(privateSockets()).toHaveLength(privateSocketsBefore + 1);
  });

  it("does not reset the private backoff when the public socket reopens", async () => {
    await openPrivate();

    // Burn all five private attempts.
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      privateSockets().at(-1)!.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(privateSockets()).toHaveLength(6);

    // A healthy public connection must not hand the private socket a fresh
    // budget it has not earned.
    const pub = manager.connectPublic();
    socketsFor(PUBLIC_URL).at(-1)!.openConnection();
    await pub;

    privateSockets().at(-1)!.dropConnection();
    await vi.advanceTimersByTimeAsync(60000);

    expect(privateSockets()).toHaveLength(6);
    expect(manager.getStatus().private).toBe("error");
    expect(manager.getConnectionState().private).toBe("failed");
    // ...and the public socket is entirely unaffected by the other's terminal
    // state, which is the whole point of the state being per socket.
    expect(manager.getConnectionState().public).toBe("open");
  });
});

// =============================================================================
// THE PRIVATE TOKEN WINDOW
// =============================================================================
//
// A Kraken WebSocket token authorises trading on the account until it expires.
// The window between asking for one and having a socket to spend it on is the
// one place the browser can be left holding a live credential by doing nothing
// at all, so disconnect has to reach into it rather than wait it out.

describe("KrakenWebSocketManager - the private token window", () => {
  it("hands the mint an abort signal", async () => {
    tokens.hold = true;
    void manager.connectPrivate().catch(() => {});
    await flush();

    expect(tokens.requests).toHaveLength(1);
    expect(tokens.requests[0].signal).toBeInstanceOf(AbortSignal);
    expect(tokens.requests[0].signal!.aborted).toBe(false);

    manager.disconnect();
  });

  it("aborts an in-flight mint on disconnect", async () => {
    tokens.hold = true;
    const connecting = manager.connectPrivate();
    await flush();

    // The socket does not exist yet: the attempt is still inside the mint.
    expect(privateSockets()).toHaveLength(0);
    expect(manager.getConnectionState().private).toBe("connecting");

    manager.disconnect();

    expect(tokens.requests[0].signal!.aborted).toBe(true);
    await expect(connecting).rejects.toThrow("WebSocket disconnected");
    expect(manager.getConnectionState().private).toBe("idle");

    // The mint's own rejection must not then be mistaken for a connection
    // failure and answered with a retry.
    await vi.advanceTimersByTimeAsync(600000);
    expect(privateSockets()).toHaveLength(0);
    expect(tokens.requests).toHaveLength(1);
  });

  it("never opens a socket for a token minted after the disconnect", async () => {
    // The abort landed after the server had already answered, so the token
    // genuinely exists. The manager has to drop it on the floor.
    tokens.hold = true;
    tokens.rejectOnAbort = false;
    const connecting = manager.connectPrivate();
    await flush();

    manager.disconnect();
    await expect(connecting).rejects.toThrow("WebSocket disconnected");

    tokens.releaseAll();
    await vi.advanceTimersByTimeAsync(600000);

    expect(privateSockets()).toHaveLength(0);
    expect(manager.getConnectionState().private).toBe("idle");
    // And it is not merely unspent: the manager is not holding it at all.
    // A token stored here would sit in the tab, live, with nothing that could
    // ever release it.
    expect(manager.hasPrivateCredential()).toBe(false);
  });

  it("holds a token only while the socket it was minted for is up", async () => {
    expect(manager.hasPrivateCredential()).toBe(false);

    const socket = await openPrivate();
    expect(manager.hasPrivateCredential()).toBe(true);

    socket.dropConnection();
    await flush();
    expect(manager.hasPrivateCredential()).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    privateSockets().at(-1)!.openConnection();
    await flush();
    expect(manager.hasPrivateCredential()).toBe(true);

    manager.disconnect();
    expect(manager.hasPrivateCredential()).toBe(false);
  });

  it("does not spend a token minted for a connection that was torn down", async () => {
    tokens.hold = true;
    tokens.rejectOnAbort = false;
    const abandoned = manager.connectPrivate().catch(() => {});
    await flush();
    const abandonedToken = tokens.requests[0].token;

    manager.disconnect();
    await abandoned;
    // The stale response arrives anyway.
    tokens.releaseAll();
    await flush();

    // A fresh connection mints its own.
    tokens.hold = false;
    const socket = await openPrivate();
    const order = manager.submitOrder(ORDER);
    await flush();

    expect(sentTokens(socket)).toEqual(["test-token-2"]);
    expect(sentTokens(socket)).not.toContain(abandonedToken);
    expect(abandonedToken).toBe("test-token-1");

    socket.receive({ req_id: 1, method: "add_order", success: true });
    await expect(order).resolves.toMatchObject({ success: true });
  });

  it("drops the token when the socket it was minted for goes away", async () => {
    const socket = await openPrivate();

    socket.dropConnection();
    await flush();

    // The reconnect mints again rather than reusing what the dead socket had.
    await vi.advanceTimersByTimeAsync(1000);
    const reopened = privateSockets().at(-1)!;
    reopened.openConnection();
    await flush();

    const order = manager.submitOrder(ORDER);
    await flush();
    expect(sentTokens(reopened)).toEqual(["test-token-2"]);

    reopened.receive({ req_id: 1, method: "add_order", success: true });
    await order;
  });

  it("retries a mint that failed, and gives up without a token in hand", async () => {
    tokens.failWith = "Failed to get WebSocket token";
    const connecting = manager.connectPrivate().catch(() => {});
    await connecting;

    expect(manager.getConnectionState().private).toBe("reconnecting");
    expect(privateSockets()).toHaveLength(0);

    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      await vi.advanceTimersByTimeAsync(delay);
    }
    await flush();

    expect(manager.getConnectionState().private).toBe("failed");
    expect(privateSockets()).toHaveLength(0);
    expect(manager.hasPrivateCredential()).toBe(false);

    // An order refuses rather than going out unsigned, and the refusal is not
    // a token that quietly went missing.
    tokens.failWith = null;
    tokens.hold = true;
    const order = manager.submitOrder(ORDER);
    await flush();
    manager.disconnect();
    await expect(order).rejects.toThrow("WebSocket disconnected");
  });
});

// =============================================================================
// PROMISE SETTLEMENT
// =============================================================================

describe("KrakenWebSocketManager - nothing survives a disconnect", () => {
  it("rejects an order still waiting for its reply", async () => {
    const socket = await openPrivate();

    const order = manager.submitOrder(ORDER);
    await flush();
    expect(sentTokens(socket)).toHaveLength(1);

    manager.disconnect();

    await expect(order).rejects.toThrow("WebSocket disconnected");
  });

  it("rejects an order when the socket drops, without waiting out its timeout", async () => {
    const socket = await openPrivate();

    const order = manager.submitOrder(ORDER);
    await flush();

    socket.dropConnection();

    // The request timeout is 30s. A caller must not sit there while the
    // connection it is waiting on has already been replaced.
    await expect(order).rejects.toThrow("connection closed");
  });

  it("settles a connect, a subscribe and an order together", async () => {
    const socket = await openPrivate();
    const pub = manager.connectPublic();
    await flush();

    const order = manager.submitOrder(ORDER);
    await flush();
    expect(sentTokens(socket)).toHaveLength(1);

    const ticker = manager.subscribeTicker("BTC/USD");
    const reconnectingPrivate = manager.connectPrivate();
    await flush();

    manager.disconnect();

    // Every outstanding promise settles, and each one says the same thing.
    await expect(pub).rejects.toThrow("WebSocket disconnected");
    await expect(ticker).rejects.toThrow("WebSocket disconnected");
    await expect(order).rejects.toThrow("WebSocket disconnected");
    // The private socket was open, so its connect had already resolved.
    await expect(reconnectingPrivate).resolves.toBeUndefined();

    expect(manager.getConnectionState()).toEqual({
      public: "idle",
      private: "idle",
    });
  });

  it("leaves no timer running that could revive a torn-down connection", async () => {
    await openPrivate();
    privateSockets().at(-1)!.dropConnection();
    await flush();
    expect(manager.getConnectionState().private).toBe("reconnecting");

    const before = privateSockets().length;
    manager.disconnect();
    await vi.advanceTimersByTimeAsync(600000);

    expect(privateSockets()).toHaveLength(before);
    expect(manager.getConnectionState().private).toBe("idle");
  });
});

// =============================================================================
// TERMINAL STATE
// =============================================================================

describe("KrakenWebSocketManager - private terminal state", () => {
  const exhaust = async () => {
    await openPrivate();
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      privateSockets().at(-1)!.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    privateSockets().at(-1)!.dropConnection();
    await flush();
    expect(manager.getConnectionState().private).toBe("failed");
  };

  it("stops retrying, and holds no token while it is stopped", async () => {
    await exhaust();

    const mintsSoFar = tokens.requests.length;
    await vi.advanceTimersByTimeAsync(3600000);

    expect(tokens.requests).toHaveLength(mintsSoFar);
    expect(manager.getStatus().private).toBe("error");
    expect(manager.hasPrivateCredential()).toBe(false);
  });

  it("comes back for an order, minting a fresh token", async () => {
    await exhaust();
    const mintsSoFar = tokens.requests.length;

    const order = manager.submitOrder(ORDER);
    await flush();
    expect(manager.getConnectionState().private).toBe("connecting");
    expect(tokens.requests).toHaveLength(mintsSoFar + 1);

    const reopened = privateSockets().at(-1)!;
    reopened.openConnection();
    await flush();

    expect(manager.getConnectionState().private).toBe("open");
    expect(sentTokens(reopened)).toEqual([
      tokens.requests.at(-1)!.token,
    ]);

    reopened.receive({ req_id: 1, method: "add_order", success: true });
    await expect(order).resolves.toMatchObject({ success: true });
  });
});
