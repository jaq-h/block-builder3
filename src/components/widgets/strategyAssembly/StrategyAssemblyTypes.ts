import type React from "react";
import type { GridData, CellPosition } from "../../../utils/cardAssemblyUtils";
import type { OrderTypeDefinition } from "../../../data/orderTypes";

// Order config entry type
export interface OrderConfigEntry {
  col: number;
  row: number;
  type: string;
  axis?: 1 | 2;
  yPosition?: number;
}

export type OrderConfig = Record<string, OrderConfigEntry>;

// Context state interface
export interface StrategyAssemblyState {
  // Business state (exposed to parent via callback)
  grid: GridData;
  orderConfig: OrderConfig;

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

// Context actions interface
export interface StrategyAssemblyActions {
  setGrid: React.Dispatch<React.SetStateAction<GridData>>;
  setOrderConfig: React.Dispatch<React.SetStateAction<OrderConfig>>;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  setDraggingFromProvider: React.Dispatch<React.SetStateAction<string | null>>;
  setHoveredProviderId: React.Dispatch<React.SetStateAction<string | null>>;
  setHoverCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;
  setHoveredGridCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;
  clearAll: () => void;
  reverseBlocks: () => void;
}

export type StrategyAssemblyContextType = StrategyAssemblyState &
  StrategyAssemblyActions;

// Props for the provider
export interface StrategyAssemblyProviderProps {
  children: React.ReactNode;
  onConfigChange?: (config: OrderConfig) => void;
  initialConfig?: OrderConfig;
}
