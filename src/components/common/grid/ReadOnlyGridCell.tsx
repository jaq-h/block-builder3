import React from "react";
import Block from "../../blocks/block";
import type { BlockData } from "../../../types/grid";
import {
  shouldBeDescending,
  calculatePrice,
  formatPrice,
  getCellDisplayMode,
} from "../../../utils";
import {
  ReadOnlyCellContainer,
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
  EmptyCellMessage,
  CenteredContainer,
  getScaleLabels,
} from "../../../styles/grid";

// Props interface for read-only grid cell
interface ReadOnlyGridCellProps {
  colIndex: number;
  rowIndex: number;
  blocks: BlockData[];
  currentPrice: number | null;
  priceError?: string | null;
  tint?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const ReadOnlyGridCell: React.FC<ReadOnlyGridCellProps> = ({
  colIndex,
  rowIndex,
  blocks,
  currentPrice,
  priceError,
  tint,
  onMouseEnter,
  onMouseLeave,
}) => {
  const displayMode = getCellDisplayMode(blocks);
  const isDescending = shouldBeDescending(rowIndex, colIndex);
  const orderTypeLabel = blocks.length > 0 ? blocks[0].label : null;
  const isBuy = colIndex === 0; // colIndex 0 = Buy (Entry), colIndex 1 = Sell (Exit)

  // Check if cell should show axis 1 (trigger)
  const hasAxis1Blocks = blocks.some((block) => block.axis === 1);

  // Check if cell should show axis 2 (limit)
  const hasAxis2Blocks = blocks.some((block) => block.axis === 2);

  const renderPercentageScale = (isDesc: boolean) => {
    const labels = getScaleLabels(isDesc);
    return (
      <PercentageScale $isDescending={isDesc}>
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </PercentageScale>
    );
  };

  // Render market price line and label
  const renderMarketPrice = () => {
    return (
      <MarketPriceLine $isDescending={isDescending}>
        <MarketPriceLabel $isDescending={isDescending}>
          {priceError
            ? "Price Error"
            : currentPrice
              ? formatPrice(currentPrice)
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
                {formatPrice(calculatedPrice)}
              </CalculatedPriceLabel>
              <BlockPositioner
                $yPosition={block.yPosition}
                $isDescending={isDescending}
                $isSingleAxis={isSingleAxis}
              >
                {/* Read-only block - no drag handlers */}
                <Block
                  id={block.id}
                  icon={sliderIcon || block.icon}
                  abrv={block.abrv}
                  axis={block.axis}
                  axes={block.axes}
                  isReadOnly={true}
                />
              </BlockPositioner>
            </React.Fragment>
          );
        })}
      </AxisColumn>
    );
  };

  const renderContent = () => {
    // Empty cell
    if (displayMode === "empty") {
      return <EmptyCellMessage>No active orders</EmptyCellMessage>;
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
                isReadOnly={true}
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
    <ReadOnlyCellContainer
      data-col={colIndex}
      data-row={rowIndex}
      $tint={tint}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {renderContent()}
    </ReadOnlyCellContainer>
  );
};

export default ReadOnlyGridCell;
