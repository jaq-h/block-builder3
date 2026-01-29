// GridCell styled components - Re-exports from consolidated grid styles
// This file maintains backward compatibility while using shared styles

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

  // Status badge (for Active Orders)
  StatusBadge,

  // Empty cell message
  EmptyCellMessage,
} from "../../../styles/grid";

// Alias for backward compatibility
// The interactive cell container was originally called CellContainer
export { InteractiveCellContainer as CellContainer } from "../../../styles/grid";
