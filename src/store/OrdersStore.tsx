import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
} from "react";
import type { OrderConfig } from "../types/grid";
import type {
  ActiveOrderEntry,
  ActiveOrdersConfig,
  OrderStatus,
} from "../types/activeOrders";
import { hasValidCredentials } from "../api";
import {
  ordersReducer,
  createInitialState,
  type OrdersStoreState,
} from "./ordersReducer";

// =============================================================================
// ENVIRONMENT & SIMULATION MODE
// =============================================================================

const isDevelopment = import.meta.env.DEV;

/**
 * Determine if we should use simulation mode:
 * - Always simulate in development
 * - Simulate in production if no valid API credentials are configured
 * - Can be manually enabled via the store actions
 */
const getDefaultSimulationMode = (): boolean => {
  if (isDevelopment) return true;
  // In production, simulate if no credentials are available
  return !hasValidCredentials();
};

// =============================================================================
// TYPES
// =============================================================================

export type { OrdersStoreState } from "./ordersReducer";

export interface SubmittedOrder extends ActiveOrderEntry {
  originalConfig: OrderConfig[string];
}

export interface OrdersStoreActions {
  submitOrders: (config: OrderConfig) => Promise<boolean>;
  cancelOrder: (orderId: string) => Promise<boolean>;
  cancelAllOrders: () => Promise<boolean>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  clearError: () => void;
  refreshOrders: () => Promise<void>;
  /** Enable or disable simulation mode */
  setSimulationMode: (enabled: boolean) => void;
  /** Toggle simulation mode */
  toggleSimulationMode: () => void;
}

export type OrdersStoreContextType = OrdersStoreState & OrdersStoreActions;

export interface OrdersStoreProviderProps {
  children: React.ReactNode;
  /** Force simulation mode on/off (overrides default behavior) */
  forceSimulation?: boolean;
}

// =============================================================================
// CONTEXT
// =============================================================================

