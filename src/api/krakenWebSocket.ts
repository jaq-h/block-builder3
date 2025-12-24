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
  | "order_response"
  | "error";

export type WebSocketEventHandler = (data: unknown) => void;

/**
 * Kraken WebSocket Manager
 * Manages connections to both public and private WebSocket endpoints
 */
export class KrakenWebSocketManager {
  private publicWs: WebSocket | null = null;
  private privateWs: WebSocket | null = null;
  private publicStatus: WebSocketStatus = "disconnected";
  private privateStatus: WebSocketStatus = "disconnected";
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
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private subscriptions: Set<string> = new Set();

  constructor() {
    // Initialize event handler maps
    const eventTypes: WebSocketEventType[] = [
      "status",
      "message",
      "ticker",
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

  /**
   * Get the current status of WebSocket connections
   */
  getStatus(): { public: WebSocketStatus; private: WebSocketStatus } {
    return {
      public: this.publicStatus,
      private: this.privateStatus,
    };
  }

  /**
   * Connect to the public WebSocket for market data
   */
  async connectPublic(): Promise<void> {
    if (this.publicWs?.readyState === WebSocket.OPEN) {
      return;
    }

    this.publicStatus = "connecting";
    this.emit("status", { type: "public", status: this.publicStatus });

    return new Promise((resolve, reject) => {
      try {
        this.publicWs = new WebSocket(KRAKEN_WS_PUBLIC_URL);

        this.publicWs.onopen = () => {
          this.publicStatus = "connected";
          this.reconnectAttempts = 0;
          this.emit("status", { type: "public", status: this.publicStatus });
          this.startHeartbeat();
          resolve();
        };

        this.publicWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WebSocketMessage;
            this.handlePublicMessage(data);
          } catch (error) {
            console.error("Failed to parse public WebSocket message:", error);
          }
        };

        this.publicWs.onerror = (error) => {
          console.error("Public WebSocket error:", error);
          this.emit("error", { type: "public", error });
          reject(new Error("Public WebSocket connection error"));
        };

        this.publicWs.onclose = () => {
          this.publicStatus = "disconnected";
          this.emit("status", { type: "public", status: this.publicStatus });
          this.attemptReconnect("public");
        };
      } catch (error) {
        this.publicStatus = "error";
        this.emit("status", { type: "public", status: this.publicStatus });
        reject(error);
      }
    });
  }

