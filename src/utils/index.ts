// =============================================================================
// UTILS INDEX - Central export point for all utility functions
// =============================================================================

// Grid utilities
export {
  // Types
  type ProviderBlockData,
  // Constants
  FIRST_PLACEMENT_ROW,
  // Grid creation & manipulation
  clearGrid,
  createEmptyGrid,
  hasAnyBlockBeenPlaced,
  getOccupiedCells,
  countBlocks,
  findBlockInGrid,
  getAllBlocks,
  reverseColumns,
  // Diagonal placement
  getDiagonalCells,
  // Cell validation & placement
  isCellValidForPlacement,
  isCellDisabled,
  hasMiddleRowOrder,
  hasConditionalWithoutPrimary,
  // Cell display mode
  getCellDisplayMode,
  // Price calculations
  calculatePrice,
  formatPrice,
  // Scale & position helpers
  shouldBeDescending,
  getAlignment,
  getColumnHeaderTint,
  getColumnCellTint,
  // DOM position helpers
  findCellAtPosition,
  calculateYPosition,
  findAxisAtPosition,
  findCellAndPositionData,
  // Provider block helpers
  isProviderBlockHighlighted,
} from "./grid";

// Block factory utilities
export {
  createBlocksFromOrderType,
  buildOrderConfigEntry,
  shouldShowPercentage,
  isBlockVerticallyDraggable,
  type BlockCreationContext,
  type CreatedBlocks,
} from "./blockFactory";
