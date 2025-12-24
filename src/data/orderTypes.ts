// Order type definitions with default values for the card assembly grid

export type AxisType = "trigger" | "limit";

export interface OrderTypeDefinition {
  type: string;
  abrv: string;
  label: string;
  icon?: string;
  allowedRows: number[];
  axes: AxisType[];
  // Default Y positions when placed (0-100%)
  // Only applicable for blocks with axes
  defaults?: {
    trigger?: number; // Default trigger axis position
    limit?: number; // Default limit axis position
  };
}

// Order type definitions
export const ORDER_TYPES: OrderTypeDefinition[] = [
  {
    type: "limit",
    abrv: "Lmt",
    label: "Limit",
    icon: "/src/assets/icons/limit.svg",
    allowedRows: [0, 1],
    axes: ["limit"],
    defaults: {
      limit: 25,
    },
  },
  {
    type: "market",
    abrv: "Mkt",
    label: "Market",
    icon: "/src/assets/icons/market.svg",
    allowedRows: [1],
    axes: [], // No axes - executes at market price
    // No defaults - market orders don't have price levels
  },
  {
    type: "iceberg",
    abrv: "Ice",
    label: "Iceberg",
    icon: "/src/assets/icons/iceberg.svg",
    allowedRows: [1],
    axes: ["limit"],
    defaults: {
      limit: 25,
    },
  },
  {
    type: "stop-loss",
    abrv: "SL",
    label: "Stop Loss",
    icon: "/src/assets/icons/stop-loss.svg",
    allowedRows: [1, 2],
    axes: ["trigger"],
    defaults: {
      trigger: 15, // Default to 15% below (drawdown territory)
    },
  },
  {
    type: "stop-loss-limit",
    abrv: "SL-Lmt",
    label: "Stop Loss Limit",
    icon: "/src/assets/icons/stop-loss-limit.svg",
    allowedRows: [1, 2],
    axes: ["trigger", "limit"],
    defaults: {
      trigger: 15,
      limit: 10, // Limit slightly below trigger
    },
  },
  {
    type: "take-profit",
    abrv: "TP",
    label: "Take Profit",
    icon: "/src/assets/icons/take-profit.svg",
    allowedRows: [0, 1],
    axes: ["trigger"],
    defaults: {
      trigger: 25, // Default to 25% (upside territory)
    },
  },
  {
    type: "take-profit-limit",
    abrv: "TP-Lmt",
    label: "Take Profit Limit",
    icon: "/src/assets/icons/take-profit-limit.svg",
    allowedRows: [0, 1],
    axes: ["trigger", "limit"],
    defaults: {
      trigger: 25,
      limit: 20, // Limit slightly below trigger
    },
  },
  {
    type: "trailing-stop",
    abrv: "TS",
    label: "Trailing Stop",
    icon: "/src/assets/icons/trailing-stop.svg",
    allowedRows: [1, 2],
    axes: ["trigger"],
    defaults: {
      trigger: 20, // Default trailing distance
    },
  },
  {
    type: "trailing-stop-limit",
    abrv: "TS-Lmt",
    label: "Trailing Stop Limit",
    icon: "/src/assets/icons/trailing-stop-limit.svg",
    allowedRows: [1, 2],
    axes: ["trigger", "limit"],
    defaults: {
      trigger: 20,
      limit: 15,
    },
  },
];

// Column headers for the grid
export const COLUMN_HEADERS = ["Entry", "Exit"];

// Row labels for display/debug
export const ROW_LABELS = ["Top", "Middle", "Bottom"];

// Grid dimensions
export const GRID_CONFIG = {
  numColumns: 2,
  numRows: 3,
  firstPlacementRow: 1, // Middle row
};

// Helper to get human-readable position string
export const getPositionLabel = (col: number, row: number): string => {
  const colLabel = COLUMN_HEADERS[col] ?? `Col${col}`;
  const rowLabel = ROW_LABELS[row] ?? `Row${row}`;
  return `${colLabel} / ${rowLabel}`;
};

// Helper function to get an order type by its type string
export const getOrderType = (type: string): OrderTypeDefinition | undefined => {
  return ORDER_TYPES.find((ot) => ot.type === type);
};

// Helper function to get default position for an axis
export const getDefaultPosition = (
  orderType: OrderTypeDefinition,
  axis: "trigger" | "limit",
): number => {
  if (!orderType.defaults) return 50; // Fallback default
  return orderType.defaults[axis] ?? 50;
};

// Helper to check if order type has specific axis
export const hasAxis = (
  orderType: OrderTypeDefinition,
  axis: AxisType,
): boolean => {
  return orderType.axes.includes(axis);
};

// Helper to check if order type has any axes (i.e., needs price data)
export const hasPriceData = (orderType: OrderTypeDefinition): boolean => {
  return orderType.axes.length > 0;
};
