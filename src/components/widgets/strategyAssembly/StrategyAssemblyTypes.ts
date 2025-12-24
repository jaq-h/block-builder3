import type React from "react";
import type { GridData, CellPosition } from "../../../utils/cardAssemblyUtils";
import type { OrderTypeDefinition } from "../../../data/orderTypes";

// Strategy pattern types
export type StrategyPattern = "conditional" | "bulk";

// Pattern configuration interface
export interface PatternConfig {
  label: string;
  description: string;
  requiresMiddleRowFirst: boolean;
  useDiagonalPlacement: boolean;
  rowLabels: {
    top: string;
    middle: string;
    bottom: string;
  };
}

// Pattern configurations
export const PATTERN_CONFIGS: Record<StrategyPattern, PatternConfig> = {
  conditional: {
    label: "Conditional Order",
    description: "Primary order with stop-loss/take-profit",
    requiresMiddleRowFirst: true,
    useDiagonalPlacement: true,
    rowLabels: {
      top: "Conditional",
      middle: "Primary",
      bottom: "Conditional",
    },
  },
  bulk: {
    label: "Bulk Order",
    description: "Multiple independent orders",
    requiresMiddleRowFirst: false,
    useDiagonalPlacement: false,
    rowLabels: {
      top: "",
      middle: "",
      bottom: "",
    },
  },
};

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

// Context actions interface
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

export type StrategyAssemblyContextType = StrategyAssemblyState &
  StrategyAssemblyActions;

// Props for the provider
export interface StrategyAssemblyProviderProps {
  children: React.ReactNode;
  onConfigChange?: (config: OrderConfig) => void;
  initialConfig?: OrderConfig;
  initialPattern?: StrategyPattern;
}
