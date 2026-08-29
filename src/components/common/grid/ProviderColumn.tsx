import type { FC } from "react";
import Block from "../../blocks/block";
import type {
  GridData,
  CellPosition,
  StrategyPattern,
} from "../../../types/grid";
import type { OrderTypeDefinition } from "../../../data/orderTypes";
import type { CancelOptions } from "../../../hooks/useBlockCommand";
import type { ActivationOrigin } from "../../../utils/blockCommand";
import { isProviderBlockHighlighted } from "../../../utils";

// Props interface
interface ProviderColumnProps {
  providerBlocks: OrderTypeDefinition[];
  hoveredGridCell: CellPosition | null;
  isDragging: boolean;
  grid: GridData;
  strategyPattern: StrategyPattern;
  onProviderDragStart: (type: string) => void;
  onProviderDragEnd: (type: string, x: number, y: number) => void;
  onProviderDragCancel: (type: string) => void;
  onProviderDragAborted: (type: string) => void;
  onProviderDragRecognised: (type: string) => void;
  onProviderMouseEnter: (type: string) => void;
  onProviderMouseLeave: () => void;
  /** Enter, Space, a click or a tap: pick this order type up, place it, or put it back. */
  onProviderActivate: (type: string, origin: ActivationOrigin) => void;
  onCommandMove: (dCol: number, dRow: number) => void;
  onCommandCancel: (options?: CancelOptions) => void;
  /** The order type currently picked up by the command model, if any. */
  carryingType: string | null;
  focusType: string | null;
  onFocusHandled: () => void;
}

const ProviderColumn: FC<ProviderColumnProps> = ({
  providerBlocks,
  hoveredGridCell,
  isDragging,
  grid,
  strategyPattern,
  onProviderDragStart,
  onProviderDragEnd,
  onProviderDragCancel,
  onProviderDragAborted,
  onProviderDragRecognised,
  onProviderMouseEnter,
  onProviderMouseLeave,
  onProviderActivate,
  onCommandMove,
  onCommandCancel,
  carryingType,
  focusType,
  onFocusHandled,
}) => {
  return (
    <div
      role="group"
      aria-label="Order types"
      className="flex flex-col w-full sm:w-27.5 sm:min-w-22.5 border border-gray-200/20 rounded-lg bg-bg-column overflow-hidden"
    >
      <div className="p-2 text-center border-b border-gray-200 bg-neutral-bg">
        <span className="text-sm font-semibold text-text-secondary">
          Orders
        </span>
      </div>
      {/* Two forms of the same palette, and the panel's width decides which.
          Below `sm` the three lanes of the grid pane are stacked bands (see
          `contentRow`), so the palette is the full width of the panel and lays
          its orders out across it - an auto-filling grid rather than a column
          nine tiles tall, which would push the Entry column most of a phone
          screen down before it started. The track floor is the 40px block tile
          plus room for its label to wrap; `auto-fill` takes the count from the
          width it is given rather than from a breakpoint.

          From `sm` it is the left-hand lane again, a single column of tiles
          scrolling inside whatever height the panel has left. That
          `overflow-auto` is deliberately the wide form's alone: stacked, the
          palette's height is its content's, so there is nothing to scroll and a
          scrollport would only clip the tiles' focus rings. */}
      <div className="flex-1 grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-x-1 gap-y-2 p-2 sm:flex sm:flex-col sm:items-center sm:justify-evenly sm:gap-0 sm:overflow-auto">
        {providerBlocks.map((block) => (
          <div key={block.type} className="flex flex-col items-center gap-1">
            <Block
              id={block.type}
              icon={block.icon}
              abrv={block.abrv}
              label={block.label}
              isHighlighted={isProviderBlockHighlighted(
                block,
                hoveredGridCell,
                isDragging,
                grid,
                strategyPattern,
              )}
              isCarrying={carryingType === block.type}
              shouldFocus={focusType === block.type}
              onFocusHandled={onFocusHandled}
              onDragStart={() => onProviderDragStart(block.type)}
              onDragEnd={(_id, x, y) => onProviderDragEnd(block.type, x, y)}
              onDragCancel={() => onProviderDragCancel(block.type)}
              onDragAborted={() => onProviderDragAborted(block.type)}
              onDragRecognised={() => onProviderDragRecognised(block.type)}
              onActivate={(_id, origin) =>
                onProviderActivate(block.type, origin)
              }
              onCommandMove={onCommandMove}
              onCommandCancel={onCommandCancel}
              onMouseEnter={() => onProviderMouseEnter(block.type)}
              onMouseLeave={onProviderMouseLeave}
            />
            <span
              aria-hidden="true"
              className="text-[11px] text-text-tertiary text-center wrap-break-word max-w-25 leading-[1.2]"
            >
              {block.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProviderColumn;
