/**
 * Kraken WebSocket Manager
 * Handles WebSocket connections for real-time data and authenticated order submission
 */

import { isLiveTradingAvailable } from "./tradingMode";
import { getWebSocketToken } from "./krakenServer";
import type {
  WebSocketStatus,
  WebSocketMessage,
  KrakenOrderRequest,
  KrakenOrderResponse,
  OrderParams,
} from "./types";

// WebSocket URLs
const KRAKEN_WS_PUBLIC_URL = "wss://ws.kraken.com/v2";
const KRAKEN_WS_PRIVATE_URL = "wss://ws-auth.kraken.com/v2";

// Event types for the WebSocket manager
export type WebSocketEventType =
  | "status"
  | "message"
  | "ticker"
  | "ohlc"
  | "order_response"
  | "error";

export type WebSocketEventHandler = (data: unknown) => void;

export type SocketKind = "public" | "private";

/**
 * Payload of the `error` event. `fatal` marks the terminal case: reconnection
 * has been abandoned and the socket will not come back without an explicit
 * `connect` call, so the UI must surface it rather than wait it out.
 */
export interface WebSocketErrorEvent {
  type: SocketKind;
  error: unknown;
  fatal: boolean;
}

/**
 * Everything that is per-socket. Keeping it in one record is what stops the
 * public socket's reconnect budget from being spent by the private one, and
 * makes it obvious that `connecting` has to be cleared wherever `ws` is.
 */
interface SocketState {
  ws: WebSocket | null;
  status: WebSocketStatus;
  /**
   * The in-flight connect promise. Callers that race on mount are handed this
   * same promise instead of opening a second socket, which is what used to
   * leave the first caller sending on a replaced, still-CONNECTING socket.
   */
  connecting: Promise<void> | null;
  /**
   * Settles `connecting` from the outside. Every path that would otherwise
   * resolve an attempt runs from a socket handler, so once `disconnect()` has
   * detached those handlers only this can release a suspended caller.
   */
  abortConnecting: ((error: Error) => void) | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

const createSocketState = (): SocketState => ({
  ws: null,
  status: "disconnected",
  connecting: null,
  abortConnecting: null,
  reconnectAttempts: 0,
  reconnectTimer: null,
});

/**
 * Detach every handler from a socket before we let go of it, so an orphaned
 * socket cannot still drive status or schedule a reconnect after it is replaced.
 */
const abandon = (ws: WebSocket | null): void => {
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;
  if (
    ws.readyState === WebSocket.CONNECTING ||
    ws.readyState === WebSocket.OPEN
  ) {
    ws.close();
  }
};

/**
 * Kraken WebSocket Manager
 * Manages connections to both public and private WebSocket endpoints
 */
export class KrakenWebSocketManager {
  private publicSocket: SocketState = createSocketState();
  private privateSocket: SocketState = createSocketState();
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
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  /**
   * Live public-channel subscriptions, keyed so a repeat subscribe is a no-op,
   * and holding the exact `subscribe` frame so every one can be replayed after
   * a reconnect. Without the replay the app comes back connected but silent.
   *
   * `refs` counts the consumers that asked for the channel. Two components call
   * `useKrakenAPI` today and both subscribe the same ticker, so an unrefcounted
   * `unsubscribe` from either would take the feed away from the other. That
   * only became reachable when the ticker channel started following the
   * selected market: nothing unsubscribed before, so nothing could.
   */
  private subscriptions: Map<
    string,
    { message: Record<string, unknown>; refs: number }
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

