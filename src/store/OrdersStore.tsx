import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { OrderConfig } from "../types/grid";
import type {
  ActiveOrderEntry,
  ActiveOrdersConfig,
  OrderStatus,
} from "../types/activeOrders";

// =============================================================================
// ENVIRONMENT CHECK
// =============================================================================

const isDevelopment = import.meta.env.DEV;

// =============================================================================
// TYPES
// =============================================================================

export interface SubmittedOrder extends ActiveOrderEntry {
  originalConfig: OrderConfig[string];
}

export interface OrdersStoreState {
  submittedOrders: ActiveOrdersConfig;
  isSubmitting: boolean;
  lastSubmissionTime: Date | null;
  error: string | null;
}

export interface OrdersStoreActions {
  submitOrders: (config: OrderConfig) => Promise<boolean>;
  cancelOrder: (orderId: string) => Promise<boolean>;
  cancelAllOrders: () => Promise<boolean>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  clearError: () => void;
  refreshOrders: () => Promise<void>;
}

export type OrdersStoreContextType = OrdersStoreState & OrdersStoreActions;

export interface OrdersStoreProviderProps {
  children: React.ReactNode;
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

/** Simulate API delay for development */
const simulateApiDelay = (ms: number = 500): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

export const OrdersStoreProvider: React.FC<OrdersStoreProviderProps> = ({
  children,
}) => {
  // State
  const [submittedOrders, setSubmittedOrders] = useState<ActiveOrdersConfig>(
    {},
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmissionTime, setLastSubmissionTime] = useState<Date | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // Submit orders - local in dev, API in production
  const submitOrders = useCallback(
    async (config: OrderConfig): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);

      try {
        if (isDevelopment) {
          // Development mode: store orders locally
          console.log(
            "[DEV MODE] Submitting orders locally:",
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

          // Add to submitted orders
          setSubmittedOrders((prev) => ({
            ...prev,
            ...newOrders,
          }));

          // Simulate orders becoming active after a short delay
          setTimeout(() => {
            setSubmittedOrders((prev) => {
              const updated = { ...prev };
              Object.keys(newOrders).forEach((id) => {
                if (updated[id]) {
                  updated[id] = { ...updated[id], status: "active" };
                }
              });
              return updated;
            });
            console.log("[DEV MODE] Orders are now active");
          }, 1500);

          setLastSubmissionTime(new Date());
          console.log("[DEV MODE] Orders submitted successfully");
          return true;
        } else {
          // Production mode: make API request
          // TODO: Implement actual API call
          console.log("[PRODUCTION] Would submit orders to API:", config);

          // Placeholder for API integration
          throw new Error("Production API not implemented yet");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to submit orders";
        setError(errorMessage);
        console.error("Order submission failed:", errorMessage);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  // Cancel a single order
  const cancelOrder = useCallback(async (orderId: string): Promise<boolean> => {
    try {
      if (isDevelopment) {
        console.log("[DEV MODE] Cancelling order:", orderId);
        await simulateApiDelay(300);

        setSubmittedOrders((prev) => {
          if (!prev[orderId]) return prev;
          return {
            ...prev,
            [orderId]: {
              ...prev[orderId],
              status: "cancelled" as OrderStatus,
            },
          };
        });

        return true;
      } else {
        // TODO: Implement actual API call
        throw new Error("Production API not implemented yet");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to cancel order";
      setError(errorMessage);
      return false;
    }
  }, []);

  // Cancel all active orders
  const cancelAllOrders = useCallback(async (): Promise<boolean> => {
    try {
      if (isDevelopment) {
        console.log("[DEV MODE] Cancelling all orders");
        await simulateApiDelay(500);

        setSubmittedOrders((prev) => {
          const updated = { ...prev };
          Object.keys(updated).forEach((id) => {
            if (
              updated[id].status === "active" ||
              updated[id].status === "pending"
            ) {
              updated[id] = { ...updated[id], status: "cancelled" };
            }
          });
          return updated;
        });

        return true;
      } else {
        // TODO: Implement actual API call
        throw new Error("Production API not implemented yet");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to cancel orders";
      setError(errorMessage);
      return false;
    }
  }, []);

  // Update order status manually (for simulations)
  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus) => {
      setSubmittedOrders((prev) => {
        if (!prev[orderId]) return prev;
        return {
          ...prev,
          [orderId]: {
            ...prev[orderId],
            status,
            ...(status === "filled" ? { filledAt: new Date() } : {}),
          },
        };
      });
    },
    [],
  );

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Refresh orders from API (or simulate in dev)
  const refreshOrders = useCallback(async (): Promise<void> => {
    if (isDevelopment) {
      console.log("[DEV MODE] Refreshing orders (local state)");
      // In dev mode, we just log - state is already local
    } else {
      // TODO: Implement actual API call to fetch orders
      console.log("[PRODUCTION] Would fetch orders from API");
    }
  }, []);

  // Memoize context value
  const contextValue = useMemo<OrdersStoreContextType>(
    () => ({
      // State
      submittedOrders,
      isSubmitting,
      lastSubmissionTime,
      error,

      // Actions
      submitOrders,
      cancelOrder,
      cancelAllOrders,
      updateOrderStatus,
      clearError,
      refreshOrders,
    }),
    [
      submittedOrders,
      isSubmitting,
      lastSubmissionTime,
      error,
      submitOrders,
      cancelOrder,
      cancelAllOrders,
      updateOrderStatus,
      clearError,
      refreshOrders,
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

export default OrdersStoreContext;
