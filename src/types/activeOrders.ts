// =============================================================================
// ACTIVE ORDERS TYPES - Consolidated active orders type definitions
// =============================================================================

import type { GridData, CellPosition } from "./grid";

// =============================================================================
// ORDER STATUS TYPES
// =============================================================================

export type OrderStatus = "active" | "pending" | "filled" | "cancelled";

// =============================================================================
// ACTIVE ORDER ENTRY
// =============================================================================

export interface ActiveOrderEntry {
  id: string;
  orderId: string; // External order ID from the exchange
  col: number;
  row: number;
  type: string;
  axis?: 1 | 2;
  yPosition?: number;
  status: OrderStatus;
  createdAt: Date;
  filledAt?: Date;
  quantity?: number;
  filledQuantity?: number;
}

export type ActiveOrdersConfig = Record<string, ActiveOrderEntry>;

// =============================================================================
// CONTEXT STATE
// =============================================================================

export interface ActiveOrdersState {
  // Business state
  grid: GridData;
  activeOrders: ActiveOrdersConfig;

  // UI state
  hoveredCell: CellPosition | null;
  selectedOrderId: string | null;
}

// =============================================================================
// CONTEXT ACTIONS
// =============================================================================

export interface ActiveOrdersActions {
  setActiveOrders: React.Dispatch<React.SetStateAction<ActiveOrdersConfig>>;
  setHoveredCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;
  setSelectedOrderId: React.Dispatch<React.SetStateAction<string | null>>;
  refreshOrders: () => void;
}

export type ActiveOrdersContextType = ActiveOrdersState & ActiveOrdersActions;

// =============================================================================
// PROVIDER PROPS
// =============================================================================

export interface ActiveOrdersProviderProps {
  children: React.ReactNode;
  initialOrders?: ActiveOrdersConfig;
  onOrderSelect?: (orderId: string | null) => void;
}

export interface ActiveOrdersProps {
  onOrderSelect?: (orderId: string | null) => void;
  initialOrders?: ActiveOrdersConfig;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export const getStatusLabel = (status: OrderStatus): string => {
  switch (status) {
    case "active":
      return "Active";
    case "pending":
      return "Pending";
    case "filled":
      return "Filled";
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown";
  }
};

export const getStatusColor = (status: OrderStatus): string => {
  switch (status) {
    case "active":
      return "#4CAF50";
    case "pending":
      return "#FFC107";
    case "filled":
      return "#2196F3";
    case "cancelled":
      return "#9E9E9E";
    default:
      return "#9E9E9E";
  }
};
