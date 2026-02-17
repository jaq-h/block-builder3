// =============================================================================
// STRATEGY ASSEMBLY TYPES - Split context type definitions
// =============================================================================

import type { OrderTypeDefinition } from "../data/orderTypes";
import type {
  GridData,
  CellPosition,
  StrategyPattern,
  OrderConfig,
} from "./grid";

// Re-export commonly used types for convenience
export type { StrategyPattern, OrderConfig };

// =============================================================================
// GRID DATA CONTEXT — Business state (lowest frequency changes)
// =============================================================================

export interface GridDataState {
  grid: GridData;
  orderConfig: OrderConfig;
  strategyPattern: StrategyPattern;
}

export interface GridDataActions {
  setGrid: React.Dispatch<React.SetStateAction<GridData>>;
  setOrderConfig: React.Dispatch<React.SetStateAction<OrderConfig>>;
  setStrategyPattern: React.Dispatch<React.SetStateAction<StrategyPattern>>;
  clearAll: () => void;
  reverseBlocks: () => void;
}

export type GridDataContextType = GridDataState & GridDataActions;

// =============================================================================
// DRAG CONTEXT — Drag UI state (medium frequency changes)
// =============================================================================

export interface DragState {
  draggingId: string | null;
  draggingFromProvider: string | null;
  hoverCell: CellPosition | null;
}

export interface DragActions {
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  setDraggingFromProvider: React.Dispatch<React.SetStateAction<string | null>>;
  setHoverCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;
}

export type DragContextType = DragState & DragActions;

// =============================================================================
// HOVER CONTEXT — Hover UI state (highest frequency changes)
// =============================================================================

export interface HoverState {
  hoveredProviderId: string | null;
  hoveredGridCell: CellPosition | null;
}

export interface HoverActions {
  setHoveredProviderId: React.Dispatch<React.SetStateAction<string | null>>;
  setHoveredGridCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;
}

export type HoverContextType = HoverState & HoverActions;

// =============================================================================
// STATIC CONTEXT — Refs & immutable data (never changes after mount)
// =============================================================================

export interface StaticContextType {
  providerBlocks: OrderTypeDefinition[];
  baseId: string;
  blockCounterRef: React.MutableRefObject<number>;
}

// =============================================================================
// COMBINED CONTEXT TYPE (backward compatibility)
// =============================================================================

export type StrategyAssemblyContextType = GridDataContextType &
  DragContextType &
  HoverContextType &
  StaticContextType;

// =============================================================================
// LEGACY STATE/ACTIONS INTERFACES (backward compatibility)
// =============================================================================

export interface StrategyAssemblyState {
  // Business state
  grid: GridData;
  orderConfig: OrderConfig;
  strategyPattern: StrategyPattern;

  // UI state
  draggingId: string | null;
  draggingFromProvider: string | null;
  hoveredProviderId: string | null;
  hoverCell: CellPosition | null;
  hoveredGridCell: CellPosition | null;

  // Static data
  providerBlocks: OrderTypeDefinition[];
  baseId: string;
  blockCounterRef: React.MutableRefObject<number>;
}

export interface StrategyAssemblyActions {
  setGrid: React.Dispatch<React.SetStateAction<GridData>>;
  setOrderConfig: React.Dispatch<React.SetStateAction<OrderConfig>>;
  setStrategyPattern: React.Dispatch<React.SetStateAction<StrategyPattern>>;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  setDraggingFromProvider: React.Dispatch<React.SetStateAction<string | null>>;
  setHoveredProviderId: React.Dispatch<React.SetStateAction<string | null>>;
  setHoverCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;
  setHoveredGridCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;
  clearAll: () => void;
  reverseBlocks: () => void;
}

// =============================================================================
// PROVIDER PROPS
// =============================================================================

export interface StrategyAssemblyProviderProps {
  children: React.ReactNode;
  onConfigChange?: (config: OrderConfig) => void;
  initialConfig?: OrderConfig;
  initialPattern?: StrategyPattern;
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

export interface StrategyAssemblyProps {
  onConfigChange?: (config: OrderConfig) => void;
  initialConfig?: OrderConfig;
  initialPattern?: StrategyPattern;
}
