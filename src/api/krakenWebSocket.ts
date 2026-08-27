/**
 * Kraken WebSocket Manager
 *
 * Two connections - a public market-data socket and a private authenticated
 * one - built out of two separate pieces that this module composes and does
 * not blur together:
 *
 * - `SocketLifecycle` (`socketLifecycle.ts`) owns **live connection state**:
 *   an explicit state machine per socket, with its own reconnect budget, its
 *   own attempt, and its own promise settlement. Read that file's header for
 *   the states and the transition table.
 * - `SubscriptionRegistry` (`subscriptionRegistry.ts`) owns **registered
 *   intent**: what the app has asked to be subscribed to, with no notion of
 *   whether anything is connected.
 *
 * The manager is the seam between them, and its job is small: register intent,
 * ask for a connection, and hand the machine the replay it runs on open. The
 * ordering of connect, subscribe and replay is a property of the machine
 * rather than of when callers happen to fire.
 */

import { isLiveTradingAvailable } from "./tradingMode";
import { getWebSocketToken } from "./krakenServer";
import { SocketLifecycle, type SocketKind } from "./socketLifecycle";
import { SubscriptionRegistry } from "./subscriptionRegistry";
import type {
  WebSocketStatus,
  WebSocketMessage,
  KrakenOrderRequest,
  KrakenOrderResponse,
  OrderParams,
} from "./types";
import type { ConnectionState } from "./socketLifecycle";

// WebSocket URLs
const KRAKEN_WS_PUBLIC_URL = "wss://ws.kraken.com/v2";
const KRAKEN_WS_PRIVATE_URL = "wss://ws-auth.kraken.com/v2";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 30000;
const REQUEST_TIMEOUT_MS = 30000;

// Event types for the WebSocket manager
export type WebSocketEventType =
  | "status"
  | "message"
  | "ticker"
  | "ohlc"
  | "order_response"
  | "error";

export type WebSocketEventHandler = (data: unknown) => void;

export type { SocketKind, ConnectionState };

/**
 * Payload of the `error` event. `fatal` marks the terminal case: the socket
 * has reached `failed`, reconnection has been abandoned and it will not come
 * back without an explicit `connect` call, so the UI must surface it rather
 * than wait it out.
 */
export interface WebSocketErrorEvent {
  type: SocketKind;
  error: unknown;
  fatal: boolean;
}

/**
 * Kraken WebSocket Manager
 * Manages connections to both public and private WebSocket endpoints
 */
export class KrakenWebSocketManager {
  private readonly publicSocket: SocketLifecycle;
  private readonly privateSocket: SocketLifecycle;

  /**
   * Registered intent for the public channels. It is not connection state and
   * survives a failed connect, a reconnect and the terminal state alike; only
   * an explicit `disconnect()` clears it.
   */
  private readonly subscriptions = new SubscriptionRegistry();

  /**
   * The Kraken WebSocket token, held only for as long as the private socket it
   * was minted for. `releasePrivateConnection` is its single owner, and the
   * lifecycle calls that on every exit from `connecting` and `open` - a drop,
   * a failed attempt, or a disconnect - so there is no path that leaves a live
   * credential in the tab with nothing holding it.
   */
  private authToken: string | null = null;

