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
  removeBlockFromGrid,
  clearCellInGrid,
  getAllBlocks,
  reverseColumns,
  // Diagonal placement
  getDiagonalCells,
  // Cell validation & placement
  isCellValidForPlacement,
  isCellDisabled,
  hasMiddleRowOrder,
  hasConditionalWithoutPrimary,
  // Price formatting
  formatPrice,
  // Column helpers
  getAlignment,
  getColumnHeaderTint,
  getColumnCellTint,
  // Provider block helpers
  isProviderBlockHighlighted,
} from "./grid";

// The block-to-price mapping - one owner for axis membership, position,
// direction and a cell's scale, read by the chip, the chart and the payload.
export {
  MAX_OFFSET_PERCENT,
  MIN_OFFSET_PERCENT,
  clampOffset,
  offsetForOrder,
  legOfBlock,
  cellDrawsPriceAxis,
  atMarketBlocksIn,
  getCellDisplayMode,
  cellDirection,
  directionForNewCell,
  isDescending,
  stampCellDirection,
  addBlocksToCell,
  normaliseCellDirections,
  reverseGrid,
  priceForOffset,
  priceForOrderOffset,
  signedOffset,
  orderConfigFromGrid,
  type PriceAxisLeg,
} from "./blockMapping";

// Price formula shared by the grid display and the order mapper
export { priceAtOffset } from "./price";

// Per-pair formatting - the one owner of "how many decimals does this pair use"
export {
  roundToTick,
  formatPriceForAPI,
  formatQuantityForAPI,
  formatMarketPrice,
} from "./marketFormat";

// Price format readiness - the one owner of "can this pair's prices be written"
export {
  priceFormatReadiness,
  precisionOf,
  pendingPriceFormat,
  type PriceFormatReadiness,
} from "./priceFormatReadiness";

// Block factory utilities
export {
  createBlocksFromOrderType,
  axesForBlockAxis,
  shouldShowPercentage,
  type BlockCreationContext,
  type CreatedBlocks,
} from "./blockFactory";

// Block command model - the pure select-then-place state machine
export {
  commandReducer,
  validTargetsFor,
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

// Grid announcements - the single owner of every sentence the grid speaks
export {
  describeOutcome,
  type PlacementVia,
  type DragEndReason,
  type PickUpRefusal,
  type GridOutcome,
} from "./gridAnnouncements";

// Drop targeting - the single owner of which cell a released block lands in
export {
  blockBoxAt,
  resolveDropCell,
  cellBoxesFromDom,
  resolveDrop,
  type Box,
  type CellBox,
  type CellBoxes,
  type DropPoint,
  type DropResolution,
} from "./dropTarget";