  private setStatus(type: SocketKind, status: WebSocketStatus): void {
    const state = type === "public" ? this.publicSocket : this.privateSocket;
    state.status = status;
    this.emit("status", { type, status });
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
   * Send a frame on a socket, but only when it is actually open.
   * Returns whether the frame went out, so callers never have to assume.
   */
  private send(type: SocketKind, message: unknown): boolean {
    const { ws } = type === "public" ? this.publicSocket : this.privateSocket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    ws.send(JSON.stringify(message));
    return true;
  }

  /**
   * Memoise an in-flight connect on `state` and hand back the promise callers
   * await. The attempt is raced against an abort handle so `disconnect()` can
   * settle it: the socket handlers it would otherwise settle from have just
   * been detached, which used to strand the caller on a promise forever.
   */
  private trackConnect(
    state: SocketState,
    open: () => Promise<void>,
  ): Promise<void> {
    let abort!: (error: Error) => void;
    const aborted = new Promise<never>((_, reject) => {
      abort = reject;
    });

    const attempt = Promise.race([open(), aborted]);

    state.connecting = attempt;
    state.abortConnecting = abort;

    // The rejection is delivered to callers through the returned promise; this
    // copy exists only to clear the memo, so its rejection is swallowed here.
    const clear = () => {
      if (state.connecting === attempt) {
        state.connecting = null;
        state.abortConnecting = null;
      }
    };
    attempt.then(clear, clear);

    return attempt;
  }

  /**
   * Connect to the public WebSocket for market data
   */
  connectPublic(): Promise<void> {
    const state = this.publicSocket;

    if (state.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    // A connect is already in flight: hand every racing caller the same promise
    // rather than opening a second socket over the top of the first.
    if (state.connecting) {
      return state.connecting;
    }

    // Anything left over (a CONNECTING socket from an aborted attempt, a
    // CLOSING one) is detached first so it cannot fire handlers we no longer own.
    abandon(state.ws);
    state.ws = null;

    this.setStatus("public", "connecting");

    return this.trackConnect(state, () => this.openPublic());
  }

  private openPublic(): Promise<void> {
    const state = this.publicSocket;

    return new Promise<void>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(KRAKEN_WS_PUBLIC_URL);
      } catch (error) {
        this.setStatus("public", "error");
        reject(error);
        return;
      }

      state.ws = ws;
      // Every handler below checks that it still owns the current socket, so a
      // socket that was replaced mid-flight goes quietly instead of flipping
      // status or scheduling a reconnect for a connection nobody is using.
      const isCurrent = () => this.publicSocket.ws === ws;

      ws.onopen = () => {
        if (!isCurrent()) return;
        state.reconnectAttempts = 0;
        this.setStatus("public", "connected");
        this.startHeartbeat();
        // Restore subscriptions before resolving, so a caller that connects and
        // then subscribes never races the replay.
        this.replaySubscriptions();
        resolve();
      };

      ws.onmessage = (event) => {
        if (!isCurrent()) return;
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          this.handlePublicMessage(data);
        } catch (error) {
          console.error("Failed to parse public WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        if (!isCurrent()) return;
        this.emit("error", {
          type: "public",
          error,
          fatal: false,
        } satisfies WebSocketErrorEvent);
        reject(new Error("Public WebSocket connection error"));
      };

      ws.onclose = () => {
        if (!isCurrent()) return;
        state.ws = null;
        this.setStatus("public", "disconnected");
        // A close before open leaves the connect promise unsettled otherwise.
        reject(new Error("Public WebSocket closed before it opened"));
        this.attemptReconnect("public");
      };
    });
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

    const state = this.privateSocket;

    if (state.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (state.connecting) {
      return state.connecting;
    }

    abandon(state.ws);
    state.ws = null;

    this.setStatus("private", "connecting");

    return this.trackConnect(state, () => this.openPrivate());
  }

  private async openPrivate(): Promise<void> {
    const state = this.privateSocket;

    try {
      this.authToken = await getWebSocketToken();
    } catch (error) {
      this.setStatus("private", "error");
      throw new Error(`Failed to get WebSocket token: ${error}`);
    }

    return new Promise<void>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(KRAKEN_WS_PRIVATE_URL);
      } catch (error) {
        this.setStatus("private", "error");
        reject(error);
        return;
      }

      state.ws = ws;
      const isCurrent = () => this.privateSocket.ws === ws;

      ws.onopen = () => {
        if (!isCurrent()) return;
        state.reconnectAttempts = 0;
        state.status = "connected";
        // Authenticate immediately after connection
        this.authenticate();
        resolve();
      };

      ws.onmessage = (event) => {
        if (!isCurrent()) return;
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          this.handlePrivateMessage(data);
        } catch (error) {
          console.error("Failed to parse private WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        if (!isCurrent()) return;
        this.emit("error", {
          type: "private",
          error,
          fatal: false,
        } satisfies WebSocketErrorEvent);
        reject(new Error("Private WebSocket connection error"));
      };

      ws.onclose = () => {
        if (!isCurrent()) return;
        state.ws = null;
        this.authToken = null;
        this.setStatus("private", "disconnected");
        reject(new Error("Private WebSocket closed before it opened"));
        this.attemptReconnect("private");
      };
    });
  }

  /**
   * Authenticate the private WebSocket connection
   */
  private authenticate(): void {
    if (!this.privateSocket.ws || !this.authToken) {
      return;
    }

    // Send authentication message - Kraken v2 WebSocket uses token-based auth
    // The token is included in subsequent requests, not as a separate auth message
    this.setStatus("private", "authenticated");
  }

