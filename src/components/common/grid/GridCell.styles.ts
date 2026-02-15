// GridCell styled components - Re-exports from consolidated grid styles

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
  getInteractiveCellContainerProps,
  getReadOnlyCellContainerProps,

  // Row label badge
  rowLabelBadge,

  // Cell header
  cellHeader,
  orderTypeLabel,

  // Axis components
  getAxisLabelItemProps,
  sliderArea,
  getAxisColumnProps,

  // Percentage scale & slider track
  getPercentageScaleProps,
  getSliderTrackProps,

  // Market price line & label
  getMarketPriceLineProps,
  getMarketPriceLabelProps,

  // Block positioner
  getBlockPositionerProps,

  // Dashed indicator
  getDashedIndicatorProps,

  // Percentage label
  getPercentageLabelProps,

  // Calculated price label
  getCalculatedPriceLabelProps,

  // Empty state & placeholders
  emptyPlaceholder,
  centeredContainer,

  // Warning alert
  warningAlert,
  warningIcon,
  warningText,
  warningSubtext,

  // Status badge (for Active Orders)
  statusBadge,

  // Empty cell message
  emptyCellMessage,
} from "../../../styles/grid";
