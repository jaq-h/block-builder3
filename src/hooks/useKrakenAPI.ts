/**
 * React Hook for Kraken API Integration
 * Provides easy access to WebSocket connections, ticker data, and order submission
 */

import { useState, useEffect, useRef } from "react";
import {
  getWebSocketManager,
  getTickerData,
  mapGridToOrders,
  validateOrder,
  createOrderPreview,
  parseTickerUpdate,
  applyTickerUpdate,
  type WebSocketStatus,
  type ParsedTickerData,
  type OrderParams,
  type WebSocketErrorEvent,
} from "../api";
import { useTradingMode } from "./useTradingMode";
import { precisionOf } from "../utils/priceFormatReadiness";
import { useMarket } from "../store/useMarket";
import type { GridData } from "../types/grid";

// ============================================================================
// Types
// ============================================================================

export interface UseKrakenAPIOptions {
  autoConnect?: boolean;
  pollInterval?: number; // Polling interval for ticker data in ms
}

/**
 * There is deliberately no `symbol` option.
 *
 * There used to be, with `DEFAULT_SYMBOL` behind it, and both callers passed
 * the literal `"BTC/USD"`. With more than one market that is two components
 * each naming a pair, and nothing stopping the chart from drawing one market
 * while the grid prices another. The pair comes from the market context, so a
 * caller cannot desync from the selection even by accident.
 */

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
  /** Whether this deployment's server will sign real Kraken requests */
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