  /**
   * Re-send every live subscription frame. Called on each successful open, so a
   * reconnect restores the channels instead of leaving the app connected to
   * nothing and showing stale prices.
   */
  private replaySubscriptions(): void {
    for (const { message } of this.subscriptions.values()) {
      this.send("public", message);
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
   * Ensure a public channel is live: register the intent if it is new, and make
   * sure there is a socket carrying it either way.
   *
   * The key is durable intent, not a record of a frame that went out: a failed
   * connect keeps it, so the replay on the next successful open establishes the
   * channel. Dropping it is what left the app connected but subscribed to
   * nothing whenever the very first connect failed, since neither caller is
   * ever asked to subscribe a second time.
   *
   * A key the manager already holds still has to reach the connect below. It is
   * the only route a remounting consumer has back to a socket the manager gave
   * up reconnecting, and returning early there stranded the app on the REST
   * poll until a page reload.
   */
  private async subscribe(
    key: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    const existing = this.subscriptions.get(key);
    const isNew = existing === undefined;
    if (existing) {
      existing.refs += 1;
    } else {
      // Reserved before the await, so a second caller racing this one sees the
      // key and returns instead of sending the same frame again.
      this.subscriptions.set(key, { message, refs: 1 });
    }

    const wasOpen = this.publicSocket.ws?.readyState === WebSocket.OPEN;

    // A no-op on an open socket, the memoised promise while one is connecting,
    // and a fresh socket otherwise. The caller still hears about a failure;
    // only the intent survives it.
    await this.connectPublic();

    // If the socket had to be opened, the replay in `onopen` has already sent
    // this frame - it was in the map before the socket came up. Only a caller
    // joining an already-open socket with a new key has to send for itself.
    if (isNew && wasOpen) {
      this.send("public", message);
    }
  }

  /**
   * Release one consumer's interest in a public channel.
   *
   * The channel goes away only when the last consumer has let go. The key is
   * then dropped whether or not the frame can go out, so a channel is never
   * replayed after a reconnect.
   */
  private unsubscribe(key: string, message: Record<string, unknown>): void {
    const existing = this.subscriptions.get(key);
    if (!existing) {
      return; // Not subscribed
    }

    existing.refs -= 1;
    if (existing.refs > 0) {
      return; // Somebody else is still listening
    }

    this.subscriptions.delete(key);
    this.send("public", message);
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
    if (this.privateSocket.status !== "authenticated") {
      await this.connectPrivate();
    }

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
    if (this.privateSocket.status !== "authenticated") {
      await this.connectPrivate();
    }

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
      }, 30000); // 30 second timeout

      this.pendingRequests.set(reqId, { resolve, reject, timeout });

      if (!this.send("private", request)) {
        clearTimeout(timeout);
        this.pendingRequests.delete(reqId);
        reject(new Error("Private WebSocket is not connected"));
      }
    });
  }

  /**
   * Attempt to reconnect after disconnection. Each socket carries its own
   * budget, so a flapping public connection cannot exhaust the private one's.
   */
  private attemptReconnect(type: SocketKind): void {
    const state = type === "public" ? this.publicSocket : this.privateSocket;

    if (state.reconnectTimer) {
      return; // A reconnect is already scheduled
    }

    if (state.reconnectAttempts >= this.maxReconnectAttempts) {
      const error = new Error(
        `Gave up reconnecting the ${type} WebSocket after ${this.maxReconnectAttempts} attempts`,
      );
      console.warn(error.message);
      // Tell the UI. Staying silent here is what left the app looking connected
      // while the connection was permanently dead.
      this.setStatus(type, "error");
      this.emit("error", {
        type,
        error,
        fatal: true,
      } satisfies WebSocketErrorEvent);
      return;
    }

    state.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, state.reconnectAttempts - 1);

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      const reconnect =
        type === "public" ? this.connectPublic() : this.connectPrivate();
      reconnect.catch(() => {
        // The failure is already reported through the `status` and `error`
        // events, and `onclose` schedules the next attempt.
      });
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      // Send ping to keep connection alive
      this.send("public", { method: "ping" });
      this.send("private", { method: "ping" });
    }, 30000); // Every 30 seconds
  }

  /**
   * Disconnect all WebSocket connections
   */
  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Clear all pending requests
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error("WebSocket disconnected"));
    });
    this.pendingRequests.clear();

    // Clear subscriptions
    this.subscriptions.clear();

    for (const state of [this.publicSocket, this.privateSocket]) {
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      // Detaching before closing is what stops `onclose` from scheduling a
      // reconnect for a connection the caller just asked us to drop.
      abandon(state.ws);
      state.ws = null;
      // Release anyone suspended on the in-flight connect. Its resolve paths all
      // hang off the handlers just detached, so without this the caller - a
      // `subscribe` awaiting `connectPublic` among them - waits forever.
      state.abortConnecting?.(new Error("WebSocket disconnected"));
      state.abortConnecting = null;
      state.connecting = null;
      state.reconnectAttempts = 0;
    }

    this.authToken = null;

    this.setStatus("public", "disconnected");
    this.setStatus("private", "disconnected");
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
