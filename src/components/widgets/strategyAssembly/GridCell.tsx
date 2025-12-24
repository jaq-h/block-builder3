import React from "react";
import styled from "styled-components";
import Block from "../../blocks/block";
import type { BlockData } from "../../../utils/cardAssemblyUtils";
import { shouldBeDescending } from "../../../utils/cardAssemblyUtils";
import { getCellDisplayMode } from "../../../utils/blockFactory";
import type { StrategyPattern } from "./StrategyAssemblyTypes";

// Constants for layout
const BOTTOM_PADDING = 20; // Space at bottom for 0% market line
const BLOCK_HEIGHT = 40; // Height of block element

// Styled Components
interface CellContainerProps {
  $isOver: boolean;
  $isValidTarget: boolean;
  $isDisabled: boolean;
  $align: "left" | "right";
  $tint?: string;
}

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

const CellContainer = styled.div<CellContainerProps>`
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

const RowLabelBadge = styled.div<{ $type: "primary" | "conditional" }>`
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
      ? "rgba(100, 200, 100, 0.25)"
      : "rgba(200, 150, 50, 0.25)"};
  color: ${({ $type }) =>
    $type === "primary"
      ? "rgba(150, 255, 150, 0.9)"
      : "rgba(255, 200, 100, 0.9)"};
  border: 1px solid
    ${({ $type }) =>
      $type === "primary"
        ? "rgba(100, 200, 100, 0.5)"
        : "rgba(200, 150, 50, 0.5)"};
`;

const CellHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 4px;
`;

const OrderTypeLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  text-transform: capitalize;
`;

const AxisLabelItem = styled.span<{ $position?: "above" | "below" }>`
  position: absolute;
  ${({ $position }) => ($position === "above" ? "top: 2px" : "bottom: 2px")};
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  pointer-events: none;
`;

const SliderArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: row;
`;

const AxisColumn = styled.div<{ $isSingleAxis?: boolean }>`
  position: relative;
  flex: ${({ $isSingleAxis }) => ($isSingleAxis ? "1" : "0 0 50%")};
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const PercentageScale = styled.div<{ $isDescending?: boolean }>`
  position: absolute;
  left: 4px;
  top: ${BLOCK_HEIGHT / 2}px;
  bottom: ${BOTTOM_PADDING + BLOCK_HEIGHT / 2}px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 8px;
  color: rgba(255, 255, 255, 0.25);
  pointer-events: none;
`;

const SliderTrack = styled.div`
  position: absolute;
  left: 50%;
  top: ${BLOCK_HEIGHT / 2}px;
  bottom: ${BOTTOM_PADDING + BLOCK_HEIGHT / 2}px;
  width: 2px;
  background: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.3),
    rgba(255, 255, 255, 0.1)
  );
  transform: translateX(-50%);
