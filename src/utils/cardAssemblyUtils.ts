// Types
export interface BlockData {
  id: string;
  icon?: string;
  abrv: string;
  allowedRows: number[];
}

export interface ProviderBlockData {
  type: string;
  abrv: string;
  icon?: string;
  allowedRows: number[];
}

export type GridData = BlockData[][][];

export interface CellPosition {
  col: number;
  row: number;
}

// Constants
export const FIRST_PLACEMENT_ROW = 1;

/**
 * Check if any block has been placed in the grid
 */
export const hasAnyBlockBeenPlaced = (grid: GridData): boolean => {
  return grid.some((column) => column.some((row) => row.length > 0));
};

/**
 * Get all cells that have blocks
 */
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

/**
 * Get diagonal cells from all occupied cells
 */
export const getDiagonalCells = (
  occupiedCells: CellPosition[],
  numColumns: number,
  numRows: number
): Set<string> => {
  const diagonals = new Set<string>();

  occupiedCells.forEach(({ col, row }) => {
    // Four diagonal directions
    const diagonalOffsets = [
      { col: -1, row: -1 }, // top-left
      { col: -1, row: 1 }, // bottom-left
      { col: 1, row: -1 }, // top-right
      { col: 1, row: 1 }, // bottom-right
    ];

    diagonalOffsets.forEach((offset) => {
      const newCol = col + offset.col;
      const newRow = row + offset.row;

      // Check bounds
      if (newCol >= 0 && newCol < numColumns && newRow >= 0 && newRow < numRows) {
        diagonals.add(`${newCol}-${newRow}`);
      }
    });
  });

  // Remove cells that are already occupied
  occupiedCells.forEach(({ col, row }) => {
    diagonals.delete(`${col}-${row}`);
  });

  return diagonals;
};

/**
 * Check if a cell is a valid target considering placement rules
 */
export const isCellValidForPlacement = (
  colIndex: number,
  rowIndex: number,
  allowedRows: number[],
  grid: GridData
): boolean => {
  // First, check if the row is in the block's allowed rows
  if (!allowedRows.includes(rowIndex)) {
    return false;
  }

  // If no block has been placed yet, only allow middle row of either column
  if (!hasAnyBlockBeenPlaced(grid)) {
    return rowIndex === FIRST_PLACEMENT_ROW;
  }

  // After first placement, only allow diagonal cells
  const occupiedCells = getOccupiedCells(grid);
  const diagonalCells = getDiagonalCells(occupiedCells, grid.length, grid[0].length);
  return diagonalCells.has(`${colIndex}-${rowIndex}`);
};

/**
 * Get alignment based on column index
 */
export const getAlignment = (colIndex: number): "left" | "right" => {
  return colIndex === 0 ? "right" : "left";
};

/**
 * Check if a cell should be disabled (darkened)
 */
export const isCellDisabled = (
  colIndex: number,
  rowIndex: number,
  grid: GridData
): boolean => {
  if (!hasAnyBlockBeenPlaced(grid)) {
    // Before first placement, disable all cells except middle row
    return rowIndex !== FIRST_PLACEMENT_ROW;
  }
  // After first placement, disable cells that are not diagonal to any occupied cell
  // and are not already occupied
  const isOccupied = grid[colIndex][rowIndex].length > 0;
  const occupiedCells = getOccupiedCells(grid);
  const diagonalCells = getDiagonalCells(occupiedCells, grid.length, grid[0].length);
  const isDiagonal = diagonalCells.has(`${colIndex}-${rowIndex}`);
  return !isOccupied && !isDiagonal;
};

/**
 * Find the cell at a given x, y position using data attributes
 */
export const findCellAtPosition = (
  x: number,
  y: number
): { col: number; row: number } | null => {
  const elements = document.querySelectorAll("[data-col][data-row]");

  for (const element of Array.from(elements)) {
    const rect = element.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      const col = parseInt(element.getAttribute("data-col") || "-1", 10);
      const row = parseInt(element.getAttribute("data-row") || "-1", 10);
      if (col !== -1 && row !== -1) {
        return { col, row };
      }
    }
  }

  return null;
};

/**
 * Find a block in the grid by its ID
 */
export const findBlockInGrid = (
  grid: GridData,
  id: string
): { col: number; row: number; block: BlockData } | null => {
  for (let colIndex = 0; colIndex < grid.length; colIndex++) {
    for (let rowIndex = 0; rowIndex < grid[colIndex].length; rowIndex++) {
      const block = grid[colIndex][rowIndex].find((b) => b.id === id);
      if (block) {
        return { col: colIndex, row: rowIndex, block };
      }
    }
  }
  return null;
};

/**
 * Clear all blocks from the grid
 */
export const clearGrid = (numColumns: number, numRows: number): GridData => {
  return Array.from({ length: numColumns }, () =>
    Array.from({ length: numRows }, () => [])
  );
};

/**
 * Reverse the blocks between columns (swap columns)
 */
export const reverseColumns = (grid: GridData): GridData => {
  return [
    [...grid[1].map((row) => [...row])],
    [...grid[0].map((row) => [...row])],
  ];
};

/**
 * Check if a provider block should be highlighted based on hovered grid cell
 */
export const isProviderBlockHighlighted = (
  block: ProviderBlockData,
  hoveredGridCell: CellPosition | null,
  isDragging: boolean,
  grid: GridData
): boolean => {
  if (isDragging || !hoveredGridCell) return false;

  // Check if the block can be placed in the hovered cell
  const canPlaceInRow = block.allowedRows.includes(hoveredGridCell.row);
  const cellIsValid = isCellValidForPlacement(
    hoveredGridCell.col,
    hoveredGridCell.row,
    block.allowedRows,
    grid
  );

  return canPlaceInRow && cellIsValid;
};
