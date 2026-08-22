import { Fragment, type FC } from "react";
import Block from "../../blocks/block";
import type { BlockData, StrategyPattern } from "../../../types/grid";
import {
  calculatePrice,
  formatPrice,
  getCellDisplayMode,
  isCellDescending,
} from "../../../utils";
import { describeCell } from "../../../utils/blockCommand";
import type { CancelOptions } from "../../../hooks/useBlockCommand";
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

// Props interface
interface GridCellProps {
  colIndex: number;
  rowIndex: number;
  blocks: BlockData[];
  isOver: boolean;
  isValidTarget: boolean;
  isDisabled: boolean;
  /** The cell the command model would place the carried block into. */
  isCommandTarget: boolean;
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
  onBlockDragCancel: (id: string) => void;
  onBlockDragAborted: (id: string) => void;
  onBlockDragRecognised: (id: string) => void;
  onBlockVerticalDrag: (id: string, pointerY: number) => void;
  onBlockActivate: (id: string, origin: "keyboard" | "pointer") => void;
  onBlockCommandMove: (dCol: number, dRow: number) => void;
  onBlockCommandCancel: (options?: CancelOptions) => void;
  onBlockAdjustPrice: (id: string, delta: number) => void;
  /**
   * A click landed on this cell. It is wired unconditionally: whether a click
   * means anything is the command model's decision, and a cell that silently
   * drops the click when it believes nothing is carried is a second opinion on
   * the same question - which is how a lost carry came to leave a dead tap
   * behind with nothing said about either.
   */
  onCellActivate: () => void;
  carryingBlockId: string | null;
  focusBlockId: string | null;
  onBlockFocusHandled: () => void;
}

const GridCell: FC<GridCellProps> = ({
  colIndex,
  rowIndex,
  blocks,
  isOver,
  isValidTarget,
  isDisabled,
  isCommandTarget,
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
  onBlockDragCancel,
  onBlockDragAborted,
  onBlockDragRecognised,
  onBlockVerticalDrag,
  onBlockActivate,
  onBlockCommandMove,
  onBlockCommandCancel,
  onBlockAdjustPrice,
  onCellActivate,
  carryingBlockId,
  focusBlockId,
  onBlockFocusHandled,
}) => {
  const displayMode = getCellDisplayMode(blocks);
  const isDescending = isCellDescending(blocks);
  const orderTypeLabelText = blocks.length > 0 ? blocks[0].label : null;
  const isBuy = colIndex === 0;

  const hasAxis1Blocks = blocks.some((block) => block.axis === 1);
  const hasAxis2Blocks = blocks.some((block) => block.axis === 2);

  const rowLabelType: "primary" | "conditional" =
    rowLabel.toLowerCase() === "primary" ? "primary" : "conditional";

  const cellDescription = describeCell(
    { col: colIndex, row: rowIndex },
    strategyPattern,
  );

  // Every block in the cell shares the same command wiring; only the id differs.
  const commandProps = (blockId: string) => ({
    isCarrying: carryingBlockId === blockId,
    shouldFocus: focusBlockId === blockId,
    onFocusHandled: onBlockFocusHandled,
    onActivate: onBlockActivate,
    onCommandMove: onBlockCommandMove,
    onCommandCancel: onBlockCommandCancel,
    onDragStart: onBlockDragStart,
    onDragEnd: onBlockDragEnd,
    onDragCancel: onBlockDragCancel,
    onDragAborted: onBlockDragAborted,
    onDragRecognised: onBlockDragRecognised,
    cellDescription,
  });

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
    axisNumber: 1 | 2,
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
      <div
        // The element the block positioner is absolutely laid out within, and
        // so the one the vertical drag has to measure to invert that layout.
        data-axis-track={`${colIndex}-${rowIndex}-${axisNumber}`}
        className={getAxisColumnProps(isSingleAxis)}
      >
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
                {formatPrice(calculatedPrice)}
              </div>
              <div className={posProps.className} style={posProps.style}>
                <Block
                  id={block.id}
                  icon={sliderIcon || block.icon}
                  abrv={block.abrv}
                  label={block.label}
                  axis={block.axis}
                  axes={block.axes}
                  yPosition={block.yPosition}
                  direction={isDescending ? "downside" : "upside"}
                  priceText={formatPrice(calculatedPrice)}
                  onVerticalDrag={onBlockVerticalDrag}
                  onAdjustPrice={onBlockAdjustPrice}
                  {...commandProps(block.id)}
                />
              </div>
            </Fragment>
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
                label={block.label}
                axes={block.axes}
                {...commandProps(block.id)}
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
            {renderAxisContent(blocks, 2, true, "Limit", true)}
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
            renderAxisContent(axis1Blocks, 1, !hasAxis2Blocks, "Trigger", true)}
          {hasAxis2Blocks &&
            renderAxisContent(
              axis2Blocks,
              2,
              !hasAxis1Blocks,
              "Limit",
              !hasAxis1Blocks,
            )}
        </div>
      </>
    );
  };

  const containerProps = getInteractiveCellContainerProps({
    isOver: isOver || isCommandTarget,
    isValidTarget,
    isDisabled,
    tint,
  });

  const occupants =
    blocks.length === 0
      ? "empty"
      : blocks.map((block) => block.label).join(", ");

  return (
    <div
      data-col={colIndex}
      data-row={rowIndex}
      // A group rather than a button: the keyboard path is arrows plus Enter on
      // the carried block, so the click here is a second way to reach the same
      // command and never the only way.
      role="group"
      aria-label={`${cellDescription}, ${occupants}`}
      aria-current={isCommandTarget ? "location" : undefined}
      className={containerProps.className}
      style={containerProps.style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onCellActivate}
    >
      {rowLabel && !isDisabled && (
        <div className={rowLabelBadge({ type: rowLabelType })}>{rowLabel}</div>
      )}
      {renderContent()}
    </div>
  );
};

export default GridCell;
