// =============================================================================
// HOOKS INDEX - Central export point for all custom hooks
// =============================================================================

// Free-form drag hook for moving blocks between grid cells via portal overlay
export { useFreeDrag } from "./useFreeDrag";

// Vertical drag hook for sliding blocks along the price scale axis
export { useVerticalDrag } from "./useVerticalDrag";

// Shared pointer primitive underneath both drag hooks (mouse, touch and pen)
export { usePointerGesture, TAP_SLOP_PX } from "./usePointerGesture";

// Select-then-place command model: the keyboard and tap path onto the grid
export { useBlockCommand } from "./useBlockCommand";

// Live-region announcements, paired with the LiveAnnouncer component
export { useAnnouncer, type Announcement } from "./useAnnouncer";

// Kraken API hook for price data and order management
export { useKrakenAPI, default as useKrakenAPIDefault } from "./useKrakenAPI";

// Trade execution hook for order config management and submission
export { useTradeExecution } from "./useTradeExecution";

// Server-reported trading mode (simulation or live)
export { useTradingMode } from "./useTradingMode";

// OHLC candle data hook for chart integration
export { useOHLCData, TIMEFRAME_MAP } from "./useOHLCData";

// Re-export types from useKrakenAPI
export type {
  UseKrakenAPIOptions,
  UseKrakenAPIReturn,
  OrderSubmitResult,
  ValidationResult,
} from "./useKrakenAPI";

// Re-export types from useTradeExecution
export type { UseTradeExecutionReturn } from "./useTradeExecution";
