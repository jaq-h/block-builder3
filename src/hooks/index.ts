// =============================================================================
// HOOKS INDEX - Central export point for all custom hooks
// =============================================================================

// Draggable hook for drag-and-drop functionality
export { useDraggable } from "./useDraggable";

// Kraken API hook for price data and order management
export { useKrakenAPI, default as useKrakenAPIDefault } from "./useKrakenAPI";

// Re-export types from useKrakenAPI
export type {
  UseKrakenAPIOptions,
  UseKrakenAPIReturn,
  OrderSubmitResult,
  ValidationResult,
} from "./useKrakenAPI";