/** Ticker data plus the market it describes, so the two cannot come apart. */
interface TickerState {
  symbol: string;
  data: ParsedTickerData | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export const useKrakenAPI = (
  options: UseKrakenAPIOptions = {},
): UseKrakenAPIReturn => {
  const { autoConnect = false, pollInterval = 30000 } = options;

  // The order path needs the rules and has nothing different to do when they
  // are merely late rather than absent - a payload cannot be built either way -
  // so it takes the readiness through `precisionOf` rather than testing the
  // status itself. It is still the one owner's answer; what it must not do is
  // work out for itself whether there are rules to be had.
  const { market, priceFormat } = useMarket();
  const precision = precisionOf(priceFormat);
  const symbol = market.symbol;

  // Connection state
  const [publicStatus, setPublicStatus] =
    useState<WebSocketStatus>("disconnected");
  const [privateStatus, setPrivateStatus] =
    useState<WebSocketStatus>("disconnected");

  // Ticker state, tagged with the market it belongs to.
  //
  // The tag is what stops the previous market's price surviving a switch. It
  // used to be a bare `ParsedTickerData`, which was safe only because there was
  // one market: with a selector, an untagged record leaves BTC's $109,000 on
  // screen under ETH/USD for as long as the new price takes to arrive, and
  // every block on the grid is priced from it in the meantime. Deriving the
  // answer during render, rather than clearing it from an effect, is the same
  // shape `useOHLCData` uses and means there is no frame in which the state and
  // the selection disagree.
  const [tickerState, setTickerState] = useState<TickerState>(() => ({
    symbol,
    data: null,
  }));
  const [isLoadingTicker, setIsLoadingTicker] = useState(false);
  const [tickerError, setTickerError] = useState<string | null>(null);

  const isTickerCurrent = tickerState.symbol === symbol;
  const tickerData = isTickerCurrent ? tickerState.data : null;

  // Order state
  const [pendingOrders, setPendingOrders] = useState<OrderParams[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [lastOrderResult, setLastOrderResult] =
    useState<OrderSubmitResult | null>(null);

  // Refs
  const wsManager = useRef(getWebSocketManager());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The socket handlers below are registered once, for the life of the hook, so
  // they cannot close over `symbol`. This is how they read the current one.
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  // ============================================================================
  // Computed values
  // ============================================================================

  const isConnected =
    publicStatus === "connected" || privateStatus === "authenticated";
  const currentPrice = tickerData?.last ?? null;
  // Server-reported. The browser holds no credential of its own any more, so
  // "do we have credentials" is really "will the server sign for us".
  const { liveAvailable: hasCredentials } = useTradingMode();
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
      // Every field the frame carries is applied, and a tick that arrives
      // before the first REST poll seeds the record instead of being dropped.
      const update = parseTickerUpdate(data);
      if (!update) return;

      // A frame that names a *different* market is dropped. Switching market
      // leaves both channels briefly live - the unsubscribe frame and the
      // subscribe frame cross on the wire - and without this an in-flight BTC
      // tick lands on the ETH record and becomes an ETH order price. A frame
      // naming no symbol is kept: the only ticker channel this app ever asks
      // for is the selected market's, so there is nothing else it could be.
      if (update.symbol !== undefined && update.symbol !== symbolRef.current) {
        return;
      }

      setTickerState((prev) =>
        prev.symbol === symbolRef.current
          ? { symbol: prev.symbol, data: applyTickerUpdate(prev.data, update) }
          : {
              symbol: symbolRef.current,
              data: applyTickerUpdate(null, update),
            },
      );
    };

    const handleError = (data: unknown) => {
      const errorData = data as WebSocketErrorEvent;
      console.error(`Kraken API error (${errorData.type}):`, errorData.error);
      // A `fatal` error means reconnection has been abandoned. The manager also
      // moves that socket to the `error` status, which is what reaches the UI
      // through `publicStatus` / `privateStatus` below - `tickerError` is left
      // alone because REST polling still works and still has a fresh price.
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
    // Fetch the price immediately, without waiting for the WebSocket. Keyed on
    // the symbol rather than the mount: switching market has to put a real
    // price on screen straight away, not 30 seconds later when the poll fires.
    refreshTicker();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
    // `refreshTicker` is re-created every render, so listing it would refetch
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // ============================================================================
  // Ticker channel effect - the subscription follows the selected market
  // ============================================================================

  useEffect(() => {
    if (!autoConnect) return;

    const manager = wsManager.current;

    // Subscribing is what opens the public socket, and it registers the intent
    // before it connects - so a failed first connect still leaves the channel
    // to be replayed once a socket comes up. That is the manager's contract and
    // this relies on it rather than connecting first and subscribing after.
    manager.subscribeTicker(symbol).catch((error: unknown) => {
      console.error("Failed to subscribe to the ticker channel:", error);
    });

    // Leaving the previous market's channel running is the leak this exists to
    // prevent: the socket keeps delivering ticks for a pair nobody is looking
    // at. The manager refcounts the channel, so this releases only this hook's
    // interest and the other consumer keeps its feed.
    return () => {
      manager.unsubscribeTicker(symbol);
    };
  }, [autoConnect, symbol]);

  // ============================================================================
  // Private socket effect
  // ============================================================================

  useEffect(() => {
    // Keyed on `hasCredentials`, not mount-scoped, because the answer arrives
    // from `GET /api/kraken/status` after the first render. A mount-scoped
    // connect would read `false` every time and never open the private socket.
    if (!autoConnect || !hasCredentials) return;

    // The manager reports the failure through its own `status` and `error`
    // events and retries on its own; the public socket is useful regardless.
    wsManager.current.connectPrivate().catch((error: unknown) => {
      console.warn("Failed to connect to private WebSocket:", error);
    });
  }, [autoConnect, hasCredentials]);

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
    // The interval must be rebuilt only when the poll interval or symbol changes.
    // `refreshTicker` is re-created every render, so listing it would clear and
    // re-schedule the interval on every render and the poll would never fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollInterval, symbol]);

  // ============================================================================
  // Connection methods
  // ============================================================================

  /**
   * Open the sockets.
   *
   * This deliberately does **not** subscribe the ticker channel. The channel
   * follows the selected market, and the effect above is its one owner: a
   * second subscribe from here would take a second reference on the same
   * channel that nothing releases, so switching market would leave the previous
   * market's ticks arriving forever. Registering the intent before connecting -
   * the property that keeps a failed first connect from losing the channel -
   * is preserved, because that is what `subscribeTicker` does and the effect is
   * what calls it.
   */
  const connect = async () => {
    try {
      await wsManager.current.connectPublic();

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
  };

  const disconnect = () => {
    wsManager.current.disconnect();
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // ============================================================================
  // Ticker methods
  // ============================================================================

  const refreshTicker = async () => {
    // Captured, not read from the ref, so a response that arrives after the
    // user has switched market is filed under the market it was asked for -
    // and then simply ignored, because it is no longer the current one.
    const requested = symbol;

    setIsLoadingTicker(true);
    setTickerError(null);

    try {
      const data = await getTickerData(requested);
      // Every write below is guarded the same way, because the request the user
      // is waiting on is not necessarily this one. The 30-second poll can be in
      // flight for the previous pair when the selection changes, and it can
      // resolve *after* the new pair's request: writing it back would retag the
      // state with a market nobody is looking at, `isTickerCurrent` would go
      // false, and every chip on the grid would fall back to "Loading price..."
      // with the order path refusing until the next tick.
      if (symbolRef.current === requested) {
        setTickerState({ symbol: requested, data });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch ticker data";
      if (symbolRef.current === requested) {
        setTickerError(errorMessage);
      }
      console.error("Ticker fetch error:", error);
    } finally {
      if (symbolRef.current === requested) {
        setIsLoadingTicker(false);
      }
    }
  };

  // ============================================================================
  // Order methods
  // ============================================================================

  const prepareOrdersFromGrid = (
    grid: GridData,
    quantity: string,
  ): OrderParams[] => {
    // Every offset in the grid is relative to the market price, so without one
    // there is no order to build. Say so rather than returning an empty array
    // and leaving a stale error from an earlier attempt on screen.
    if (!currentPrice) {
      setOrderError(
        "Cannot prepare orders: no current market price available yet.",
      );
      setPendingOrders([]);
      return [];
    }

    // Without Kraken's rules for this pair there is no way to format a price
    // or a quantity that the exchange will accept, and every wrong guess is
    // invisible: Kraken rejects the order and the user sees one that never
    // appeared. So this refuses, exactly as it refuses a missing market price,
    // rather than falling back to another pair's precision.
    if (!precision) {
      setOrderError(
        `Cannot prepare orders: Kraken's precision rules for ${symbol} have not loaded yet.`,
      );
      setPendingOrders([]);
      return [];
    }

    // The mapper refuses a grid it cannot express as Kraken orders - a cycle of
    // conditional links, or an order type it does not recognise. Surface that
    // rather than letting it escape as an unhandled error from the click.
    let orders: OrderParams[];
    try {
      orders = mapGridToOrders(grid, {
        market: precision,
        currentPrice,
        quantity,
      });
    } catch (error) {
      setOrderError(
        error instanceof Error ? error.message : "Could not build orders",
      );
      setPendingOrders([]);
      return [];
    }

    setOrderError(null);
    setPendingOrders(orders);
    return orders;
  };

  const validateOrders = (orders: OrderParams[]): ValidationResult => {
    const errors = new Map<number, string[]>();

    orders.forEach((order, index) => {
      // Passing the precision is what brings the per-pair minimum order size
      // into validation. Kraken's minimum spans three orders of magnitude
      // across the pairs on offer, so a quantity that is a fine BTC order is
      // refused outright on ARB - and refused after submission, invisibly,
      // unless it is caught here.
      const orderErrors = validateOrder(order, precision ?? undefined);
      if (orderErrors.length > 0) {
        errors.set(index, orderErrors);
      }
    });

    return {
      isValid: errors.size === 0,
      errors,
    };
  };

  const submitOrders = async (
    orders: OrderParams[],
  ): Promise<OrderSubmitResult> => {
    if (!hasCredentials) {
      const result: OrderSubmitResult = {
        success: false,
        submittedCount: 0,
        failedCount: orders.length,
        errors: ["Live trading is not enabled on this deployment"],
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
            error instanceof Error ? error.message : "Order submission failed",
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
  };

  const clearOrderError = () => {
    setOrderError(null);
  };

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
