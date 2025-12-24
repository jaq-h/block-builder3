/**
 * React Hook for Kraken API Integration
 * Provides easy access to WebSocket connections, ticker data, and order submission
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getWebSocketManager,
  getTickerData,
  mapGridToOrders,
  validateOrder,
  createOrderPreview,
  hasValidCredentials,
  DEFAULT_SYMBOL,
  type WebSocketStatus,
  type ParsedTickerData,
  type OrderParams,
} from "../api";
import type { GridData } from "../utils/cardAssemblyUtils";

// ============================================================================
// Types
// ============================================================================

export interface UseKrakenAPIOptions {
  symbol?: string;
  autoConnect?: boolean;
  pollInterval?: number; // Polling interval for ticker data in ms
}

export interface UseKrakenAPIReturn {
  // Connection status
  isConnected: boolean;
  publicStatus: WebSocketStatus;
  privateStatus: WebSocketStatus;

  // Ticker data
  tickerData: ParsedTickerData | null;
  currentPrice: number | null;
  isLoadingTicker: boolean;
  tickerError: string | null;

  // Order management
  pendingOrders: OrderParams[];
  orderPreviews: string[];
  isSubmitting: boolean;
  orderError: string | null;
  lastOrderResult: OrderSubmitResult | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshTicker: () => Promise<void>;
  prepareOrdersFromGrid: (grid: GridData, quantity: string) => OrderParams[];
  submitOrders: (orders: OrderParams[]) => Promise<OrderSubmitResult>;
  clearOrderError: () => void;

  // Validation
  hasCredentials: boolean;
  validateOrders: (orders: OrderParams[]) => ValidationResult;
}

export interface OrderSubmitResult {
  success: boolean;
  submittedCount: number;
  failedCount: number;
  errors: string[];
  orderIds: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: Map<number, string[]>; // Map of order index to errors
}

// ============================================================================
// Hook Implementation
// ============================================================================

export const useKrakenAPI = (
  options: UseKrakenAPIOptions = {},
): UseKrakenAPIReturn => {
  const {
    symbol = DEFAULT_SYMBOL,
    autoConnect = false,
    pollInterval = 30000, // Default 30 second polling
  } = options;

  // Connection state
  const [publicStatus, setPublicStatus] =
    useState<WebSocketStatus>("disconnected");
  const [privateStatus, setPrivateStatus] =
    useState<WebSocketStatus>("disconnected");

  // Ticker state
  const [tickerData, setTickerData] = useState<ParsedTickerData | null>(null);
  const [isLoadingTicker, setIsLoadingTicker] = useState(false);
  const [tickerError, setTickerError] = useState<string | null>(null);

  // Order state
  const [pendingOrders, setPendingOrders] = useState<OrderParams[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [lastOrderResult, setLastOrderResult] =
    useState<OrderSubmitResult | null>(null);

  // Refs
  const wsManager = useRef(getWebSocketManager());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================================
  // Computed values
  // ============================================================================

  const isConnected =
    publicStatus === "connected" || privateStatus === "authenticated";
  const currentPrice = tickerData?.last ?? null;
  const hasCredentials = hasValidCredentials();
  const orderPreviews = pendingOrders.map(createOrderPreview);

  // ============================================================================
  // WebSocket event handlers
  // ============================================================================

  useEffect(() => {
    const manager = wsManager.current;

    const handleStatus = (data: unknown) => {
      const statusData = data as {
        type: "public" | "private";
        status: WebSocketStatus;
      };
      if (statusData.type === "public") {
        setPublicStatus(statusData.status);
      } else {
        setPrivateStatus(statusData.status);
      }
    };

    const handleTicker = (data: unknown) => {
      // Process real-time ticker updates
      const tickerUpdate = data as { data?: { last?: string } };
      if (tickerUpdate.data?.last) {
        setTickerData((prev) =>
          prev
            ? {
                ...prev,
                last: parseFloat(tickerUpdate.data!.last!),
              }
            : prev,
        );
      }
    };

    const handleError = (data: unknown) => {
      const errorData = data as { type: string; error: unknown };
      console.error(`Kraken API error (${errorData.type}):`, errorData.error);
    };

    manager.on("status", handleStatus);
    manager.on("ticker", handleTicker);
    manager.on("error", handleError);

    return () => {
      manager.off("status", handleStatus);
      manager.off("ticker", handleTicker);
      manager.off("error", handleError);
    };
  }, []);

  // ============================================================================
  // Auto-connect and initial price fetch effect
  // ============================================================================

  useEffect(() => {
    // Fetch price immediately on mount (don't wait for WebSocket)
    refreshTicker();

    if (autoConnect) {
      connect();
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  // ============================================================================
  // Ticker polling effect
  // ============================================================================

  useEffect(() => {
    if (pollInterval > 0) {
      // Set up polling (initial fetch already happened in auto-connect effect)
      pollIntervalRef.current = setInterval(() => {
        refreshTicker();
      }, pollInterval);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollInterval, symbol]);

  // ============================================================================
  // Connection methods
  // ============================================================================

  const connect = useCallback(async () => {
    try {
      // Always connect public for ticker data
      await wsManager.current.connectPublic();

      // Subscribe to ticker updates
      await wsManager.current.subscribeTicker(symbol);

      // Connect private if credentials are available
      if (hasCredentials) {
        try {
          await wsManager.current.connectPrivate();
        } catch (error) {
          console.warn("Failed to connect to private WebSocket:", error);
          // Don't throw - public connection is still useful
        }
      }
    } catch (error) {
      console.error("Failed to connect to Kraken WebSocket:", error);
      throw error;
    }
  }, [symbol, hasCredentials]);

  const disconnect = useCallback(() => {
    wsManager.current.disconnect();
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // ============================================================================
  // Ticker methods
  // ============================================================================

  const refreshTicker = useCallback(async () => {
    setIsLoadingTicker(true);
    setTickerError(null);

    try {
      const data = await getTickerData(symbol);
      setTickerData(data);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch ticker data";
      setTickerError(errorMessage);
      console.error("Ticker fetch error:", error);
    } finally {
      setIsLoadingTicker(false);
    }
  }, [symbol]);

  // ============================================================================
  // Order methods
  // ============================================================================

  const prepareOrdersFromGrid = useCallback(
    (grid: GridData, quantity: string): OrderParams[] => {
      if (!currentPrice) {
        console.warn("Cannot prepare orders: no current price available");
        return [];
      }

      const orders = mapGridToOrders(grid, {
        symbol,
        currentPrice,
        quantity,
      });

      setPendingOrders(orders);
      return orders;
    },
    [symbol, currentPrice],
  );

  const validateOrders = useCallback(
    (orders: OrderParams[]): ValidationResult => {
      const errors = new Map<number, string[]>();

      orders.forEach((order, index) => {
        const orderErrors = validateOrder(order);
        if (orderErrors.length > 0) {
          errors.set(index, orderErrors);
        }
      });

      return {
        isValid: errors.size === 0,
        errors,
      };
    },
    [],
  );

  const submitOrders = useCallback(
    async (orders: OrderParams[]): Promise<OrderSubmitResult> => {
      if (!hasCredentials) {
        const result: OrderSubmitResult = {
          success: false,
          submittedCount: 0,
          failedCount: orders.length,
          errors: ["API credentials are not configured"],
          orderIds: [],
        };
        setLastOrderResult(result);
        setOrderError(result.errors[0]);
        return result;
      }

      // Validate orders first
      const validation = validateOrders(orders);
      if (!validation.isValid) {
        const allErrors: string[] = [];
        validation.errors.forEach((errs, index) => {
          errs.forEach((err) => {
            allErrors.push(`Order ${index + 1}: ${err}`);
          });
        });

        const result: OrderSubmitResult = {
          success: false,
          submittedCount: 0,
          failedCount: orders.length,
          errors: allErrors,
          orderIds: [],
        };
        setLastOrderResult(result);
        setOrderError(allErrors[0]);
        return result;
      }

      setIsSubmitting(true);
      setOrderError(null);

      const result: OrderSubmitResult = {
        success: true,
        submittedCount: 0,
        failedCount: 0,
        errors: [],
        orderIds: [],
      };

      try {
        // Ensure private connection
        if (privateStatus !== "authenticated") {
          await wsManager.current.connectPrivate();
        }

        // Submit orders sequentially
        for (const order of orders) {
          try {
            const response = await wsManager.current.submitOrder(order);
            if (response.success && response.result?.order_id) {
              result.submittedCount++;
              result.orderIds.push(response.result.order_id);
            } else {
              result.failedCount++;
              result.errors.push(response.error || "Unknown error");
            }
          } catch (error) {
            result.failedCount++;
            result.errors.push(
              error instanceof Error
                ? error.message
                : "Order submission failed",
            );
          }
        }

        result.success = result.failedCount === 0;

        if (!result.success) {
          setOrderError(result.errors[0]);
        }

        // Clear pending orders on success
        if (result.success) {
          setPendingOrders([]);
        }
      } catch (error) {
        result.success = false;
        result.failedCount = orders.length;
        result.errors.push(
          error instanceof Error ? error.message : "Failed to submit orders",
        );
        setOrderError(result.errors[0]);
      } finally {
        setIsSubmitting(false);
        setLastOrderResult(result);
      }

      return result;
    },
    [hasCredentials, privateStatus, validateOrders],
  );

  const clearOrderError = useCallback(() => {
    setOrderError(null);
  }, []);

  // ============================================================================
  // Return value
  // ============================================================================

  return {
    // Connection status
    isConnected,
    publicStatus,
    privateStatus,

    // Ticker data
    tickerData,
    currentPrice,
    isLoadingTicker,
    tickerError,

    // Order management
    pendingOrders,
    orderPreviews,
    isSubmitting,
    orderError,
    lastOrderResult,

    // Actions
    connect,
    disconnect,
    refreshTicker,
    prepareOrdersFromGrid,
    submitOrders,
    clearOrderError,

    // Validation
    hasCredentials,
    validateOrders,
  };
};

export default useKrakenAPI;
