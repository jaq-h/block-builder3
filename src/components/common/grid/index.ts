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
  InteractiveCellContainer,
  ReadOnlyCellContainer,
  RowLabelBadge,
  CellHeader,
  OrderTypeLabel,
  AxisLabelItem,
  SliderArea,
  AxisColumn,
  PercentageScale,
  SliderTrack,
  MarketPriceLine,
  MarketPriceLabel,
  BlockPositioner,
  DashedIndicator,
  PercentageLabel,
  CalculatedPriceLabel,
  EmptyPlaceholder,
  CenteredContainer,
  WarningAlert,
  WarningIcon,
  WarningText,
  WarningSubtext,
  StatusBadge,
  EmptyCellMessage,
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
