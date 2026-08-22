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
  strategyId: string; // Groups orders submitted together as one strategy
  /**
   * The market this order was submitted for, in the WebSocket v2 spelling.
   *
   * Every position an entry records - `yPosition`, `direction`, the cell - is a
   * percentage offset from *a* market price, so without the pair it names, an
   * entry means whatever pair happens to be selected when it is read back. That
   * was harmless while the app traded one market and is data corruption now: a
   * strategy built on ARB/USD reloads into a builder priced against BTC/USD and
   * the same numbers describe a completely different order set.
   *
   * Required, so the compiler enforces it rather than a convention asking for
   * it. There is no migration case to leave room for: the orders store keeps
   * nothing across a reload - `createInitialState` starts from `{}` and nothing
   * in `src/` touches `localStorage` or `sessionStorage` - so no entry can
   * predate the market it was placed on.
   */
  symbol: string;
  col: number;
  row: number;
  type: string;
  axis?: 1 | 2;
  yPosition?: number;
  direction?: "upside" | "downside";
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
  /** Called when user clicks edit on a strategy group — receives all orders in the group */
  onEditGroup?: (orders: ActiveOrderEntry[]) => void;
  editingStrategyId?: string | null;
  /**
   * A strategy whose Edit was refused, because the market it was placed on is
   * not one the catalogue offers any more.
   *
   * Shown on the group the press came from. The grid announces the same
   * refusal, but only into a live region inside the assembly panel, which is
   * `display: none` below `lg` and so is not in the accessibility tree at all -
   * and a sighted user on any screen size sees a button that did nothing.
   */
  refusedStrategy?: { strategyId: string | null; symbol: string } | null;
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