  private eventHandlers: Map<WebSocketEventType, Set<WebSocketEventHandler>> =
    new Map();
  private requestIdCounter: number = 1;
  private pendingRequests: Map<
    number,
    {
      resolve: (value: KrakenOrderResponse) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  constructor() {
    // Initialize event handler maps
    const eventTypes: WebSocketEventType[] = [
      "status",
      "message",
      "ticker",
      "ohlc",
      "order_response",
      "error",
    ];
    eventTypes.forEach((type) => this.eventHandlers.set(type, new Set()));

    this.publicSocket = new SocketLifecycle({
      name: "public",
      url: KRAKEN_WS_PUBLIC_URL,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectBaseDelayMs: RECONNECT_BASE_DELAY_MS,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      openStatus: "connected",
      onOpen: () => this.replaySubscriptions(),
      onMessage: (data) => this.handlePublicMessage(data),
      onStatus: (status) => this.emit("status", { type: "public", status }),
      onError: (error, fatal) =>
        this.emit("error", {
          type: "public",
          error,
          fatal,
        } satisfies WebSocketErrorEvent),
    });

    this.privateSocket = new SocketLifecycle({
      name: "private",
      url: KRAKEN_WS_PRIVATE_URL,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectBaseDelayMs: RECONNECT_BASE_DELAY_MS,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      // The token is in hand before the socket is constructed, so an open
      // private socket is an authenticated one - there is no window between.
      openStatus: "authenticated",
      prepare: (signal) => this.mintToken(signal),
      onMessage: (data) => this.handlePrivateMessage(data),
      onLost: (reason) => this.releasePrivateConnection(reason),
      onStatus: (status) => this.emit("status", { type: "private", status }),
      onError: (error, fatal) =>
        this.emit("error", {
          type: "private",
          error,
          fatal,
        } satisfies WebSocketErrorEvent),
    });
  }

  /**
   * Add an event listener
   */
  on(event: WebSocketEventType, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.add(handler);
    }
  }

  /**
   * Remove an event listener
   */
  off(event: WebSocketEventType, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit an event to all registered handlers
   */
  private emit(event: WebSocketEventType, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  /**
   * Get the current status of WebSocket connections
   */
  getStatus(): { public: WebSocketStatus; private: WebSocketStatus } {
    return {
      public: this.publicSocket.status,
      private: this.privateSocket.status,
    };
  }

  /**
   * The lifecycle state of each socket, by the machine's own names.
   *
   * `getStatus()` is the app-facing summary and collapses `idle` and
   * `reconnecting` into one "disconnected"; this is the distinction itself,
   * for anything that has to tell "waiting out a backoff" from "torn down" or
   * "gave up".
   */
  getConnectionState(): { public: ConnectionState; private: ConnectionState } {
    return {
      public: this.publicSocket.state,
      private: this.privateSocket.state,
    };
  }

  /**
   * Every public channel the app has asked for, whether or not anything is
   * connected. This is registered intent, not a record of what is on the wire.
   */
  getRegisteredChannels(): string[] {
    return this.subscriptions.keys();
  }

  /**
   * Whether a Kraken WebSocket token is currently held.
   *
   * A boolean, never the token: the point is not to hand the credential out
   * again but to make the invariant checkable. "No token outlives the socket
   * it was minted for" is only an invariant if something can ask.
   */
  hasPrivateCredential(): boolean {
    return this.authToken !== null;
  }

  /**
   * Connect to the public WebSocket for market data
   */
  connectPublic(): Promise<void> {
    return this.publicSocket.connect();
  }

  /**
   * Connect to the private WebSocket for authenticated operations
   */
  connectPrivate(): Promise<void> {
    if (!isLiveTradingAvailable()) {
      return Promise.reject(
        new Error("Live trading is not enabled on this deployment"),
      );
    }
    return this.privateSocket.connect();
  }

  /**
   * Mint the private socket's Kraken token, as the private lifecycle's
   * `prepare` step.
   *
   * `signal` is aborted the instant the attempt is abandoned - by a
   * `disconnect()`, by a failure, or by the attempt being superseded - and it
   * is honoured twice over. It is handed to `fetch`, so an abort cancels the
   * request itself rather than letting the server mint a token for a
   * connection that has already gone; and it is re-checked afterwards, because
   * a response already in flight when the abort landed would otherwise be
   * stored and left sitting in the tab. A Kraken WebSocket token authorises
   * trading on the account until it expires, so this window is the one place
   * the browser can leak a live credential by doing nothing at all.
   */
  private async mintToken(signal: AbortSignal): Promise<void> {
    let token: string;
    try {
      token = await getWebSocketToken(signal);
    } catch (error) {
      if (signal.aborted) {
        throw new Error("The private WebSocket attempt was abandoned");
      }
      throw new Error(`Failed to get WebSocket token: ${error}`);
    }

    if (signal.aborted) {
      throw new Error("The private WebSocket attempt was abandoned");
    }

    this.authToken = token;
  }

  /**
   * Release everything scoped to one private connection.
   *
   * The token goes, and so does every request still waiting on a reply that is
   * never coming. Leaving those to their own 30s timeout is what let an order
   * promise outlive the socket it was sent on: the caller sat there while the
   * connection it was waiting for had already been replaced.
   */
  private releasePrivateConnection(reason: Error): void {
    this.authToken = null;

    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(reason);
    });
    this.pendingRequests.clear();
  }