  /**
   * Connect to the private WebSocket for authenticated operations
   */
  async connectPrivate(): Promise<void> {
    if (!hasValidCredentials()) {
      throw new Error("API credentials are not configured");
    }

    if (this.privateWs?.readyState === WebSocket.OPEN) {
      return;
    }

    this.privateStatus = "connecting";
    this.emit("status", { type: "private", status: this.privateStatus });

    try {
      // Get authentication token
      this.authToken = await getWebSocketToken();
    } catch (error) {
      this.privateStatus = "error";
      this.emit("status", { type: "private", status: this.privateStatus });
      throw new Error(`Failed to get WebSocket token: ${error}`);
    }

    return new Promise((resolve, reject) => {
      try {
        this.privateWs = new WebSocket(KRAKEN_WS_PRIVATE_URL);

        this.privateWs.onopen = () => {
          this.privateStatus = "connected";
          // Authenticate immediately after connection
          this.authenticate();
          resolve();
        };

        this.privateWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WebSocketMessage;
            this.handlePrivateMessage(data);
          } catch (error) {
            console.error("Failed to parse private WebSocket message:", error);
          }
        };

        this.privateWs.onerror = (error) => {
          console.error("Private WebSocket error:", error);
          this.emit("error", { type: "private", error });
          reject(new Error("Private WebSocket connection error"));
        };

        this.privateWs.onclose = () => {
          this.privateStatus = "disconnected";
          this.authToken = null;
          this.emit("status", { type: "private", status: this.privateStatus });
          this.attemptReconnect("private");
        };
      } catch (error) {
        this.privateStatus = "error";
        this.emit("status", { type: "private", status: this.privateStatus });
        reject(error);
      }
    });
  }

  /**
   * Authenticate the private WebSocket connection
   */
  private authenticate(): void {
    if (!this.privateWs || !this.authToken) {
      return;
    }

    // Send authentication message - Kraken v2 WebSocket uses token-based auth
    // The token is included in subsequent requests, not as a separate auth message
    this.privateStatus = "authenticated";
    this.reconnectAttempts = 0;
    this.emit("status", { type: "private", status: this.privateStatus });
  }

  /**
   * Handle messages from the public WebSocket
   */
  private handlePublicMessage(data: WebSocketMessage): void {
    this.emit("message", { type: "public", data });

    // Handle ticker updates
    if (
      data.method === "ticker" ||
      (data as Record<string, unknown>).channel === "ticker"
    ) {
      this.emit("ticker", data);
    }
  }

  /**
   * Handle messages from the private WebSocket
   */
  private handlePrivateMessage(data: WebSocketMessage): void {
    this.emit("message", { type: "private", data });

    // Handle order responses
    if (data.req_id !== undefined && this.pendingRequests.has(data.req_id)) {
      const pending = this.pendingRequests.get(data.req_id)!;
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
   * Subscribe to ticker updates for a symbol
   */
  async subscribeTicker(symbol: string): Promise<void> {
    if (!this.publicWs || this.publicWs.readyState !== WebSocket.OPEN) {
      await this.connectPublic();
    }

    const subscriptionKey = `ticker:${symbol}`;
    if (this.subscriptions.has(subscriptionKey)) {
      return; // Already subscribed
    }

    const message = {
      method: "subscribe",
      params: {
        channel: "ticker",
        symbol: [symbol],
      },
    };

    this.publicWs!.send(JSON.stringify(message));
    this.subscriptions.add(subscriptionKey);
  }

  /**
   * Unsubscribe from ticker updates
   */
  unsubscribeTicker(symbol: string): void {
    if (!this.publicWs || this.publicWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const subscriptionKey = `ticker:${symbol}`;
    if (!this.subscriptions.has(subscriptionKey)) {
      return; // Not subscribed
    }

    const message = {
      method: "unsubscribe",
      params: {
        channel: "ticker",
        symbol: [symbol],
      },
    };

    this.publicWs.send(JSON.stringify(message));
    this.subscriptions.delete(subscriptionKey);
  }

  /**
   * Submit an order via WebSocket
   */
  async submitOrder(params: OrderParams): Promise<KrakenOrderResponse> {
    if (!this.privateWs || this.privateStatus !== "authenticated") {
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

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error("Order request timed out"));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(reqId, { resolve, reject, timeout });

      try {
        this.privateWs!.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(reqId);
        reject(error);
      }
    });
  }

  /**
   * Cancel an order via WebSocket
   */
  async cancelOrder(orderId: string): Promise<KrakenOrderResponse> {
    if (!this.privateWs || this.privateStatus !== "authenticated") {
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

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error("Cancel order request timed out"));
      }, 30000);

      this.pendingRequests.set(reqId, { resolve, reject, timeout });

      try {
        this.privateWs!.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(reqId);
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private attemptReconnect(type: "public" | "private"): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`Max reconnect attempts reached for ${type} WebSocket`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting to reconnect ${type} WebSocket in ${delay}ms...`);

    setTimeout(() => {
      if (type === "public") {
        this.connectPublic().catch(console.error);
      } else {
        this.connectPrivate().catch(console.error);
      }
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
      if (this.publicWs?.readyState === WebSocket.OPEN) {
        this.publicWs.send(JSON.stringify({ method: "ping" }));
      }
      if (this.privateWs?.readyState === WebSocket.OPEN) {
        this.privateWs.send(JSON.stringify({ method: "ping" }));
      }
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

    if (this.publicWs) {
      this.publicWs.close();
      this.publicWs = null;
    }

    if (this.privateWs) {
      this.privateWs.close();
      this.privateWs = null;
    }

    this.publicStatus = "disconnected";
    this.privateStatus = "disconnected";
    this.authToken = null;

    this.emit("status", { type: "public", status: this.publicStatus });
    this.emit("status", { type: "private", status: this.privateStatus });
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
