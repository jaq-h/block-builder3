// =============================================================================
// GRID UTILITIES - Consolidated grid utility functions
// =============================================================================

import type {
  BlockData,
  GridData,
  CellPosition,
  StrategyPattern,
} from "../types/grid";
import type { OrderTypeDefinition } from "../data/orderTypes";
import { GRID_CONFIG } from "../data/orderTypes";
import { formatMarketPrice } from "./marketFormat";
import type { ActiveMarket } from "../types/markets";

// =============================================================================
// TYPES
// =============================================================================

export type ProviderBlockData = OrderTypeDefinition;

// =============================================================================
// CONSTANTS
// =============================================================================

export const FIRST_PLACEMENT_ROW = GRID_CONFIG.firstPlacementRow;

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
  // Bulk pattern: free placement in any row, ignoring type system row restrictions
  if (pattern === "bulk") {
    return true;
  }

  if (!allowedRows.includes(rowIndex)) return false;

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
// PRICE FORMATTING
// =============================================================================
//
// Which way a cell's scale runs, where a block sits on it and what that is
// worth all belong to `utils/blockMapping.ts`, the single owner of the
// block-to-price mapping. This module owns the grid's *structure* - what is
// where, and which cells will take an order - and deliberately holds no second
// opinion about any of those four facts.

/**
 * Format a price for display, at the selected pair's own precision.
 *
 * A flat two decimals was right for exactly one market. ARB/USD prices to four
 * (`$0.3421`, not `$0.34`) and BTC/USD to one, so a fixed width either invents
 * precision the pair does not have or hides the digits that distinguish two
 * price levels. The market is optional, and a caller that has not got one yet
 * gets no number at all rather than a guessed width; see `formatMarketPrice`,
 * which owns that decision and explains it.
 */
export const formatPrice = (
  price: number | null,
  market?: ActiveMarket | null,
): string => formatMarketPrice(price, market);

// =============================================================================
// COLUMN HELPERS
// =============================================================================

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
//
// `findCellAtPosition` lived here and is gone. It asked whether the POINTER was
// inside a cell's rect, which left a dead band half a dragged tile wide around
// every cell and swallowed the whole gutter between two of them - a release
// there showed a block plainly overlapping a cell and dropped it nowhere.
// Which cell a released block lands in is now `utils/dropTarget.ts`, which
// tests the block's own edges and owns the answer for the drop and for the
// target highlight alike.

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
  return isCellValidForPlacement(
    hoveredGridCell.col,
    hoveredGridCell.row,
    block.allowedRows,
    grid,
    pattern,
  );
};
