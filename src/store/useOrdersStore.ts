import { useContext } from "react";
import OrdersStoreContext, {
  type OrdersStoreContextType,
} from "./OrdersStoreContext";
import type { ActiveOrdersConfig, OrderStatus } from "../types/activeOrders";

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

/** Count of orders that are active or pending (i.e. "live") */
export const useLiveOrdersCount = (): number => {
  const { submittedOrders } = useOrdersStore();
  return Object.values(submittedOrders).filter(
    (o) => o.status === "active" || o.status === "pending",
  ).length;
};

/** Check if simulation mode is active */
export const useIsSimulationMode = (): boolean => {
  const { isSimulationMode } = useOrdersStore();
  return isSimulationMode;
};
