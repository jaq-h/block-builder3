// =============================================================================
// GRID UTILITIES - Consolidated grid utility functions
// =============================================================================

import type {
  BlockData,
  GridData,
  CellPosition,
  CellDisplayMode,
  StrategyPattern,
} from "../types/grid";
import type { OrderTypeDefinition } from "../data/orderTypes";
import { GRID_CONFIG } from "../data/orderTypes";

// =============================================================================
// TYPES
// =============================================================================

export type ProviderBlockData = OrderTypeDefinition;

// =============================================================================
// CONSTANTS
// =============================================================================

export const FIRST_PLACEMENT_ROW = GRID_CONFIG.firstPlacementRow;

// Layout constants for position calculations
const HEADER_HEIGHT = 36;
const MARKET_PADDING = 20;
const BLOCK_HEIGHT = 40;
const MARKET_GAP = 10;

// =============================================================================
// GRID CREATION & MANIPULATION
// =============================================================================

/** Clear all blocks from the grid / create empty grid with dimensions */
export const clearGrid = (numColumns: number, numRows: number): GridData =>
  Array.from({ length: numColumns }, () =>
    Array.from({ length: numRows }, () => []),
  );

/** Create an empty grid using default config */
export const createEmptyGrid = (): GridData =>
  clearGrid(GRID_CONFIG.numColumns, GRID_CONFIG.numRows);

/** Check if any block has been placed in the grid */
export const hasAnyBlockBeenPlaced = (grid: GridData): boolean =>
  grid.some((column) => column.some((row) => row.length > 0));

/** Get all cells that have blocks */
export const getOccupiedCells = (grid: GridData): CellPosition[] => {
  const occupied: CellPosition[] = [];
  grid.forEach((column, colIndex) => {
    column.forEach((row, rowIndex) => {
      if (row.length > 0) {
        occupied.push({ col: colIndex, row: rowIndex });
      }
    });
  });
  return occupied;
};

/** Count total number of blocks in the grid */
export const countBlocks = (grid: GridData): number => {
  let count = 0;
  grid.forEach((column) => {
    column.forEach((row) => {
      count += row.length;
    });
  });
  return count;
};

/** Find a block in the grid by its ID */
export const findBlockInGrid = (
  grid: GridData,
  id: string,
): { col: number; row: number; block: BlockData } | null => {
  for (let colIndex = 0; colIndex < grid.length; colIndex++) {
    for (let rowIndex = 0; rowIndex < grid[colIndex].length; rowIndex++) {
      const block = grid[colIndex][rowIndex].find((b) => b.id === id);
      if (block) return { col: colIndex, row: rowIndex, block };
    }
  }
  return null;
};

/** Get all blocks from the grid as a flat array */
export const getAllBlocks = (grid: GridData): BlockData[] => {
  const blocks: BlockData[] = [];
  grid.forEach((column) => {
    column.forEach((row) => {
      blocks.push(...row);
    });
  });
  return blocks;
};

/** Reverse the blocks between columns (swap columns) */
export const reverseColumns = (grid: GridData): GridData => [
  [...grid[1].map((row) => [...row])],
  [...grid[0].map((row) => [...row])],
];

// =============================================================================
// DIAGONAL PLACEMENT LOGIC
// =============================================================================

/** Get diagonal cells from all occupied cells */
export const getDiagonalCells = (
  occupiedCells: CellPosition[],
  numColumns: number,
  numRows: number,
): Set<string> => {
  const diagonals = new Set<string>();
  const offsets = [
    { col: -1, row: -1 },
    { col: -1, row: 1 },
    { col: 1, row: -1 },
    { col: 1, row: 1 },
  ];

  occupiedCells.forEach(({ col, row }) => {
    offsets.forEach((offset) => {
      const newCol = col + offset.col;
      const newRow = row + offset.row;
      if (
        newCol >= 0 &&
        newCol < numColumns &&
        newRow >= 0 &&
        newRow < numRows
      ) {
        diagonals.add(`${newCol}-${newRow}`);
      }
    });
  });

  occupiedCells.forEach(({ col, row }) => diagonals.delete(`${col}-${row}`));
  return diagonals;
};

