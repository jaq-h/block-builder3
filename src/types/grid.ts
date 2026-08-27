// =============================================================================
// GRID TYPES - Consolidated grid type definitions
// =============================================================================

import type { AxisType, SvgIcon } from "../data/orderTypes";

// =============================================================================
// BLOCK DATA TYPES
// =============================================================================

export type BlockDirection = "upside" | "downside";

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
  /** Price direction relative to market. "upside" = above market, "downside" = below. Set at placement time. */
  direction: BlockDirection;
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

/**
 * What a placement primitive actually did, reported by the code that did it
 * rather than inferred by the caller from a nullable id. `gridAnnouncements`
 * turns this into the words the user hears, so the sentence and the grid can
 * never disagree: a same-cell release is `unchanged`, not a refusal.
 */
export type PlacementResult =
  /** A new block was created in the target cell, from the palette. */
  | { status: "created"; blockId: string }
  /** An existing block left one cell and arrived in another. */
  | { status: "moved"; blockId: string }
  /** The block was already in the target cell, so nothing changed. */
  | { status: "unchanged"; blockId: string }
  /**
   * The grid would not take the order; nothing on the grid changed. `at` is
   * where the block still is, read from the grid at the moment of the call, so
   * the sentence names a cell the grid has just confirmed rather than one
   * snapshotted when the block was picked up. A palette order has no `at`,
   * because it is nowhere.
   *
   * `reason` separates the two refusals a user experiences quite differently.
   * Without it the grid says a cell "cannot take this order", which is true of
   * a cell the placement rules exclude and misleading for a placed block, which
   * no cell will take because placed blocks do not change cells at all
   * (decision D9). One is about the cell; the other is about the rule.
   *
   * Only the rule needs naming, so the member is one value and its absence.
   * A placement-rules refusal leaves it off and takes the fallthrough sentence
   * in `describePlacement`, which already words that case correctly - a second
   * name meaning "the default" would read as a distinction the announcer does
   * not draw.
   */
  | {
      status: "refused";
      at?: CellPosition;
      reason?: "staysInCell";
    }
  /**
   * The block named is not on the grid at all - a carry can outlive the grid
   * it was started against, and the block may have been cleared away since.
   * There is no cell to name, so the sentence for this must name none.
   */
  | { status: "gone" };

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

// Props for read-only grid cells (Active Orders).
// Read-only cells need no drag handlers or validation state, so this is
// currently an alias rather than an extension.
export type ReadOnlyGridCellProps = BaseGridCellProps;

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
  direction?: BlockDirection;
}

export type OrderConfig = Record<string, OrderConfigEntry>;
