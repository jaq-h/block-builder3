import React from "react";
import Block from "../../blocks/block";
import type { BlockData, StrategyPattern } from "../../../types/grid";
import { shouldBeDescending, getCellDisplayMode } from "../../../utils";
import AlertTriangleIcon from "../../../assets/icons/alert-triangle.svg?react";
import {
  getInteractiveCellContainerProps,
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
  getScaleLabels,
} from "./GridCell.styles";

// Helper to calculate price from percentage offset
const calculatePrice = (
  marketPrice: number | null,
  percentage: number,
  isDescending: boolean,
): number | null => {
  if (marketPrice === null) return null;
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
  const orderTypeLabelText = blocks.length > 0 ? blocks[0].label : null;
  const isBuy = colIndex === 0;

  const hasAxis1Blocks = blocks.some((block) => block.axis === 1);
  const hasAxis2Blocks = blocks.some((block) => block.axis === 2);

  const rowLabelType: "primary" | "conditional" =
    rowLabel.toLowerCase() === "primary" ? "primary" : "conditional";

  const renderPercentageScale = (isDesc: boolean) => {
    const labels = getScaleLabels(isDesc);
    const scaleProps = getPercentageScaleProps(isDesc);
    return (
      <div className={scaleProps.className} style={scaleProps.style}>
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    );
  };

  const renderMarketPrice = () => {
    const lineProps = getMarketPriceLineProps(isDescending);
    const labelProps = getMarketPriceLabelProps(isDescending);
    return (
      <div className={lineProps.className} style={lineProps.style}>
        <div className={labelProps.className} style={labelProps.style}>
          {priceError
            ? "Price Error"
            : currentPrice
              ? `$${currentPrice.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "Loading price..."}
        </div>
      </div>
    );
  };

  const renderAxisContent = (
    axisBlocks: BlockData[],
    isSingleAxis: boolean,
    axisLabel: string,
    showPercentageScale: boolean = true,
  ) => {
    const sign = isDescending ? "-" : "+";
    const axisLabelProps = getAxisLabelItemProps(
      isDescending ? "below" : "above",
      isSingleAxis,
    );
    const trackProps = getSliderTrackProps(isDescending, isSingleAxis);

    return (
      <div className={getAxisColumnProps(isSingleAxis)}>
        {showPercentageScale && renderPercentageScale(isDescending)}
        <div className={trackProps.className} style={trackProps.style} />
        <span className={axisLabelProps.className} style={axisLabelProps.style}>
          {axisLabel}
        </span>

        {axisBlocks.map((block) => {
          const calculatedPrice = calculatePrice(
            currentPrice,
            block.yPosition,
            isDescending,
          );
          const sliderIcon =
            block.axis === 1 ? block.triggerIcon : block.limitIcon;
          const dashedProps = getDashedIndicatorProps(
            block.yPosition,
            isDescending,
            isSingleAxis,
          );
          const pctProps = getPercentageLabelProps(
            block.yPosition,
            isDescending,
            sign,
            isSingleAxis,
          );
          const priceProps = getCalculatedPriceLabelProps(
            block.yPosition,
            isDescending,
            isSingleAxis,
            isBuy,
          );
          const posProps = getBlockPositionerProps(
            block.yPosition,
            isDescending,
            isSingleAxis,
          );
          return (
            <React.Fragment key={block.id}>
              <div
                className={dashedProps.className}
                style={dashedProps.style}
              />
              <div className={pctProps.className} style={pctProps.style}>
                {pctProps.sign}
                {block.yPosition.toFixed(2)}%
              </div>
              <div className={priceProps.className} style={priceProps.style}>
                {formatCalculatedPrice(calculatedPrice)}
              </div>
              <div className={posProps.className} style={posProps.style}>
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
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderContent = () => {
    if (showPrimaryWarning && blocks.length === 0) {
      return (
        <div className={warningAlert}>
          <div className={warningIcon}>
            <AlertTriangleIcon width={24} height={24} />
          </div>
          <div className={warningText}>Primary Order Required</div>
          <div className={warningSubtext}>
            Place a primary order here before adding conditionals
          </div>
        </div>
      );
    }

    if (displayMode === "empty") {
      if (strategyPattern === "conditional" && isDisabled) {
        return null;
      }
      return <div className={emptyPlaceholder}>Drop here</div>;
    }

    if (displayMode === "no-axis") {
      return (
        <>
          <div className={cellHeader}>
            {orderTypeLabelText && (
              <div className={orderTypeLabel}>{orderTypeLabelText}</div>
            )}
          </div>
          <div className={centeredContainer}>
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
          </div>
        </>
      );
    }

    if (displayMode === "limit-only") {
      return (
        <>
          <div className={cellHeader}>
            {orderTypeLabelText && (
              <div className={orderTypeLabel}>{orderTypeLabelText}</div>
            )}
          </div>
          <div className={sliderArea}>
            {renderMarketPrice()}
            {renderAxisContent(blocks, true, "Limit", true)}
          </div>
        </>
      );
    }

    const axis1Blocks = blocks.filter((block) => block.axis === 1);
    const axis2Blocks = blocks.filter((block) => block.axis === 2);

    return (
      <>
        <div className={cellHeader}>
          {orderTypeLabelText && (
            <div className={orderTypeLabel}>{orderTypeLabelText}</div>
          )}
        </div>
        <div className={sliderArea}>
          {renderMarketPrice()}
          {hasAxis1Blocks &&
            renderAxisContent(axis1Blocks, !hasAxis2Blocks, "Trigger", true)}
          {hasAxis2Blocks &&
            renderAxisContent(
              axis2Blocks,
              !hasAxis1Blocks,
              "Limit",
              !hasAxis1Blocks,
            )}
        </div>
      </>
    );
  };

  const containerProps = getInteractiveCellContainerProps({
    isOver,
    isValidTarget,
    isDisabled,
    tint,
  });

  return (
    <div
      data-col={colIndex}
      data-row={rowIndex}
      className={containerProps.className}
      style={containerProps.style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {rowLabel && !isDisabled && (
        <div className={rowLabelBadge({ type: rowLabelType })}>{rowLabel}</div>
      )}
      {renderContent()}
    </div>
  );
};

export default GridCell;
