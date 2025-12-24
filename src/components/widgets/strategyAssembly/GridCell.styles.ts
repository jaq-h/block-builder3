// GridCell styled components
import styled from "styled-components";

// =============================================================================
// SCALE CONFIGURATION - Single Source of Truth
// =============================================================================

export const SCALE_CONFIG = {
  MIN_PERCENT: 0, // Minimum percentage value
  MAX_PERCENT: 50, // Maximum percentage value
  STEP_COUNT: 5, // Number of labels on the scale (0%, 12.5%, 25%, 37.5%, 50%)
} as const;

// Generate scale labels as whole numbers for display
export const getScaleLabels = (isDescending: boolean): string[] => {
  const { MIN_PERCENT, MAX_PERCENT, STEP_COUNT } = SCALE_CONFIG;
  const step = (MAX_PERCENT - MIN_PERCENT) / (STEP_COUNT - 1);
  const labels: string[] = [];

  for (let i = 0; i < STEP_COUNT; i++) {
    const value = MIN_PERCENT + step * i;
    labels.push(`${Math.round(value)}%`);
  }

  // Descending: 0% at top (near market), increasing downward
  // Ascending: 0% at bottom (near market), increasing upward
  return isDescending ? labels : labels.reverse();
};

// =============================================================================
// LAYOUT CONSTANTS
// =============================================================================

export const MARKET_PADDING = 20; // Space for market axis and price label
export const BLOCK_HEIGHT = 40; // Height of block element
export const MARKET_GAP = 10; // Gap between market axis and 0% block position

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export const getTrackHeight = () =>
  `calc(100% - ${BLOCK_HEIGHT + MARKET_PADDING + MARKET_GAP}px)`;

export const getTrackStart = (isDescending: boolean) =>
  isDescending ? MARKET_PADDING + MARKET_GAP : 0;

export const getTrackEnd = (isDescending: boolean) =>
  isDescending ? 0 : MARKET_PADDING + MARKET_GAP;

// Convert yPosition (0 to MAX_PERCENT) to track percentage (0 to 1)
export const getPositionPercent = (
  yPosition: number,
  isDescending: boolean,
) => {
  const { MAX_PERCENT } = SCALE_CONFIG;
  // Clamp yPosition to valid range
  const clampedPosition = Math.max(0, Math.min(MAX_PERCENT, yPosition));
  // Convert to 0-1 range based on max percent
  const normalizedPosition = clampedPosition / MAX_PERCENT;
  return isDescending ? normalizedPosition : 1 - normalizedPosition;
};

// =============================================================================
// ANIMATIONS
// =============================================================================

const breathingAnimation = `
  @keyframes breathing {
    0%, 100% {
      border-color: rgba(255, 255, 255, 0.5);
      box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.1);
    }
    50% {
      border-color: rgba(255, 255, 255, 1);
      box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.2);
    }
  }
`;

// =============================================================================
// CELL CONTAINER
// =============================================================================

interface CellContainerProps {
  $isOver: boolean;
  $isValidTarget: boolean;
  $isDisabled: boolean;
  $align: "left" | "right";
  $tint?: string;
}

export const CellContainer = styled.div<CellContainerProps>`
  ${breathingAnimation}
  flex: 1;
  position: relative;
  border: 1px solid
    ${({ $isOver, $isValidTarget, $isDisabled }) =>
      $isDisabled
        ? "transparent"
        : $isOver
          ? "var(--outline-color-secondary)"
          : $isValidTarget
            ? "var(--accent-color-purple)"
            : "#e5e7eb"};
  box-shadow: ${({ $isOver, $isValidTarget }) =>
    $isOver
      ? "0 0 0 1px var(--outline-color-secondary)"
      : $isValidTarget
        ? "0 0 0 1px var(--accent-color-purple)"
        : "none"};
  border-radius: 8px;
  margin: 4px;
  background-color: ${({ $isDisabled, $tint }) =>
    $isDisabled ? "rgb(22, 18, 31)" : $tint || "#686b8214"};
  background-image: ${({ $isOver, $isValidTarget, $isDisabled }) => {
    if ($isDisabled) return "none";
    if ($isOver) {
      return `
        linear-gradient(to right, rgba(255, 255, 255, 0.4) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 1px, transparent 1px)
      `;
    }
    if ($isValidTarget) {
      return `
        linear-gradient(to right, rgba(255, 255, 255, 0.2) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 1px, transparent 1px)
      `;
    }
    return "none";
  }};
  background-size: ${({ $isOver, $isValidTarget }) =>
    $isOver || $isValidTarget ? "20px 20px" : "auto"};
  animation: ${({ $isOver, $isValidTarget }) =>
    $isOver || $isValidTarget ? "breathing 1.5s ease-in infinite" : "none"};
  display: flex;
  flex-direction: column;
  padding: 8px;
  min-height: 220px;
  overflow: visible;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    background-image 0.3s ease-out,
    background-color 0.2s;
`;