  /**
   * Re-send every registered subscription frame. The lifecycle runs this
   * inside its `open` transition, before the status is announced and before
   * any connect promise resolves, so a caller can never observe a live socket
   * that has not had its channels restored.
   */
  private replaySubscriptions(): void {
    for (const message of this.subscriptions.frames()) {
      this.publicSocket.send(message);
    }
  }

  /**
   * Handle messages from the public WebSocket
   */
  private handlePublicMessage(data: WebSocketMessage): void {
    this.emit("message", { type: "public", data });

    const channel = (data as Record<string, unknown>).channel;

    // Handle ticker updates
    if (data.method === "ticker" || channel === "ticker") {
      this.emit("ticker", data);
    }

    // Handle OHLC updates
    if (channel === "ohlc") {
      this.emit("ohlc", data);
    }
  }

  /**
   * Handle messages from the private WebSocket
   */
  private handlePrivateMessage(data: WebSocketMessage): void {
    this.emit("message", { type: "private", data });

    // Handle order responses
    if (data.req_id !== undefined) {
      const pending = this.pendingRequests.get(data.req_id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pendingRequests.delete(data.req_id);

      const response: KrakenOrderResponse = {
        method: data.method || "",
        req_id: data.req_id,
        result: data.result as KrakenOrderResponse["result"],
        error: data.error,
        success: data.success ?? !data.error,
      };

      if (response.success) {
        pending.resolve(response);
      } else {
        pending.reject(new Error(response.error || "Unknown error"));
      }

      this.emit("order_response", response);
    }
  }

  /**
   * Ensure a public channel is live: register the intent, then make sure there
   * is a socket carrying it.
   *
   * Intent is registered **before** the connect, which is what makes a failed
   * first connect survivable - the replay on the next successful open
   * establishes the channel, and no consumer ever asks a second time.
   *
   * Whether this caller still has to send its own frame is answered by the
   * lifecycle's open generation rather than by a readyState sampled beforehand.
   * If the generation moved across the await, the socket entered `open` and the
   * replay has already carried every registered frame, this one included. If it
   * did not move, we joined a socket that was open all along and a genuinely
   * new key has to go out for itself.
   */
  private async subscribe(
    key: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    const isNew = this.subscriptions.acquire(key, message);
    const generation = this.publicSocket.openGeneration;

    // A no-op on an open socket, the in-flight attempt's promise while one is
    // connecting, and a fresh attempt otherwise - including from the terminal
    // state, which is the app's one way back. The caller still hears about a
    // failure; only the intent survives it.
    await this.publicSocket.connect();

    if (isNew && this.publicSocket.openGeneration === generation) {
      this.publicSocket.send(message);
    }
  }

  /**
   * Release one consumer's interest in a public channel.
   *
   * The channel goes away only when the last consumer has let go. The intent
   * is then dropped whether or not the frame can go out, so a channel is never
   * replayed after a reconnect.
   */
  private unsubscribe(key: string, message: Record<string, unknown>): void {
    if (!this.subscriptions.release(key)) {
      return; // Unknown, or somebody else is still listening
    }
    this.publicSocket.send(message);
  }

  /**
   * Subscribe to ticker updates for a symbol
   */
  async subscribeTicker(symbol: string): Promise<void> {
    await this.subscribe(`ticker:${symbol}`, {
      method: "subscribe",
      params: {
        channel: "ticker",
        symbol: [symbol],
      },
    });
  }

  /**
   * Unsubscribe from ticker updates
   */
  unsubscribeTicker(symbol: string): void {
    this.unsubscribe(`ticker:${symbol}`, {
      method: "unsubscribe",
      params: {
        channel: "ticker",
        symbol: [symbol],
      },
    });
  }

  /**
   * Subscribe to OHLC candle data for a symbol
   */
  async subscribeOHLC(symbol: string, interval: number = 1): Promise<void> {
    await this.subscribe(`ohlc:${symbol}:${interval}`, {
      method: "subscribe",
      params: {
        channel: "ohlc",
        symbol: [symbol],
        interval,
        snapshot: true,
      },
    });
  }

  /**
   * Unsubscribe from OHLC candle data
   */
  unsubscribeOHLC(symbol: string, interval: number = 1): void {
    this.unsubscribe(`ohlc:${symbol}:${interval}`, {
      method: "unsubscribe",
      params: {
        channel: "ohlc",
        symbol: [symbol],
        interval,
      },
    });
  }

  /**
   * Submit an order via WebSocket
   */
  async submitOrder(params: OrderParams): Promise<KrakenOrderResponse> {
    // A no-op when the socket is already open, and the defined way back when
    // it is not - including from the terminal state.
    await this.connectPrivate();

    const reqId = this.requestIdCounter++;

    const request: KrakenOrderRequest = {
      method: "add_order",
      params: {
        ...params,
        token: this.authToken,
      } as OrderParams & { token: string | null },
      req_id: reqId,
    };

    return this.request(reqId, request, "Order request timed out");
  }

  /**
   * Cancel an order via WebSocket
   */
  async cancelOrder(orderId: string): Promise<KrakenOrderResponse> {
    await this.connectPrivate();

    const reqId = this.requestIdCounter++;

    const request = {
      method: "cancel_order",
      params: {
        order_id: [orderId],
        token: this.authToken,
      },
      req_id: reqId,
    };

    return this.request(reqId, request, "Cancel order request timed out");
  }

  /**
   * Send a request on the private socket and wait for the matching `req_id`.
   *
   * The timeout is a backstop for a socket that stays up and never answers.
   * A socket that goes away settles this promise immediately instead, through
   * `releasePrivateConnection`.
   */
  private request(
    reqId: number,
    request: unknown,
    timeoutMessage: string,
  ): Promise<KrakenOrderResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error(timeoutMessage));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(reqId, { resolve, reject, timeout });

