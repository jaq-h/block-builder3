import { Fragment, type FC } from "react";
import Block from "../../blocks/block";
import type { BlockData } from "../../../types/grid";
import {
  shouldBeDescending,
  calculatePrice,
  formatPrice,
  getCellDisplayMode,
} from "../../../utils";
import {
  getReadOnlyCellContainerProps,
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
  emptyCellMessage,
  centeredContainer,
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

const ReadOnlyGridCell: FC<ReadOnlyGridCellProps> = ({
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
  const orderTypeLabelText = blocks.length > 0 ? blocks[0].label : null;
  const isBuy = colIndex === 0;

  const hasAxis1Blocks = blocks.some((block) => block.axis === 1);
  const hasAxis2Blocks = blocks.some((block) => block.axis === 2);

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
              ? formatPrice(currentPrice)
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
          const calculatedPriceValue = calculatePrice(
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
            <Fragment key={block.id}>
              <div
                className={dashedProps.className}
                style={dashedProps.style}
              />
              <div className={pctProps.className} style={pctProps.style}>
                {pctProps.sign}
                {block.yPosition.toFixed(2)}%
              </div>
              <div className={priceProps.className} style={priceProps.style}>
                {formatPrice(calculatedPriceValue)}
              </div>
              <div className={posProps.className} style={posProps.style}>
                <Block
                  id={block.id}
                  icon={sliderIcon || block.icon}
                  abrv={block.abrv}
                  axis={block.axis}
                  axes={block.axes}
                  isReadOnly={true}
                />
              </div>
            </Fragment>
          );
        })}
      </div>
    );
  };

  const renderContent = () => {
    if (displayMode === "empty") {
      return <div className={emptyCellMessage}>No active orders</div>;
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
                isReadOnly={true}
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

  const containerProps = getReadOnlyCellContainerProps(tint);

  return (
    <div
      data-col={colIndex}
      data-row={rowIndex}
      className={containerProps.className}
      style={containerProps.style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {renderContent()}
    </div>
  );
};

export default ReadOnlyGridCell;