// =============================================================================
// ROW LABEL BADGE
// =============================================================================

export const RowLabelBadge = styled.div<{ $type: "primary" | "conditional" }>`
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background-color: ${({ $type }) =>
    $type === "primary"
      ? "rgba(30, 60, 120, 0.4)"
      : "rgba(200, 150, 50, 0.25)"};
  color: ${({ $type }) =>
    $type === "primary"
      ? "rgba(130, 170, 255, 0.9)"
      : "rgba(255, 200, 100, 0.9)"};
  border: 1px solid
    ${({ $type }) =>
      $type === "primary"
        ? "rgba(60, 100, 180, 0.6)"
        : "rgba(200, 150, 50, 0.5)"};
`;

// =============================================================================
// CELL HEADER
// =============================================================================

export const CellHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 4px;
`;

export const OrderTypeLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  text-transform: capitalize;
`;

// =============================================================================
// AXIS COMPONENTS
// =============================================================================

export const AxisLabelItem = styled.span<{
  $position?: "above" | "below";
  $isSingleAxis?: boolean;
}>`
  position: absolute;
  ${({ $position }) => ($position === "above" ? "top: 2px" : "bottom: 2px")};
  left: ${({ $isSingleAxis }) => ($isSingleAxis !== false ? "50%" : "35%")};
  transform: translateX(-50%);
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  pointer-events: none;
`;

export const SliderArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: row;
  overflow: visible;
`;

export const AxisColumn = styled.div<{ $isSingleAxis?: boolean }>`
  position: relative;
  flex: ${({ $isSingleAxis }) => ($isSingleAxis ? "1" : "0 0 50%")};
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: visible;
`;

// =============================================================================
// PERCENTAGE SCALE & SLIDER TRACK
// =============================================================================

export const PercentageScale = styled.div<{ $isDescending?: boolean }>`
  position: absolute;
  left: 0;
  top: ${({ $isDescending }) =>
    getTrackStart($isDescending ?? false) + BLOCK_HEIGHT / 2}px;
  bottom: ${({ $isDescending }) =>
    getTrackEnd($isDescending ?? false) + BLOCK_HEIGHT / 2}px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 8px;
  color: rgba(255, 255, 255, 0.25);
  pointer-events: none;
`;

export const SliderTrack = styled.div<{
  $isDescending?: boolean;
  $isSingleAxis?: boolean;
}>`
  position: absolute;
  left: ${({ $isSingleAxis }) => ($isSingleAxis !== false ? "50%" : "35%")};
  top: ${({ $isDescending }) =>
    getTrackStart($isDescending ?? false) + BLOCK_HEIGHT / 2}px;
  bottom: ${({ $isDescending }) =>
    getTrackEnd($isDescending ?? false) + BLOCK_HEIGHT / 2}px;
  width: 2px;
  background: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.3),
    rgba(255, 255, 255, 0.1)
  );
  transform: translateX(-50%);
  pointer-events: none;