`;

const MarketPriceLine = styled.div<{ $isDescending?: boolean }>`
  position: absolute;
  left: 0;
  right: 0;
  ${({ $isDescending }) =>
    $isDescending ? "top" : "bottom"}: ${BOTTOM_PADDING}px;
  height: 2px;
  background-color: var(--outline-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;

  &::after {
    content: "Market (0%)";
    position: absolute;
    font-size: 8px;
    color: var(--outline-color-secondary);
    white-space: nowrap;
    background-color: var(--ds-bg-color);
    padding: 0 4px;
  }
`;

const BlockPositioner = styled.div<{
  $yPosition: number;
  $isDescending?: boolean;
}>`
  position: absolute;
  left: 0;
  right: 0;
  ${({ $yPosition, $isDescending }) => {
    const trackHeight = `calc(100% - ${BLOCK_HEIGHT + BOTTOM_PADDING}px)`;
    const positionPercent = $isDescending
      ? $yPosition / 100
      : (100 - $yPosition) / 100;
    return `top: calc(${trackHeight} * ${positionPercent})`;
  }};
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 2;

  > * {
    pointer-events: auto;
  }
`;

const DashedIndicator = styled.div<{
  $yPosition: number;
  $isDescending?: boolean;
}>`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  border-left: 2px dashed var(--border-color-options-row-underscored);
  pointer-events: none;
  z-index: 1;

  ${({ $yPosition, $isDescending }) => {
    const trackHeight = `calc(100% - ${BLOCK_HEIGHT + BOTTOM_PADDING}px)`;
    const positionPercent = $isDescending
      ? $yPosition / 100
      : (100 - $yPosition) / 100;
    const blockTop = `calc(${trackHeight} * ${positionPercent} + ${BLOCK_HEIGHT / 2}px)`;

    if ($isDescending) {
      return `
        top: ${BLOCK_HEIGHT / 2}px;
        bottom: calc(100% - ${blockTop} - ${BLOCK_HEIGHT / 2}px);
      `;
    } else {
      return `
        top: ${blockTop};
        bottom: ${BOTTOM_PADDING}px;
      `;
    }
  }}
`;

const PercentageLabel = styled.div<{
  $yPosition: number;
  $isDescending?: boolean;
  $sign?: string;
}>`
  position: absolute;
  right: 4px;
  font-size: 10px;
  font-weight: 500;
  color: var(--accent-color-purple);
  pointer-events: none;
  z-index: 3;

  ${({ $yPosition, $isDescending }) => {
    const trackHeight = `calc(100% - ${BLOCK_HEIGHT + BOTTOM_PADDING}px)`;
    const positionPercent = $isDescending
      ? $yPosition / 100
      : (100 - $yPosition) / 100;
    return `top: calc(${trackHeight} * ${positionPercent} + ${BLOCK_HEIGHT / 2 - 6}px)`;
  }};

  &::before {
    content: "${({ $sign }) => $sign || ""}";
    margin-right: 1px;
  }
`;

const EmptyPlaceholder = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(104, 107, 130, 0.5);
  font-size: 12px;
`;

const CenteredContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const WarningAlert = styled.div`
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

const WarningIcon = styled.div`
  font-size: 24px;
  margin-bottom: 8px;
`;

const WarningText = styled.div`
  font-size: 11px;
  color: var(--accent-color-purple);
  font-weight: 500;
`;

const WarningSubtext = styled.div`
  font-size: 9px;
  color: rgba(133, 91, 251, 0.6);
  margin-top: 4px;
`;

// Helper to get order type name from blocks
const getOrderTypeName = (blocks: BlockData[]): string | null => {
  if (blocks.length === 0) return null;
  // Extract order type from block id (format: baseId-type-counter)
  const firstBlock = blocks[0];
  const idParts = firstBlock.id.split("-");
  // Find the type part (skip the baseId which contains colons)
  const typeIndex = idParts.findIndex(
    (part) =>
      part === "limit" ||
      part === "market" ||
      part === "iceberg" ||
      part === "stop" ||
      part === "take" ||
      part === "trailing",
  );
  if (typeIndex !== -1) {
    // Reconstruct the type (handle compound names like stop-loss-limit)
    const typeParts: string[] = [];
    for (let i = typeIndex; i < idParts.length - 1; i++) {
      const part = idParts[i];
      if (!isNaN(Number(part))) break;
      typeParts.push(part);
    }
    return typeParts.join("-").replace(/-/g, " ");
  }
  return firstBlock.abrv;
};

// Props interface
interface GridCellProps {
  colIndex: number;
  rowIndex: number;
  blocks: BlockData[];
  isOver: boolean;
  isValidTarget: boolean;
  isDisabled: boolean;
  align: "left" | "right";
  strategyPattern: StrategyPattern;
  rowLabel: string;
  showPrimaryWarning: boolean;
  tint?: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onBlockDragStart: (id: string) => void;
  onBlockDragEnd: (id: string, x: number, y: number) => void;
  onBlockVerticalDrag: (id: string, mouseY: number) => void;
}

const GridCell: React.FC<GridCellProps> = ({
  colIndex,
  rowIndex,
  blocks,
  isOver,
  isValidTarget,
  isDisabled,
  strategyPattern,
  rowLabel,
  showPrimaryWarning,
  tint,
  onMouseEnter,
  onMouseLeave,
  onBlockDragStart,
  onBlockDragEnd,
  onBlockVerticalDrag,
}) => {
  const displayMode = getCellDisplayMode(blocks);
  const isDescending = shouldBeDescending(rowIndex, colIndex);
  const orderTypeName = getOrderTypeName(blocks);

  // Check if cell should show axis 1 (trigger)
  const hasAxis1Blocks = blocks.some((block) => block.axis === 1);

  // Check if cell should show axis 2 (limit)
  const hasAxis2Blocks = blocks.some((block) => block.axis === 2);

  // Get axis labels for display
  const axisLabels: string[] = [];
  if (hasAxis1Blocks) axisLabels.push("Trigger");
  if (hasAxis2Blocks) axisLabels.push("Limit");

  // Determine row label type for styling
  const rowLabelType: "primary" | "conditional" =
    rowLabel.toLowerCase() === "primary" ? "primary" : "conditional";

  const renderPercentageScale = (isDesc: boolean) => {
    // Always show from top to bottom as visual reference
    const values = ["100%", "75%", "50%", "25%", "0%"];
    return (
      <PercentageScale $isDescending={isDesc}>
        {values.map((val) => (
          <span key={val}>{val}</span>
        ))}
      </PercentageScale>
    );
  };

  const renderAxisContent = (
    axisBlocks: BlockData[],
    isSingleAxis: boolean,
    axisLabel: string,
  ) => {
    // Determine sign based on ascending/descending
    const sign = isDescending ? "-" : "+";

    return (
      <AxisColumn $isSingleAxis={isSingleAxis}>
        {renderPercentageScale(isDescending)}
        <SliderTrack />
        <MarketPriceLine $isDescending={isDescending} />
        {/* Show axis label above or below market line */}
        <AxisLabelItem $position={isDescending ? "below" : "above"}>
          {axisLabel}
        </AxisLabelItem>

        {axisBlocks.map((block) => (
          <React.Fragment key={block.id}>
            <DashedIndicator
              $yPosition={block.yPosition}
              $isDescending={isDescending}
            />
            <PercentageLabel
              $yPosition={block.yPosition}
              $isDescending={isDescending}
              $sign={sign}
            >
              {Math.round(block.yPosition)}%
            </PercentageLabel>
            <BlockPositioner
              $yPosition={block.yPosition}
              $isDescending={isDescending}
            >
              <Block
                id={block.id}
                icon={block.icon}
                abrv={block.abrv}
                axis={block.axis}
                axes={block.axes}
                onDragStart={onBlockDragStart}
                onDragEnd={onBlockDragEnd}
                onVerticalDrag={onBlockVerticalDrag}
              />
            </BlockPositioner>
          </React.Fragment>
        ))}
      </AxisColumn>
    );
  };

  const renderContent = () => {
    // Show warning alert in middle row if conditional without primary
    if (showPrimaryWarning && blocks.length === 0) {
      return (
        <WarningAlert>
          <WarningIcon>⚠️</WarningIcon>
          <WarningText>Primary Order Required</WarningText>
          <WarningSubtext>
            Place a primary order here before adding conditionals
          </WarningSubtext>
        </WarningAlert>
      );
    }

    // Empty cell
    if (displayMode === "empty") {
      // In conditional mode, only show placeholder for valid/non-disabled cells
      if (strategyPattern === "conditional" && isDisabled) {
        return null; // Don't show placeholder for non-available cells
      }
      return <EmptyPlaceholder>Drop here</EmptyPlaceholder>;
    }

    // No-axis blocks (axes: []) - centered, not draggable, no % shown
    if (displayMode === "no-axis") {
      return (
        <>
          <CellHeader>
            {orderTypeName && <OrderTypeLabel>{orderTypeName}</OrderTypeLabel>}
          </CellHeader>
          <CenteredContainer>
            {blocks.map((block) => (
              <Block
                key={block.id}
                id={block.id}
                icon={block.icon}
                abrv={block.abrv}
                axes={block.axes}
                onDragStart={onBlockDragStart}
                onDragEnd={onBlockDragEnd}
              />
            ))}
          </CenteredContainer>
        </>
      );
    }

    // Limit-only blocks (axes: ["limit"]) - single axis centered
    if (displayMode === "limit-only") {
      return (
        <>
          <CellHeader>
            {orderTypeName && <OrderTypeLabel>{orderTypeName}</OrderTypeLabel>}
          </CellHeader>
          <SliderArea>{renderAxisContent(blocks, true, "Limit")}</SliderArea>
        </>
      );
    }

    // Dual-axis mode (trigger and/or limit)
    const axis1Blocks = blocks.filter((block) => block.axis === 1);
    const axis2Blocks = blocks.filter((block) => block.axis === 2);

    return (
      <>
        <CellHeader>
          {orderTypeName && <OrderTypeLabel>{orderTypeName}</OrderTypeLabel>}
        </CellHeader>
        <SliderArea>
          {hasAxis1Blocks &&
            renderAxisContent(axis1Blocks, !hasAxis2Blocks, "Trigger")}
          {hasAxis2Blocks &&
            renderAxisContent(axis2Blocks, !hasAxis1Blocks, "Limit")}
        </SliderArea>
      </>
    );
  };

  return (
    <CellContainer
      data-col={colIndex}
      data-row={rowIndex}
      $isOver={isOver}
      $isValidTarget={isValidTarget}
      $isDisabled={isDisabled}
      $align="left"
      $tint={tint}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Row label badge for conditional pattern - only show when cell can accept placement */}
      {rowLabel && !isDisabled && (
        <RowLabelBadge $type={rowLabelType}>{rowLabel}</RowLabelBadge>
      )}
      {renderContent()}
    </CellContainer>
  );
};

export default GridCell;