const OrdersStoreContext = createContext<OrdersStoreContextType | null>(null);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Generate a unique order ID */
const generateOrderId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ORD-${timestamp}-${random}`.toUpperCase();
};

/** Convert OrderConfig entry to ActiveOrderEntry */
const configToActiveOrder = (
  id: string,
  config: OrderConfig[string],
): ActiveOrderEntry => {
  return {
    id,
    orderId: generateOrderId(),
    col: config.col,
    row: config.row,
    type: config.type,
    axis: config.axis,
    yPosition: config.yPosition,
    status: "pending" as OrderStatus,
    createdAt: new Date(),
  };
};

/** Simulate API delay for development/simulation */
const simulateApiDelay = (ms: number = 500): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/** Get log prefix based on mode */
const getLogPrefix = (isSimulation: boolean): string => {
  if (isDevelopment) {
    return isSimulation ? "[DEV SIMULATION]" : "[DEV MODE]";
  }
  return isSimulation ? "[SIMULATION]" : "[PRODUCTION]";
};

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

export const OrdersStoreProvider: React.FC<OrdersStoreProviderProps> = ({
  children,
  forceSimulation,
}) => {
  const [state, dispatch] = useReducer(
    ordersReducer,
    forceSimulation ?? getDefaultSimulationMode(),
    createInitialState,
  );

  // Destructure for stable references in callbacks
  const { isSimulationMode } = state;

  // Set simulation mode
  const setSimulationMode = useCallback((enabled: boolean) => {
    dispatch({ type: "SET_SIMULATION_MODE", enabled });
    const prefix = getLogPrefix(enabled);
    console.log(
      `${prefix} Simulation mode ${enabled ? "enabled" : "disabled"}`,
    );
  }, []);

  // Toggle simulation mode
  const toggleSimulationMode = useCallback(() => {
    dispatch({ type: "TOGGLE_SIMULATION_MODE" });
    // Log uses the *new* value, so we invert the current capture
    const prefix = getLogPrefix(!isSimulationMode);
    console.log(
      `${prefix} Simulation mode ${!isSimulationMode ? "enabled" : "disabled"}`,
    );
  }, [isSimulationMode]);

  // Submit orders — simulated locally or via API based on simulation mode
  const submitOrders = useCallback(
    async (config: OrderConfig): Promise<boolean> => {
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

          // Convert config entries to active orders
          const newOrders: ActiveOrdersConfig = {};
          Object.entries(config).forEach(([id, entry]) => {
            const activeOrder = configToActiveOrder(id, entry);
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
          // Production mode with API: make actual API request
          console.log(`${logPrefix} Submitting orders to API:`, config);

          // Check for credentials before attempting API call
          if (!hasValidCredentials()) {
            throw new Error(
              "API credentials not configured. Enable simulation mode or configure credentials.",
            );
          }

          // TODO: Implement actual API call
          // For now, throw an error indicating API is not yet implemented
          throw new Error(
            "Production API integration not implemented yet. Enable simulation mode to test.",
          );
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to submit orders";
        dispatch({ type: "SUBMIT_FAILURE", error: errorMessage });
        console.error(`${logPrefix} Order submission failed:`, errorMessage);
        return false;
      }
    },
    [isSimulationMode],
  );

  // Cancel a single order
  const cancelOrder = useCallback(
    async (orderId: string): Promise<boolean> => {
      const logPrefix = getLogPrefix(isSimulationMode);

      try {
        if (isSimulationMode) {
          console.log(`${logPrefix} Cancelling order:`, orderId);
          await simulateApiDelay(300);

          dispatch({ type: "CANCEL_ORDER", orderId });
          return true;
        } else {
          // Check for credentials
          if (!hasValidCredentials()) {
            throw new Error(
              "API credentials not configured. Enable simulation mode or configure credentials.",
            );
          }

          // TODO: Implement actual API call
          throw new Error(
            "Production API integration not implemented yet. Enable simulation mode to test.",
          );
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to cancel order";
        dispatch({ type: "SUBMIT_FAILURE", error: errorMessage });
        return false;
      }
    },
    [isSimulationMode],
  );

  // Cancel all active orders
  const cancelAllOrders = useCallback(async (): Promise<boolean> => {
    const logPrefix = getLogPrefix(isSimulationMode);

    try {
      if (isSimulationMode) {
        console.log(`${logPrefix} Cancelling all orders`);
        await simulateApiDelay(500);

        dispatch({ type: "CANCEL_ALL" });
        return true;
      } else {
        // Check for credentials
        if (!hasValidCredentials()) {
          throw new Error(
            "API credentials not configured. Enable simulation mode or configure credentials.",
          );
        }

        // TODO: Implement actual API call
        throw new Error(
          "Production API integration not implemented yet. Enable simulation mode to test.",
        );
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to cancel orders";
      dispatch({ type: "SUBMIT_FAILURE", error: errorMessage });
      return false;
    }
  }, [isSimulationMode]);

  // Update order status manually (for simulations)
  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus) => {
      dispatch({
        type: "UPDATE_ORDER_STATUS",
        orderId,
        status,
        ...(status === "filled" ? { filledAt: new Date() } : {}),
      });
    },
    [],
  );

  // Clear error
  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  // Refresh orders from API (or simulate in simulation mode)
  const refreshOrders = useCallback(async (): Promise<void> => {
    const logPrefix = getLogPrefix(isSimulationMode);

    if (isSimulationMode) {
      console.log(`${logPrefix} Refreshing orders (local state)`);
      // In simulation mode, we just log — state is already local
    } else {
      // TODO: Implement actual API call to fetch orders
      console.log(`${logPrefix} Would fetch orders from API`);
    }
  }, [isSimulationMode]);

  // Memoize context value
  const contextValue = useMemo<OrdersStoreContextType>(
    () => ({
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
    }),
    [
      state,
      submitOrders,
      cancelOrder,
      cancelAllOrders,
      updateOrderStatus,
      clearError,
      refreshOrders,
      setSimulationMode,
      toggleSimulationMode,
    ],
  );

  return (
    <OrdersStoreContext.Provider value={contextValue}>
      {children}
    </OrdersStoreContext.Provider>
  );
};

// =============================================================================
// HOOK
// =============================================================================

export const useOrdersStore = (): OrdersStoreContextType => {
  const context = useContext(OrdersStoreContext);
  if (!context) {
    throw new Error(
      "useOrdersStore must be used within an OrdersStoreProvider",
    );
  }
  return context;
};

// =============================================================================
// SELECTORS (for derived data)
// =============================================================================

export const useActiveOrdersCount = (): number => {
  const { submittedOrders } = useOrdersStore();
  return Object.values(submittedOrders).filter((o) => o.status === "active")
    .length;
};

export const usePendingOrdersCount = (): number => {
  const { submittedOrders } = useOrdersStore();
  return Object.values(submittedOrders).filter((o) => o.status === "pending")
    .length;
};

export const useOrdersByStatus = (status: OrderStatus): ActiveOrdersConfig => {
  const { submittedOrders } = useOrdersStore();
  return Object.fromEntries(
    Object.entries(submittedOrders).filter(
      ([, order]) => order.status === status,
    ),
  );
};

/** Check if simulation mode is active */
export const useIsSimulationMode = (): boolean => {
  const { isSimulationMode } = useOrdersStore();
  return isSimulationMode;
};

export default OrdersStoreContext;
