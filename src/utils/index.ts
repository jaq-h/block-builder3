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
  isCellDescending,
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

// Price formula shared by the grid display and the order mapper
export { priceAtOffset } from "./price";

// Block factory utilities
export {
  createBlocksFromOrderType,
  axesForBlockAxis,
  buildOrderConfigEntry,
  shouldShowPercentage,
  isBlockVerticallyDraggable,
  type BlockCreationContext,
  type CreatedBlocks,
} from "./blockFactory";

// Block command model - the pure select-then-place state machine
export {
  commandReducer,
  validTargetsFor,
  withOriginCell,
  initialTarget,
  stepTarget,
  samePosition,
  describeCell,
  describeSource,
  IDLE_COMMAND_STATE,
  type CommandState,
  type CommandAction,
  type CommandSource,
  type CarriedBlock,
} from "./blockCommand";
