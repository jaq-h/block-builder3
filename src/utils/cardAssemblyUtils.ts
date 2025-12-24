import type { AxisType, OrderTypeDefinition } from "../data/orderTypes";
import { GRID_CONFIG } from "../data/orderTypes";

// Types
export interface BlockData {
  id: string;
  orderType: string; // Order type identifier (e.g., "limit", "stop-loss-limit")
  label: string; // Display label (e.g., "Limit", "Stop Loss Limit")
  icon?: string; // Legacy - use providerIcon instead
  providerIcon?: string; // Icon for the provider column (full order type icon)
  triggerIcon?: string; // Icon for the trigger axis slider
  limitIcon?: string; // Icon for the limit axis slider
  abrv: string;
  allowedRows: number[];
  axis: 1 | 2;
  yPosition: number; // -1 for no position
  axes: AxisType[];
  linkedBlockId?: string;
}

export type ProviderBlockData = OrderTypeDefinition;
export type GridData = BlockData[][][];
export interface CellPosition {
  col: number;
  row: number;
}

// Use centralized config
export const FIRST_PLACEMENT_ROW = GRID_CONFIG.firstPlacementRow;

/** Create an empty grid */
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

/** Strategy pattern type for validation */
export type StrategyPatternType = "conditional" | "bulk";

/** Check if a cell is a valid target considering placement rules and pattern */
export const isCellValidForPlacement = (
  colIndex: number,
  rowIndex: number,
  allowedRows: number[],
  grid: GridData,
  pattern: StrategyPatternType = "conditional",
): boolean => {
  if (!allowedRows.includes(rowIndex)) return false;

  // Bulk pattern: free placement anywhere allowed
  if (pattern === "bulk") {
    return true;
  }

  // Conditional pattern: requires middle row first, then diagonal placement
  if (!hasAnyBlockBeenPlaced(grid)) {
    // First placement must be in middle row (row 1)
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

/** Get alignment based on column index */
export const getAlignment = (colIndex: number): "left" | "right" =>
  colIndex === 0 ? "right" : "left";

/** Check if a cell should be disabled (darkened) */
export const isCellDisabled = (
  colIndex: number,
  rowIndex: number,
  grid: GridData,
  pattern: StrategyPatternType = "conditional",
): boolean => {
  // Bulk pattern: no cells are disabled
  if (pattern === "bulk") {
    return false;
  }

  // Conditional pattern: disable based on placement rules
  if (!hasAnyBlockBeenPlaced(grid)) {
    // Only middle row is enabled when grid is empty
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

/** Check if middle row has a primary order (for conditional pattern) */
export const hasMiddleRowOrder = (grid: GridData): boolean => {
  // Check both columns for middle row (row 1)
  return grid.some((column) => column[1].length > 0);
};

/** Check if there are conditional orders without a primary order */
export const hasConditionalWithoutPrimary = (grid: GridData): boolean => {
  const hasPrimary = hasMiddleRowOrder(grid);
  const hasConditional =
    grid.some((column) => column[0].length > 0) || // Top row
    grid.some((column) => column[2].length > 0); // Bottom row
  return hasConditional && !hasPrimary;
};

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

/** Clear all blocks from the grid */
export const clearGrid = (numColumns: number, numRows: number): GridData =>
  Array.from({ length: numColumns }, () =>
    Array.from({ length: numRows }, () => []),
  );

/** Reverse the blocks between columns (swap columns) */
export const reverseColumns = (grid: GridData): GridData => [
  [...grid[1].map((row) => [...row])],
  [...grid[0].map((row) => [...row])],
];

/** Check if a provider block should be highlighted based on hovered grid cell */
export const isProviderBlockHighlighted = (
  block: ProviderBlockData,
  hoveredGridCell: CellPosition | null,
  isDragging: boolean,
  grid: GridData,
  pattern: StrategyPatternType = "conditional",
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

// Layout constants matching GridCell.tsx
const HEADER_HEIGHT = 36;
const MARKET_PADDING = 20; // Space for market axis and price label
const BLOCK_HEIGHT = 40;
const MARKET_GAP = 10; // Gap between market axis and 0% block position

// Helper functions for positioning calculations (matching GridCell.tsx)
const getTrackStart = (isDescending: boolean) =>
  isDescending ? MARKET_PADDING + MARKET_GAP : 0;

const getTrackEnd = (isDescending: boolean) =>
  isDescending ? 0 : MARKET_PADDING + MARKET_GAP;

/** Helper to determine if scale should be descending (- sign) or ascending (+ sign) */
export const shouldBeDescending = (
  rowIndex: number,
  colIndex: number,
): boolean => {
  // colIndex 0 = Buy (Entry), colIndex 1 = Sell (Exit)
  // Descending (-): market axis at top, 0% near top, 100% at bottom
  // Ascending (+): market axis at bottom, 0% near bottom, 100% at top
  //
  // Top row:    { buy: -, sell: + }
  // Middle row: { buy: -, sell: + }
  // Bottom row: { buy: +, sell: - }
  const isBuy = colIndex === 0;

  if (rowIndex === 2) {
    // Bottom row: buy is ascending (+), sell is descending (-)
    return !isBuy;
  }
  // Top and Middle rows: buy is descending (-), sell is ascending (+)
  return isBuy;
};

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

  // Descending: 0% at top, 100% at bottom
  // Ascending: 100% at top, 0% at bottom
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
