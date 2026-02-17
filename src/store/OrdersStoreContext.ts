import { createContext, type ReactNode } from "react";
import type { OrdersStoreState } from "./ordersReducer";
import type { OrderConfig } from "../types/grid";
import type { ActiveOrderEntry, OrderStatus } from "../types/activeOrders";

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
  children: ReactNode;
  /** Force simulation mode on/off (overrides default behavior) */
  forceSimulation?: boolean;
}

// =============================================================================
// CONTEXT
// =============================================================================

const OrdersStoreContext = createContext<OrdersStoreContextType | null>(null);

export default OrdersStoreContext;
