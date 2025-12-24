import React from "react";
import Block from "../../blocks/block";
import type { BlockData } from "../../../utils/cardAssemblyUtils";
import { shouldBeDescending } from "../../../utils/cardAssemblyUtils";
import { getCellDisplayMode } from "../../../utils/blockFactory";
import type { StrategyPattern } from "./StrategyAssemblyTypes";
import {
  CellContainer,
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
  getScaleLabels,
} from "./GridCell.styles";

// Helper to calculate price from percentage offset
const calculatePrice = (
  marketPrice: number | null,
  percentage: number,
  isDescending: boolean,
): number | null => {
  if (marketPrice === null) return null;
  // Descending (-): price decreases as percentage increases
  // Ascending (+): price increases as percentage increases
  const multiplier = isDescending ? 1 - percentage / 100 : 1 + percentage / 100;
  return marketPrice * multiplier;
};

// Helper to format price for display
const formatCalculatedPrice = (price: number | null): string => {
  if (price === null) return "—";
  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  currentPrice: number | null;
  priceError?: string | null;
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
  currentPrice,
  priceError,
  onMouseEnter,
  onMouseLeave,
  onBlockDragStart,
  onBlockDragEnd,
  onBlockVerticalDrag,
}) => {
  const displayMode = getCellDisplayMode(blocks);
  const isDescending = shouldBeDescending(rowIndex, colIndex);
  const orderTypeLabel = blocks.length > 0 ? blocks[0].label : null;
  const isBuy = colIndex === 0; // colIndex 0 = Buy (Entry), colIndex 1 = Sell (Exit)

  // Check if cell should show axis 1 (trigger)
  const hasAxis1Blocks = blocks.some((block) => block.axis === 1);

  // Check if cell should show axis 2 (limit)
  const hasAxis2Blocks = blocks.some((block) => block.axis === 2);

  // Determine row label type for styling
  const rowLabelType: "primary" | "conditional" =
    rowLabel.toLowerCase() === "primary" ? "primary" : "conditional";

  const renderPercentageScale = (isDesc: boolean) => {
    // Use single source of truth for scale labels (whole numbers)
    const labels = getScaleLabels(isDesc);
    return (
      <PercentageScale $isDescending={isDesc}>
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </PercentageScale>
    );
  };

  // Render market price line and label - now at cell level for centering
  const renderMarketPrice = () => {
    return (
      <MarketPriceLine $isDescending={isDescending}>
        <MarketPriceLabel $isDescending={isDescending}>
          {priceError
            ? "Price Error"
            : currentPrice
              ? `$${currentPrice.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "Loading price..."}
        </MarketPriceLabel>
      </MarketPriceLine>
    );
  };

  const renderAxisContent = (
    axisBlocks: BlockData[],
    isSingleAxis: boolean,
    axisLabel: string,
    showPercentageScale: boolean = true,
  ) => {
    // Determine sign based on ascending/descending
    const sign = isDescending ? "-" : "+";

    return (
      <AxisColumn $isSingleAxis={isSingleAxis}>
        {showPercentageScale && renderPercentageScale(isDescending)}
        <SliderTrack
          $isDescending={isDescending}
          $isSingleAxis={isSingleAxis}
        />
        {/* Show axis label above or below market line */}
        <AxisLabelItem
          $position={isDescending ? "below" : "above"}
          $isSingleAxis={isSingleAxis}
        >
          {axisLabel}
        </AxisLabelItem>

        {axisBlocks.map((block) => {
          const calculatedPrice = calculatePrice(
            currentPrice,
            block.yPosition,
            isDescending,
          );
          // Determine which icon to show based on axis (trigger or limit icon for slider)
          const sliderIcon =
            block.axis === 1 ? block.triggerIcon : block.limitIcon;
          return (
            <React.Fragment key={block.id}>
              <DashedIndicator
                $yPosition={block.yPosition}
                $isDescending={isDescending}
                $isSingleAxis={isSingleAxis}
              />
              <PercentageLabel
                $yPosition={block.yPosition}
                $isDescending={isDescending}
                $sign={sign}
                $isSingleAxis={isSingleAxis}
              >
                {block.yPosition.toFixed(2)}%
              </PercentageLabel>
              <CalculatedPriceLabel
                $yPosition={block.yPosition}
                $isDescending={isDescending}
                $isSingleAxis={isSingleAxis}
                $isBuy={isBuy}
              >
                {formatCalculatedPrice(calculatedPrice)}
              </CalculatedPriceLabel>
              <BlockPositioner
                $yPosition={block.yPosition}
                $isDescending={isDescending}
                $isSingleAxis={isSingleAxis}
              >
                <Block
                  id={block.id}
                  icon={sliderIcon || block.icon}
                  abrv={block.abrv}
                  axis={block.axis}
                  axes={block.axes}
                  onDragStart={onBlockDragStart}
                  onDragEnd={onBlockDragEnd}
                  onVerticalDrag={onBlockVerticalDrag}
                />
              </BlockPositioner>
            </React.Fragment>
          );
        })}
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
            {orderTypeLabel && (
              <OrderTypeLabel>{orderTypeLabel}</OrderTypeLabel>
            )}
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
            {orderTypeLabel && (
              <OrderTypeLabel>{orderTypeLabel}</OrderTypeLabel>
            )}
          </CellHeader>
          <SliderArea>
            {/* Market price centered at cell level */}
            {renderMarketPrice()}
            {renderAxisContent(blocks, true, "Limit", true)}
          </SliderArea>
        </>
      );
    }

    // Dual-axis mode (trigger and/or limit)
    const axis1Blocks = blocks.filter((block) => block.axis === 1);
    const axis2Blocks = blocks.filter((block) => block.axis === 2);

    return (
      <>
        <CellHeader>
          {orderTypeLabel && <OrderTypeLabel>{orderTypeLabel}</OrderTypeLabel>}
        </CellHeader>
        <SliderArea>
          {/* Market price centered at cell level - rendered once for all axes */}
          {renderMarketPrice()}
          {hasAxis1Blocks &&
            renderAxisContent(axis1Blocks, !hasAxis2Blocks, "Trigger", true)}
          {hasAxis2Blocks &&
            renderAxisContent(
              axis2Blocks,
              !hasAxis1Blocks,
              "Limit",
              !hasAxis1Blocks, // Only show percentage scale if axis 1 isn't present
            )}
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
