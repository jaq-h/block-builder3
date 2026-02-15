// Common grid components - shared across widgets

// Re-export types from consolidated types
export type {
  BlockData,
  GridData,
  CellPosition,
  CellDisplayMode,
  ScaleConfig,
  ColumnConfig,
  BaseGridCellProps,
  InteractiveGridCellProps,
  ReadOnlyGridCellProps,
  StrategyPattern,
} from "../../../types/grid";

export { COLUMN_CONFIGS } from "../../../types/grid";

// Re-export styles from consolidated styles
export {
  SCALE_CONFIG,
  getScaleLabels,
  MARKET_PADDING,
  BLOCK_HEIGHT,
  MARKET_GAP,
  getTrackHeight,
  getTrackStart,
  getTrackEnd,
  getPositionPercent,
  getInteractiveCellContainerProps,
  getReadOnlyCellContainerProps,
  rowLabelBadge,
  cellHeader,
  orderTypeLabel,
  getAxisLabelItemProps,
  sliderArea,
  getAxisColumnProps,
  getPercentageScaleProps,
  getSliderTrackProps,
  getMarketPriceLineProps,
  getMarketPriceLabelProps,
  getBlockPositionerProps,
  getDashedIndicatorProps,
  getPercentageLabelProps,
  getCalculatedPriceLabelProps,
  emptyPlaceholder,
  centeredContainer,
  warningAlert,
  warningIcon,
  warningText,
  warningSubtext,
  statusBadge,
  emptyCellMessage,
} from "../../../styles/grid";

// Re-export utilities from consolidated utils
export {
  getCellDisplayMode,
  calculatePrice,
  formatPrice,
  shouldBeDescending,
  getAlignment,
  getColumnHeaderTint,
  getColumnCellTint,
  findCellAtPosition,
} from "../../../utils";

// Export components
export { default as ReadOnlyGridCell } from "./ReadOnlyGridCell";
export { default as GridCell } from "./GridCell";
export { default as ProviderColumn } from "./ProviderColumn";
