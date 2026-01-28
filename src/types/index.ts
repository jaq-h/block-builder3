// =============================================================================
// TYPES INDEX - Central export point for all type definitions
// =============================================================================

// Grid types
export type {
  BlockData,
  GridData,
  CellPosition,
  CellDisplayMode,
  ScaleConfig,
  ColumnConfig,
  BaseGridCellProps,
  InteractiveGridCellProps,
  ReadOnlyGridCellProps,
  StrategyPattern,
  PatternConfig,
  OrderConfigEntry,
  OrderConfig,
} from "./grid";

export { COLUMN_CONFIGS, PATTERN_CONFIGS } from "./grid";

// Active orders types
export type {
  OrderStatus,
  ActiveOrderEntry,
  ActiveOrdersConfig,
  ActiveOrdersState,
  ActiveOrdersActions,
  ActiveOrdersContextType,
  ActiveOrdersProviderProps,
  ActiveOrdersProps,
} from "./activeOrders";

export { getStatusLabel, getStatusColor } from "./activeOrders";

// Strategy assembly types
export type {
  StrategyAssemblyState,
  StrategyAssemblyActions,
  StrategyAssemblyContextType,
  StrategyAssemblyProviderProps,
  StrategyAssemblyProps,
} from "./strategyAssembly";

// API order types
export type {
  OrderMethod,
  OrderSide,
  OrderType,
  ConditionalOrderType,
  OrderPriceType,
  OrderTriggerReference,
  OrderTriggers,
  TimeInForce,
  OrderConditional,
  OrderParams,
  Order,
  OrderResponse,
} from "./orders";

export { createOrder, validateOrderParams } from "./orders";