// =============================================================================
// CELL VALIDATION & PLACEMENT
// =============================================================================

/** Check if a cell is a valid target considering placement rules and pattern */
export const isCellValidForPlacement = (
  colIndex: number,
  rowIndex: number,
  allowedRows: number[],
  grid: GridData,
  pattern: StrategyPattern = "conditional",
): boolean => {
  if (!allowedRows.includes(rowIndex)) return false;

  // Bulk pattern: free placement anywhere allowed
  if (pattern === "bulk") {
    return true;
  }

  // Conditional pattern: requires middle row first, then diagonal placement
  if (!hasAnyBlockBeenPlaced(grid)) {
    return rowIndex === FIRST_PLACEMENT_ROW;
  }

  const occupiedCells = getOccupiedCells(grid);
  const diagonalCells = getDiagonalCells(
    occupiedCells,
    grid.length,
    grid[0].length,
  );
  return diagonalCells.has(`${colIndex}-${rowIndex}`);
};

/** Check if a cell should be disabled (darkened) */
export const isCellDisabled = (
  colIndex: number,
  rowIndex: number,
  grid: GridData,
  pattern: StrategyPattern = "conditional",
): boolean => {
  if (pattern === "bulk") {
    return false;
  }

  if (!hasAnyBlockBeenPlaced(grid)) {
    return rowIndex !== FIRST_PLACEMENT_ROW;
  }

  const isOccupied = grid[colIndex][rowIndex].length > 0;
  const occupiedCells = getOccupiedCells(grid);
  const diagonalCells = getDiagonalCells(
    occupiedCells,
    grid.length,
    grid[0].length,
  );
  return !isOccupied && !diagonalCells.has(`${colIndex}-${rowIndex}`);
};

/** Check if middle row has a primary order */
export const hasMiddleRowOrder = (grid: GridData): boolean => {
  return grid.some((column) => column[1].length > 0);
};

/** Check if there are conditional orders without a primary order */
export const hasConditionalWithoutPrimary = (grid: GridData): boolean => {
  const hasPrimary = hasMiddleRowOrder(grid);
  const hasConditional =
    grid.some((column) => column[0].length > 0) ||
    grid.some((column) => column[2].length > 0);
  return hasConditional && !hasPrimary;
};

// =============================================================================
// CELL DISPLAY MODE
// =============================================================================

/** Determine display mode for a cell based on its blocks */
export const getCellDisplayMode = (blocks: BlockData[]): CellDisplayMode => {
  if (blocks.length === 0) return "empty";

  const hasNoAxisBlock = blocks.some((block) => block.axes.length === 0);
  if (hasNoAxisBlock) return "no-axis";

  const hasTriggerAxis = blocks.some((block) => block.axes.includes("trigger"));
  const hasLimitAxis = blocks.some((block) => block.axes.includes("limit"));

  if (hasTriggerAxis && hasLimitAxis) return "dual-axis";
  if (hasLimitAxis) return "limit-only";

  return "dual-axis";
};

// =============================================================================
// PRICE CALCULATIONS
// =============================================================================

/** Calculate price from percentage offset */
export const calculatePrice = (
  marketPrice: number | null,
  percentage: number,
  isDescending: boolean,
): number | null => {
  if (marketPrice === null) return null;
  const multiplier = isDescending ? 1 - percentage / 100 : 1 + percentage / 100;
  return marketPrice * multiplier;
};

