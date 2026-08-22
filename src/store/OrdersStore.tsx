import { useReducer, type FC } from "react";
import type { OrderConfig } from "../types/grid";
import { useMarket } from "./useMarket";
import type { ActiveOrdersConfig, OrderStatus } from "../types/activeOrders";
import { isLiveTradingAvailable } from "../api";
import { ordersReducer, createInitialState } from "./ordersReducer";
import OrdersStoreContext, {
  type OrdersStoreContextType,
  type OrdersStoreProviderProps,
} from "./OrdersStoreContext";

// =============================================================================
// ENVIRONMENT & SIMULATION MODE
// =============================================================================

const isDevelopment = import.meta.env.DEV;

/**
 * Which mode the store starts in, before anything is known.
 *
 * Always simulation, in every build. A production build is no longer simulation
 * by definition - a self-hosted deployment with a credential is live - so this
 * is not a statement about the build, it is a safe default: the server has not
 * answered `/api/kraken/status` yet, and until it does the app must not behave
 * as though it can trade. Whether the toggle out of simulation is offered at
 * all is `useTradeExecution`'s `canToggle`, which follows the server's answer.
 */
const getDefaultSimulationMode = (): boolean => true;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Generate a unique order ID */
const generateOrderId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ORD-${timestamp}-${random}`.toUpperCase();
};

/** Generate a unique strategy ID - groups all orders submitted together */
const generateStrategyId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `STR-${timestamp}-${random}`.toUpperCase();
};

/**
 * Convert OrderConfig entry to ActiveOrderEntry.
 *
 * `symbol` is recorded from the selection at submit time and is not optional
 * here, even though it is on the entry: an order this app writes always knows
 * its market, and only entries persisted before markets existed do not.
 */
const configToActiveOrder = (
  id: string,
  config: OrderConfig[string],
  strategyId: string,
  symbol: string,
) => {
  return {
    id,
    orderId: generateOrderId(),
    strategyId,
    symbol,
    col: config.col,
    row: config.row,
    type: config.type,
    axis: config.axis,
    yPosition: config.yPosition,
    direction: config.direction,
    status: "pending" as OrderStatus,
    createdAt: new Date(),
  };
};

/** Simulate API delay for development/simulation */
const simulateApiDelay = (ms: number = 500): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Get log prefix based on mode.
 *
 * The label follows what the *server* will do, not what kind of build this is.
 * A production build is no longer simulation by definition: a self-hosted
 * deployment with a credential is live, and labelling its order log as a
 * simulation would be a lie at the worst possible moment. The build flavour is
 * kept only as a secondary hint about where the log came from.
 */
const getLogPrefix = (isSimulation: boolean): string => {
  const build = isDevelopment ? "DEV" : "PROD";
  const simulating = isSimulation || !isLiveTradingAvailable();
  return simulating ? `[${build} SIMULATION]` : `[${build} API MODE]`;
};

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

export const OrdersStoreProvider: FC<OrdersStoreProviderProps> = ({
  children,
  forceSimulation,
}) => {
  const [state, dispatch] = useReducer(
    ordersReducer,
    forceSimulation ?? getDefaultSimulationMode(),
    createInitialState,
  );

  // The pair every order in this submission is priced against. Read here rather
  // than passed in, for the same reason `useKrakenAPI` reads it: a caller that
  // names its own market is a caller that can record one the user never chose.
  const { market } = useMarket();

  // Destructure for stable references in callbacks
  const { isSimulationMode } = state;

  // Set simulation mode
  const setSimulationMode = (enabled: boolean) => {
    dispatch({ type: "SET_SIMULATION_MODE", enabled });
    const prefix = getLogPrefix(enabled);
    console.log(
      `${prefix} Simulation mode ${enabled ? "enabled" : "disabled"}`,
    );
  };

  // Toggle simulation mode
  const toggleSimulationMode = () => {
    dispatch({ type: "TOGGLE_SIMULATION_MODE" });
    // Log uses the *new* value, so we invert the current capture
    const prefix = getLogPrefix(!isSimulationMode);
    console.log(
      `${prefix} Simulation mode ${!isSimulationMode ? "enabled" : "disabled"}`,
    );
  };

  // Submit orders - simulated locally or via API based on simulation mode
  const submitOrders = async (config: OrderConfig): Promise<boolean> => {
    dispatch({ type: "SUBMIT_START" });

    const logPrefix = getLogPrefix(isSimulationMode);

    try {
      if (isSimulationMode) {
        // Simulation mode: store orders locally (works in dev and production)
        console.log(
          `${logPrefix} Submitting orders locally:`,
          Object.keys(config).length,
          "orders",
        );

        // Simulate API delay for realistic UX
        await simulateApiDelay(800);

        // Convert config entries to active orders - all share the same strategyId
        const strategyId = generateStrategyId();
        const newOrders: ActiveOrdersConfig = {};
        Object.entries(config).forEach(([id, entry]) => {
          const activeOrder = configToActiveOrder(
            id,
            entry,
            strategyId,
            market.symbol,
          );
          newOrders[activeOrder.id] = activeOrder;
        });

        const timestamp = new Date();
        dispatch({ type: "SUBMIT_SUCCESS", orders: newOrders, timestamp });

        // Simulate orders becoming active after a short delay
        const orderIds = Object.keys(newOrders);
        setTimeout(() => {
          dispatch({ type: "ORDERS_ACTIVATED", orderIds });
          console.log(`${logPrefix} Orders are now active`);
        }, 1500);

        console.log(`${logPrefix} Orders submitted successfully`);
        return true;
      } else {
        // API mode - only reachable when the server reports live trading
        // The browser holds no credential and cannot sign anything, so this is
        // a UI guard, not the security boundary. The real refusal is server
        // side, in `api/_lib/serverConfig.ts`.
        if (!isLiveTradingAvailable()) {
          throw new Error(
            "Live trading is not enabled on this deployment. Switch to simulation mode, or run the app locally or self-hosted with live trading configured on the server.",
          );
        }

        console.log(`${logPrefix} Submitting orders to Kraken API:`, config);

        // TODO: Implement actual Kraken API call
        throw new Error(
          "Kraken API integration not implemented yet. Switch to simulation mode to test.",
        );
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to submit orders";
      dispatch({ type: "SUBMIT_FAILURE", error: errorMessage });
      console.error(`${logPrefix} Order submission failed:`, errorMessage);
      return false;
    }
  };

  // Cancel a single order
  const cancelOrder = async (orderId: string): Promise<boolean> => {
    const logPrefix = getLogPrefix(isSimulationMode);

    try {
      if (isSimulationMode) {
        console.log(`${logPrefix} Cancelling order:`, orderId);
        await simulateApiDelay(300);

        dispatch({ type: "CANCEL_ORDER", orderId });
        return true;
      } else {
        // The browser holds no credential and cannot sign anything, so this is
        // a UI guard, not the security boundary. The real refusal is server
        // side, in `api/_lib/serverConfig.ts`.
        if (!isLiveTradingAvailable()) {
          throw new Error(
            "Live trading is not enabled on this deployment. Switch to simulation mode, or run the app locally or self-hosted with live trading configured on the server.",
          );
        }

        // TODO: Implement actual Kraken API call
        throw new Error(
          "Kraken API integration not implemented yet. Switch to simulation mode to test.",
        );
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to cancel order";
      dispatch({ type: "SUBMIT_FAILURE", error: errorMessage });
      return false;
    }
  };

  // Cancel all active orders
  const cancelAllOrders = async (): Promise<boolean> => {
    const logPrefix = getLogPrefix(isSimulationMode);

    try {
      if (isSimulationMode) {
        console.log(`${logPrefix} Cancelling all orders`);
        await simulateApiDelay(500);

        dispatch({ type: "CANCEL_ALL" });
        return true;
      } else {
        // The browser holds no credential and cannot sign anything, so this is
        // a UI guard, not the security boundary. The real refusal is server
        // side, in `api/_lib/serverConfig.ts`.
        if (!isLiveTradingAvailable()) {
          throw new Error(
            "Live trading is not enabled on this deployment. Switch to simulation mode, or run the app locally or self-hosted with live trading configured on the server.",
          );
        }

        // TODO: Implement actual Kraken API call
        throw new Error(
          "Kraken API integration not implemented yet. Switch to simulation mode to test.",
        );
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to cancel orders";
      dispatch({ type: "SUBMIT_FAILURE", error: errorMessage });
      return false;
    }
  };

  // Update order status manually (for simulations)
  const updateOrderStatus = (orderId: string, status: OrderStatus) => {
    dispatch({
      type: "UPDATE_ORDER_STATUS",
      orderId,
      status,
      ...(status === "filled" ? { filledAt: new Date() } : {}),
    });
  };

  // Clear error
  const clearError = () => {
    dispatch({ type: "CLEAR_ERROR" });
  };

  // Refresh orders from API (or simulate in simulation mode)
  const refreshOrders = async (): Promise<void> => {
    const logPrefix = getLogPrefix(isSimulationMode);

    if (isSimulationMode) {
      console.log(`${logPrefix} Refreshing orders (local state)`);
      // In simulation mode, we just log - state is already local
    } else {
      // TODO: Implement actual API call to fetch orders
      console.log(`${logPrefix} Would fetch orders from API`);
    }
  };

  // Context value
  const contextValue: OrdersStoreContextType = {
    // State (spread from reducer)
    ...state,

    // Actions
    submitOrders,
    cancelOrder,
    cancelAllOrders,
    updateOrderStatus,
    clearError,
    refreshOrders,
    setSimulationMode,
    toggleSimulationMode,
  };

  return (
    <OrdersStoreContext.Provider value={contextValue}>
      {children}
    </OrdersStoreContext.Provider>
  );
};
