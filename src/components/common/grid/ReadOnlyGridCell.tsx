import { Fragment, type FC } from "react";
import Block from "../../blocks/block";
import type { BlockData } from "../../../types/grid";
import {
  cellDirection,
  clampOffset,
  formatPrice,
  getCellDisplayMode,
  isDescending as isDescendingDirection,
  legInCell,
  legOfBlock,
  priceForOffset,
  type PriceAxisLeg,
} from "../../../utils";
import { useMarket } from "../../../store/useMarket";
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
  // See the note in `GridCell`: the pair's precision comes from context so a
  // cell can never draw a price at a different precision from its neighbour.
  const { activeMarket } = useMarket();

  const displayMode = getCellDisplayMode(blocks);
  // The same cell scale the builder grid draws, from the same owner: an order
  // card and the cell it was built in must not disagree about which side of the
  // market it sits on.
  const direction = cellDirection(blocks);
  const isDescending = isDescendingDirection(direction);
  const orderTypeLabelText = blocks.length > 0 ? blocks[0].label : null;
  const isBuy = colIndex === 0;

  // The same owner the builder cell splits on: `legOfBlock`, never `axis`. An
  // order card and the cell it was built in must not disagree about which leg
  // a block is, any more than they may about the direction above.
  const triggerBlocks = blocks.filter(
    (block) => legOfBlock(block) === "trigger",
  );
  const limitBlocks = blocks.filter((block) => legOfBlock(block) === "limit");
  const hasTriggerBlocks = triggerBlocks.length > 0;
  const hasLimitBlocks = limitBlocks.length > 0;

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
              ? formatPrice(currentPrice, activeMarket)
              : "Loading price..."}
        </div>
      </div>
    );
  };

  const renderAxisContent = (
    axisBlocks: BlockData[],
    leg: PriceAxisLeg,
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
          const offset = clampOffset(block.yPosition);
          const calculatedPriceValue = priceForOffset(
            currentPrice,
            offset,
            direction,
          );
          const sliderIcon =
            leg === "trigger" ? block.triggerIcon : block.limitIcon;
          const dashedProps = getDashedIndicatorProps(
            offset,
            isDescending,
            isSingleAxis,
          );
          const pctProps = getPercentageLabelProps(
            offset,
            isDescending,
            sign,
            isSingleAxis,
          );
          const priceProps = getCalculatedPriceLabelProps(
            offset,
            isDescending,
            isSingleAxis,
            isBuy,
          );
          const posProps = getBlockPositionerProps(
            offset,
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
                {offset.toFixed(2)}%
              </div>
              <div className={priceProps.className} style={priceProps.style}>
                {formatPrice(calculatedPriceValue, activeMarket)}
              </div>
              <div className={posProps.className} style={posProps.style}>
                <Block
                  id={block.id}
                  icon={sliderIcon || block.icon}
                  abrv={block.abrv}
                  label={block.label}
                  leg={legInCell(blocks, block)}
                  yPosition={offset}
                  direction={direction}
                  priceText={formatPrice(calculatedPriceValue, activeMarket)}
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
                label={block.label}
                leg={legInCell(blocks, block)}
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
            {renderAxisContent(blocks, "limit", true, "Limit", true)}
          </div>
        </>
      );
    }

    return (
      <>
        <div className={cellHeader}>
          {orderTypeLabelText && (
            <div className={orderTypeLabel}>{orderTypeLabelText}</div>
          )}
        </div>
        <div className={sliderArea}>
          {renderMarketPrice()}
          {hasTriggerBlocks &&
            renderAxisContent(
              triggerBlocks,
              "trigger",
              !hasLimitBlocks,
              "Trigger",
              true,
            )}
          {hasLimitBlocks &&
            renderAxisContent(
              limitBlocks,
              "limit",
              !hasTriggerBlocks,
              "Limit",
              !hasTriggerBlocks,
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