/** Format price for display */
export const formatPrice = (price: number | null): string => {
  if (price === null) return "—";
  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// =============================================================================
// SCALE & POSITION HELPERS
// =============================================================================

/** Helper to determine if scale should be descending */
export const shouldBeDescending = (
  rowIndex: number,
  colIndex: number,
): boolean => {
  const isBuy = colIndex === 0;

  if (rowIndex === 2) {
    return !isBuy;
  }
  return isBuy;
};

/** Get alignment based on column index */
export const getAlignment = (colIndex: number): "left" | "right" =>
  colIndex === 0 ? "right" : "left";

/** Get column header tint color */
export const getColumnHeaderTint = (colIndex: number): string =>
  colIndex === 0 ? "rgba(100, 200, 100, 0.15)" : "rgba(200, 100, 100, 0.15)";

/** Get column cell tint color */
export const getColumnCellTint = (colIndex: number): string =>
  colIndex === 0 ? "rgba(100, 200, 100, 0.08)" : "rgba(200, 100, 100, 0.08)";

// =============================================================================
// DOM POSITION HELPERS
// =============================================================================

/** Find the cell at a given x, y position using data attributes */
export const findCellAtPosition = (
  x: number,
  y: number,
): CellPosition | null => {
  const elements = document.querySelectorAll("[data-col][data-row]");
  for (const element of Array.from(elements)) {
    const rect = element.getBoundingClientRect();
    if (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    ) {
      const col = parseInt(element.getAttribute("data-col") || "-1", 10);
      const row = parseInt(element.getAttribute("data-row") || "-1", 10);
      if (col !== -1 && row !== -1) return { col, row };
    }
  }
  return null;
};

// Helper functions for positioning calculations
const getTrackStart = (isDescending: boolean) =>
  isDescending ? MARKET_PADDING + MARKET_GAP : 0;

const getTrackEnd = (isDescending: boolean) =>
  isDescending ? 0 : MARKET_PADDING + MARKET_GAP;

/** Calculate Y position percentage from mouse Y within a cell */
export const calculateYPosition = (
  mouseY: number,
  cellRect: DOMRect,
  isDescending: boolean = false,
): number => {
  const trackTop =
    cellRect.top +
    HEADER_HEIGHT +
    getTrackStart(isDescending) +
    BLOCK_HEIGHT / 2;
  const trackBottom =
    cellRect.bottom - getTrackEnd(isDescending) - BLOCK_HEIGHT / 2;
  const availableHeight = trackBottom - trackTop;

  const relativeY = mouseY - trackTop;
  const clampedRelativeY = Math.max(0, Math.min(availableHeight, relativeY));

  return isDescending
    ? (clampedRelativeY / availableHeight) * 100
    : 100 - (clampedRelativeY / availableHeight) * 100;
};

/** Determine which axis based on X position within cell */
export const findAxisAtPosition = (mouseX: number, cellRect: DOMRect): 1 | 2 =>
  mouseX - cellRect.left < cellRect.width / 2 ? 1 : 2;

/** Find cell element and calculate position data for a block drop */
export const findCellAndPositionData = (
  x: number,
  y: number,
): { col: number; row: number; axis: 1 | 2; yPosition: number } | null => {
  const elements = document.querySelectorAll("[data-col][data-row]");

  for (const element of Array.from(elements)) {
    const rect = element.getBoundingClientRect();
    if (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    ) {
      const col = parseInt(element.getAttribute("data-col") || "-1", 10);
      const row = parseInt(element.getAttribute("data-row") || "-1", 10);
      if (col !== -1 && row !== -1) {
        const axis = findAxisAtPosition(x, rect);
        const isDescending = shouldBeDescending(row, col);
        const yPosition = calculateYPosition(y, rect, isDescending);
        return { col, row, axis, yPosition };
      }
    }
  }

  return null;
};

// =============================================================================
// PROVIDER BLOCK HELPERS
// =============================================================================

/** Check if a provider block should be highlighted based on hovered grid cell */
export const isProviderBlockHighlighted = (
  block: ProviderBlockData,
  hoveredGridCell: CellPosition | null,
  isDragging: boolean,
  grid: GridData,
  pattern: StrategyPattern = "conditional",
): boolean => {
  if (isDragging || !hoveredGridCell) return false;
  return (
    block.allowedRows.includes(hoveredGridCell.row) &&
    isCellValidForPlacement(
      hoveredGridCell.col,
      hoveredGridCell.row,
      block.allowedRows,
      grid,
      pattern,
    )
  );
};
