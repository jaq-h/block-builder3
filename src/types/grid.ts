// =============================================================================
// GRID TYPES - Consolidated grid type definitions
// =============================================================================

import type { AxisType, SvgIcon } from "../data/orderTypes";

// =============================================================================
// BLOCK DATA TYPES
// =============================================================================

export interface BlockData {
  id: string;
  orderType: string; // Order type identifier (e.g., "limit", "stop-loss-limit")
  label: string; // Display label (e.g., "Limit", "Stop Loss Limit")
  icon?: SvgIcon; // Legacy - use providerIcon instead
  providerIcon?: SvgIcon; // Icon for the provider column (full order type icon)
  triggerIcon?: SvgIcon; // Icon for the trigger axis slider
  limitIcon?: SvgIcon; // Icon for the limit axis slider
  abrv: string;
  allowedRows: number[];
  axis: 1 | 2;
  yPosition: number; // 0-50% for position, -1 for no position
  axes: AxisType[];
  linkedBlockId?: string;
}

// =============================================================================
// GRID STRUCTURE TYPES
// =============================================================================

// Grid is a 3D array: [columns][rows][blocks]
export type GridData = BlockData[][][];

export interface CellPosition {
  col: number;
  row: number;
}

// =============================================================================
// DISPLAY MODE TYPES
// =============================================================================

export type CellDisplayMode = "empty" | "no-axis" | "limit-only" | "dual-axis";

// =============================================================================
// SCALE CONFIGURATION
// =============================================================================

export interface ScaleConfig {
  MIN_PERCENT: number;
  MAX_PERCENT: number;
  STEP_COUNT: number;
}

// =============================================================================
// COLUMN CONFIGURATION
// =============================================================================

export interface ColumnConfig {
  index: number;
  header: string;
  headerTint: string;
  cellTint: string;
}

// Default column configurations
export const COLUMN_CONFIGS: ColumnConfig[] = [
  {
    index: 0,
    header: "Entry",
    headerTint: "rgba(100, 200, 100, 0.15)",
    cellTint: "rgba(100, 200, 100, 0.08)",
  },
  {
    index: 1,
    header: "Exit",
    headerTint: "rgba(200, 100, 100, 0.15)",
    cellTint: "rgba(200, 100, 100, 0.08)",
  },
];

// =============================================================================
// GRID CELL PROPS - Base interface for all grid cell implementations
// =============================================================================

export interface BaseGridCellProps {
  colIndex: number;
  rowIndex: number;
  blocks: BlockData[];
  currentPrice: number | null;
  priceError?: string | null;
  tint?: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

// Extended props for interactive grid cells (Strategy Assembly)
export interface InteractiveGridCellProps extends BaseGridCellProps {
  isOver: boolean;
  isValidTarget: boolean;
  isDisabled: boolean;
  align: "left" | "right";
  strategyPattern: StrategyPattern;
  rowLabel: string;
  showPrimaryWarning: boolean;
  onBlockDragStart: (id: string) => void;
  onBlockDragEnd: (id: string, x: number, y: number) => void;
  onBlockVerticalDrag: (id: string, mouseY: number) => void;
}

// Props for read-only grid cells (Active Orders)
export interface ReadOnlyGridCellProps extends BaseGridCellProps {
  // Read-only cells don't need drag handlers or validation states
}

// =============================================================================
// STRATEGY PATTERN TYPES
// =============================================================================

export type StrategyPattern = "conditional" | "bulk";

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

// =============================================================================
// ORDER CONFIG TYPES
// =============================================================================

export interface OrderConfigEntry {
  col: number;
  row: number;
  type: string;
  axis?: 1 | 2;
  yPosition?: number;
}

export type OrderConfig = Record<string, OrderConfigEntry>;