      if (!this.privateSocket.send(request)) {
        clearTimeout(timeout);
        this.pendingRequests.delete(reqId);
        reject(new Error("Private WebSocket is not connected"));
      }
    });
  }

  /**
   * Disconnect all WebSocket connections.
   *
   * Intent goes as well as state: this is the app saying it wants nothing, so
   * a later connect must not bring the old channels back by itself.
   */
  disconnect(): void {
    const reason = new Error("WebSocket disconnected");

    this.subscriptions.clear();

    this.publicSocket.disconnect(reason);
    // The private lifecycle's `onLost` aborts the token window, drops the
    // token and rejects every pending request as part of this call.
    this.privateSocket.disconnect(reason);
  }
}

// Singleton instance for global access
let wsManagerInstance: KrakenWebSocketManager | null = null;

/**
 * Get the singleton WebSocket manager instance
 */
export const getWebSocketManager = (): KrakenWebSocketManager => {
  if (!wsManagerInstance) {
    wsManagerInstance = new KrakenWebSocketManager();
  }
  return wsManagerInstance;
};

/**
 * Reset the WebSocket manager (mainly for testing)
 */
export const resetWebSocketManager = (): void => {
  if (wsManagerInstance) {
    wsManagerInstance.disconnect();
    wsManagerInstance = null;
  }
};
