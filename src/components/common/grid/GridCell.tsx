import { Fragment, type FC } from "react";
import Block from "../../blocks/block";
import type { BlockData, StrategyPattern } from "../../../types/grid";
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
import { describeCell } from "../../../utils/blockCommand";
import { useMarket } from "../../../store/useMarket";
import type { CancelOptions } from "../../../hooks/useBlockCommand";
import type { ActivationOrigin } from "../../../utils/blockCommand";
import AlertTriangleIcon from "../../../assets/icons/alert-triangle.svg?react";
import XIcon from "../../../assets/icons/x.svg?react";
import {
  getInteractiveCellContainerProps,
  cellActionRail,
  cellClearButton,
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
  onBlockActivate: (id: string, origin: ActivationOrigin) => void;
  onBlockCommandMove: (dCol: number, dRow: number) => void;
  onBlockCommandCancel: (options?: CancelOptions) => void;
  onBlockAdjustPrice: (id: string, delta: number) => void;
  /**
   * Delete or Backspace on a focused block: take THAT block off the grid.
   * Wired for every block this cell draws, axis or no axis - removal must not
   * depend on which drag hook a block happened to get.
   */
  onBlockRemove: (id: string) => void;
  /**
   * The cell's own clear control: empty this cell, every order in it.
   *
   * The pointer's removal is per CELL rather than per block, on the captain's
   * instruction, so one press takes both legs of a dual-axis order and every
   * independent order a bulk cell holds. It affects no other cell.
   */
  onCellClear: () => void;
  /**
   * A click landed on this cell. It is wired unconditionally: whether a click
   * means anything is the command model's decision, and a cell that silently
   * drops the click when it believes nothing is carried is a second opinion on
   * the same question - which is how a lost carry came to leave a dead tap
   * behind with nothing said about either.
   */
  onCellActivate: () => void;
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
  onBlockRemove,
  onCellClear,
  onCellActivate,
  focusBlockId,
  onBlockFocusHandled,
}) => {
  // The selected pair decides how many decimals a price is drawn with. It is
  // read from context rather than drilled: the market is app-wide state, and a
  // cell that took it as a prop could be handed a different one from the price
  // it is already being handed.
  const { priceFormat } = useMarket();

  const displayMode = getCellDisplayMode(blocks);
  // The cell's scale, from the one owner of it. Every chip, every slider and
  // every announcement in this cell is drawn on this single direction - and so
  // is the Kraken payload, which reads the same cell through
  // `extractBlocksFromGrid`. Reading each block's own direction here is what
  // put `-25.00% $37,500` on screen beside a payload that said 62,500.
  const direction = cellDirection(blocks);
  const isDescending = isDescendingDirection(direction);
  const orderTypeLabelText = blocks.length > 0 ? blocks[0].label : null;
  const isBuy = colIndex === 0;

  // Which column a block is drawn in, which label that column carries and which
  // icon the slider shows are all one question - the block's leg - and
  // `legOfBlock` is its owner. Splitting on `block.axis` here was the last
  // consumer answering axis membership for itself: `axis` has no notion of a
  // single-axis order type, so a Stop Loss saved at axis 2 and rehydrated as
  // `axes: ["trigger"]` drew a column labelled "Limit" around a slider whose
  // accessible name said "trigger price".
  const triggerBlocks = blocks.filter(
    (block) => legOfBlock(block) === "trigger",
  );
  const limitBlocks = blocks.filter((block) => legOfBlock(block) === "limit");
  const hasTriggerBlocks = triggerBlocks.length > 0;
  const hasLimitBlocks = limitBlocks.length > 0;

  const rowLabelType: "primary" | "conditional" =
    rowLabel.toLowerCase() === "primary" ? "primary" : "conditional";

  const cellDescription = describeCell(
    { col: colIndex, row: rowIndex },
    strategyPattern,
  );

  // Every block in the cell shares the same command wiring; only the id differs.
  // No `isCarrying`: a placed block is never carried, because it never changes
  // cells (decision D9). The palette is the only place a block is held from.
  const commandProps = (blockId: string) => ({
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
    onRemove: onBlockRemove,
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
          {/* The market price line follows the pair's precision too. Formatting
              it inline at a flat two decimals made it the one price on screen
              that disagreed with every block chip above and below it. */}
          {priceError
            ? "Price Error"
            : currentPrice
              ? formatPrice(currentPrice, priceFormat)
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
      <div
        // The element the block positioner is absolutely laid out within, and
        // so the one the vertical drag has to measure to invert that layout.
        data-axis-track={`${colIndex}-${rowIndex}-${leg}`}
        className={getAxisColumnProps(isSingleAxis)}
      >
        {showPercentageScale && renderPercentageScale(isDescending)}
        <div className={trackProps.className} style={trackProps.style} />
        <span className={axisLabelProps.className} style={axisLabelProps.style}>
          {axisLabel}
        </span>

        {axisBlocks.map((block) => {
          // One clamped offset for the chip, the ruler, the dashed indicator
          // and the block itself, so the drawn position and the drawn price can
          // never come from different numbers.
          const offset = clampOffset(block.yPosition);
          const calculatedPrice = priceForOffset(
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
                {formatPrice(calculatedPrice, priceFormat)}
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
                  priceText={formatPrice(calculatedPrice, priceFormat)}
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
                leg={legInCell(blocks, block)}
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
      {/* THE CELL'S TOP-RIGHT RAIL: what can be done to this cell, and what it
          is. `cellActionRail` in `styles/grid.ts` is the authority on the
          ordering, which is load-bearing rather than aesthetic: the rail is
          right-anchored and the badge is LAST, so the badge holds the same
          position whether or not the cell has a control, and the planned
          cell-detail editor's icon joins at the FRONT without moving the clear
          button. The badge is drawn here rather than positioning itself, so one
          element owns this corner. */}
      {((rowLabel && !isDisabled) || blocks.length > 0) && (
        <div className={cellActionRail}>
          {blocks.length > 0 && (
            <button
              type="button"
              // Named for the CELL, and stable whatever the cell holds. A
              // voice-control user targets a control by its name, so a name
              // that changed with the orders inside would change under them
              // between deciding to say it and saying it. What the cell holds
              // is already on the cell's own group label beside this.
              aria-label={`Clear ${cellDescription}`}
              className={cellClearButton}
              // ON `click`, DELIBERATELY, AND NEVER ON A POINTER EVENT.
              //
              // A press that travels away fires no click at all - the browser
              // fires `click` at the nearest common ancestor of the
              // pointer-down and pointer-up targets - so a gesture that starts
              // here and leaves destroys nothing. An `onPointerDown` would turn
              // every such press into an emptied cell, with no undo.
              onClick={(e) => {
                // The cell listens for a click to place whatever is in hand.
                // Clearing a cell is not placing into it, so this click stops
                // here - without it, clearing while carrying a palette order
                // would empty the cell AND drop the carried order into it.
                e.stopPropagation();
                onCellClear();
              }}
            >
              <XIcon />
            </button>
          )}
          {rowLabel && !isDisabled && (
            <span className={rowLabelBadge({ type: rowLabelType })}>
              {rowLabel}
            </span>
          )}
        </div>
      )}
      {renderContent()}
    </div>
  );
};

export default GridCell;
