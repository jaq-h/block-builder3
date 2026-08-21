/**
 * Kraken WebSocket Manager
 * Handles WebSocket connections for real-time data and authenticated order submission
 */

import { hasValidCredentials } from "./config";
import { getWebSocketToken } from "./krakenAuth";
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
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

const createSocketState = (): SocketState => ({
  ws: null,
  status: "disconnected",
  connecting: null,
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
   */
  private subscriptions: Map<string, Record<string, unknown>> = new Map();

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

    const attempt = new Promise<void>((resolve, reject) => {
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

    state.connecting = attempt;
    // The rejection is delivered to callers through the returned promise; this
    // copy exists only to clear the memo, so its rejection is swallowed here.
    const clear = () => {
      if (state.connecting === attempt) state.connecting = null;
    };
    attempt.then(clear, clear);

    return attempt;
  }

  /**
   * Connect to the private WebSocket for authenticated operations
   */
  connectPrivate(): Promise<void> {
    if (!hasValidCredentials()) {
      return Promise.reject(new Error("API credentials are not configured"));
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

    const attempt = this.openPrivate();

    state.connecting = attempt;
    const clear = () => {
      if (state.connecting === attempt) state.connecting = null;
    };
    attempt.then(clear, clear);

    return attempt;
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
    for (const message of this.subscriptions.values()) {
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
   * Subscribe to a public channel, reserving the key before the connect await so
   * two callers racing on mount cannot both send the same subscribe frame.
   */
  private async subscribe(
    key: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    if (this.subscriptions.has(key)) {
      return; // Already subscribed
    }
    // Reserved before the await, so a second caller racing this one sees the key
    // and returns instead of sending the same frame again.
    this.subscriptions.set(key, message);

    const wasOpen = this.publicSocket.ws?.readyState === WebSocket.OPEN;

    try {
      await this.connectPublic();
    } catch (error) {
      this.subscriptions.delete(key);
      throw error;
    }

    // If the socket had to be opened, the replay in `onopen` has already sent
    // this frame - it was in the map before the socket came up. Only a caller
    // joining an already-open socket has to send for itself.
    if (wasOpen) {
      this.send("public", message);
    }
  }

  /**
   * Unsubscribe from a public channel. The key is dropped whether or not the
   * frame can go out, so a channel is never replayed after a reconnect.
   */
  private unsubscribe(key: string, message: Record<string, unknown>): void {
    if (!this.subscriptions.delete(key)) {
      return; // Not subscribed
    }
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
