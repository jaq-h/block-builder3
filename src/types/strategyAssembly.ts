// =============================================================================
// STRATEGY ASSEMBLY TYPES - Consolidated strategy assembly type definitions
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
// CONTEXT STATE
// =============================================================================

export interface StrategyAssemblyState {
  // Business state (exposed to parent via callback)
  grid: GridData;
  orderConfig: OrderConfig;
  strategyPattern: StrategyPattern;

  // UI state (internal only)
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

// =============================================================================
// CONTEXT ACTIONS
// =============================================================================

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
// COMBINED CONTEXT TYPE
// =============================================================================

export type StrategyAssemblyContextType = StrategyAssemblyState &
  StrategyAssemblyActions;

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
