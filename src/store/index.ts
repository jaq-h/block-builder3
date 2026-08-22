// Store – provider component
export { OrdersStoreProvider } from "./OrdersStore";

// Store – hooks & selectors
export {
  useOrdersStore,
  useActiveOrdersCount,
  usePendingOrdersCount,
  useLiveOrdersCount,
  useOrdersByStatus,
  useIsSimulationMode,
} from "./useOrdersStore";

// Store – shared types & context
export type {
  SubmittedOrder,
  OrdersStoreState,
  OrdersStoreActions,
  OrdersStoreContextType,
  OrdersStoreProviderProps,
} from "./OrdersStoreContext";

// Reducer exports
export { ordersReducer, createInitialState } from "./ordersReducer";
export type { OrdersAction } from "./ordersReducer";

// Market – the selected trading pair, app-wide
export { MarketProvider } from "./MarketProvider";
export { useMarket } from "./useMarket";
export { MarketContext } from "./MarketContext";
export type { MarketContextValue } from "./MarketContext";
