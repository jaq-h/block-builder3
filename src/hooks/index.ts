// =============================================================================
// HOOKS INDEX - Central export point for all custom hooks
// =============================================================================

// Free-form drag hook for moving blocks between grid cells via portal overlay
export { useFreeDrag } from "./useFreeDrag";

// Vertical drag hook for sliding blocks along the price scale axis
export { useVerticalDrag } from "./useVerticalDrag";

// Kraken API hook for price data and order management
export { useKrakenAPI, default as useKrakenAPIDefault } from "./useKrakenAPI";

// Trade execution hook for order config management and submission
export { useTradeExecution } from "./useTradeExecution";

// Re-export types from useKrakenAPI
export type {
  UseKrakenAPIOptions,
  UseKrakenAPIReturn,
  OrderSubmitResult,
  ValidationResult,
} from "./useKrakenAPI";

// Re-export types from useTradeExecution
export type { UseTradeExecutionReturn } from "./useTradeExecution";