`;

// =============================================================================
// MARKET PRICE LINE & LABEL (Cell-level, centered across all axes)
// =============================================================================

export const MarketPriceLine = styled.div<{ $isDescending?: boolean }>`
  position: absolute;
  left: 0;
  right: 0;
  ${({ $isDescending }) =>
    $isDescending ? "top" : "bottom"}: ${MARKET_PADDING}px;
  height: 0;
  border-top: 2px dashed var(--outline-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: none;
`;

export const MarketPriceLabel = styled.div<{ $isDescending?: boolean }>`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  ${({ $isDescending }) => ($isDescending ? "bottom: 6px" : "top: 6px")};
  font-size: 9px;
  font-weight: 500;
  color: var(--text-color-primary);
  white-space: nowrap;
  background-color: var(--ds-bg-color);
  padding: 2px 6px;
  border-radius: 3px;
  z-index: 6;
`;

// =============================================================================
// BLOCK POSITIONER
// =============================================================================

export const BlockPositioner = styled.div<{
  $yPosition: number;
  $isDescending?: boolean;
  $isSingleAxis?: boolean;
}>`
  position: absolute;
  left: ${({ $isSingleAxis }) => ($isSingleAxis !== false ? "0" : "-15%")};
  right: ${({ $isSingleAxis }) => ($isSingleAxis !== false ? "0" : "15%")};
  top: ${({ $yPosition, $isDescending }) => {
    const isDesc = $isDescending ?? false;
    const percent = getPositionPercent($yPosition, isDesc);
    const offset = getTrackStart(isDesc);
    return `calc(${getTrackHeight()} * ${percent} + ${offset}px)`;
  }};
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 2;

  > * {
    pointer-events: auto;
  }
`;

// =============================================================================
// DASHED INDICATOR
// =============================================================================

export const DashedIndicator = styled.div<{
  $yPosition: number;
  $isDescending?: boolean;
  $isSingleAxis?: boolean;
}>`
  position: absolute;
  left: ${({ $isSingleAxis }) => ($isSingleAxis !== false ? "50%" : "35%")};
  transform: translateX(-50%);
  width: 1px;
  border-left: 2px dashed var(--border-color-options-row-underscored);
  pointer-events: none;
  z-index: 1;
  ${({ $yPosition, $isDescending }) => {
    const isDesc = $isDescending ?? false;
    const percent = getPositionPercent($yPosition, isDesc);
    const offset = getTrackStart(isDesc);
    const blockTop = `calc(${getTrackHeight()} * ${percent} + ${offset + BLOCK_HEIGHT / 2}px)`;
    const endOffset = getTrackEnd(isDesc);
    return `top: ${blockTop}; bottom: ${endOffset + BLOCK_HEIGHT / 2}px;`;
  }}
`;

// =============================================================================
// PERCENTAGE LABEL (Absolute positioned, immediately right of block)
// =============================================================================

export const PercentageLabel = styled.div<{
  $yPosition: number;
  $isDescending?: boolean;
  $sign?: string;
  $isSingleAxis?: boolean;
}>`
  position: absolute;
  font-size: 10px;
  font-weight: 500;
  color: var(--accent-color-purple);
  pointer-events: none;
  z-index: 9999;
  white-space: nowrap;
  /* Position to the right of the block - 50% for single axis, 35% for dual axis */
  left: ${({ $isSingleAxis }) =>
    $isSingleAxis !== false ? "calc(50% + 25px)" : "calc(35% + 25px)"};
  top: ${({ $yPosition, $isDescending }) => {
    const isDesc = $isDescending ?? false;
    const percent = getPositionPercent($yPosition, isDesc);
    const offset = getTrackStart(isDesc);
    return `calc(${getTrackHeight()} * ${percent} + ${offset + BLOCK_HEIGHT / 2 - 6}px)`;
  }};

  &::before {
    content: "${({ $sign }) => $sign || ""}";
    margin-right: 1px;
  }
`;

// =============================================================================
// CALCULATED PRICE LABEL (Absolute positioned, immediately right of block)
// =============================================================================

export const CalculatedPriceLabel = styled.div<{
  $yPosition: number;
  $isDescending?: boolean;
  $isSingleAxis?: boolean;
  $isBuy?: boolean;
}>`
  position: absolute;
  font-size: 9px;
  font-weight: 500;
  color: var(--text-color-primary);
  pointer-events: none;
  z-index: 9999;
  white-space: nowrap;
  background-color: ${({ $isBuy }) =>
    $isBuy ? "rgba(76, 175, 80, 0.85)" : "rgba(244, 67, 54, 0.85)"};
  padding: 2px 6px;
  border-radius: 3px;
  /* Position to the right of the block - 50% for single axis, 35% for dual axis */
  left: ${({ $isSingleAxis }) =>
    $isSingleAxis !== false ? "calc(50% + 25px)" : "calc(35% + 25px)"};
  top: ${({ $yPosition, $isDescending }) => {
    const isDesc = $isDescending ?? false;
    const percent = getPositionPercent($yPosition, isDesc);
    const offset = getTrackStart(isDesc);
    return `calc(${getTrackHeight()} * ${percent} + ${offset + BLOCK_HEIGHT / 2 + 8}px)`;
  }};
`;

// =============================================================================
// EMPTY STATE & PLACEHOLDERS
// =============================================================================

export const EmptyPlaceholder = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(104, 107, 130, 0.5);
  font-size: 12px;
`;

export const CenteredContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

// =============================================================================
// WARNING ALERT
// =============================================================================

export const WarningAlert = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  margin: 8px;
  border: 2px dashed var(--border-color-options-row-underscored);
  border-radius: 8px;
  background-color: rgba(133, 91, 251, 0.1);
  text-align: center;
`;

export const WarningIcon = styled.div`
  font-size: 24px;
  margin-bottom: 8px;
`;

export const WarningText = styled.div`
  font-size: 11px;
  color: var(--accent-color-purple);
  font-weight: 500;
`;

export const WarningSubtext = styled.div`
  font-size: 9px;
  color: rgba(133, 91, 251, 0.6);
  margin-top: 4px;
`;
