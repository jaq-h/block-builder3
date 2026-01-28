// =============================================================================
// STYLES INDEX - Central export point for all shared styles
// =============================================================================

// Grid styles - cell containers, labels, indicators, etc.
export {
  // Scale configuration
  SCALE_CONFIG,
  getScaleLabels,
  // Layout constants
  MARKET_PADDING,
  BLOCK_HEIGHT,
  MARKET_GAP,
  // Helper functions
  getTrackHeight,
  getTrackStart,
  getTrackEnd,
  getPositionPercent,
  // Animations
  breathingAnimation,
  // Cell containers
  InteractiveCellContainer,
  ReadOnlyCellContainer,
  // Row label badge
  RowLabelBadge,
  // Cell header
  CellHeader,
  OrderTypeLabel,
  // Axis components
  AxisLabelItem,
  SliderArea,
  AxisColumn,
  // Percentage scale & slider track
  PercentageScale,
  SliderTrack,
  // Market price line & label
  MarketPriceLine,
  MarketPriceLabel,
  // Block positioner
  BlockPositioner,
  // Dashed indicator
  DashedIndicator,
  // Percentage label
  PercentageLabel,
  // Calculated price label
  CalculatedPriceLabel,
  // Empty state & placeholders
  EmptyPlaceholder,
  CenteredContainer,
  // Warning alert
  WarningAlert,
  WarningIcon,
  WarningText,
  WarningSubtext,
  // Status badge
  StatusBadge,
  // Empty cell message
  EmptyCellMessage,
  // Column tint helpers
  columnTints,
} from "./grid";

// Shared styles
export * from "./shared";

// Theme configuration
export * from "./theme";
