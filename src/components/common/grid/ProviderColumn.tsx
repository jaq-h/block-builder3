import React from "react";
import Block from "../../blocks/block";
import type {
  GridData,
  CellPosition,
  StrategyPattern,
} from "../../../types/grid";
import type { OrderTypeDefinition } from "../../../data/orderTypes";
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
  onProviderMouseEnter: (type: string) => void;
  onProviderMouseLeave: () => void;
}

const ProviderColumn: React.FC<ProviderColumnProps> = ({
  providerBlocks,
  hoveredGridCell,
  isDragging,
  grid,
  strategyPattern,
  onProviderDragStart,
  onProviderDragEnd,
  onProviderMouseEnter,
  onProviderMouseLeave,
}) => {
  return (
    <div className="flex flex-col min-w-22.5 w-27.5 border border-gray-200/20 rounded-lg bg-bg-column overflow-hidden">
      <div className="p-2 text-center border-b border-gray-200 bg-neutral-bg">
        <span className="text-sm font-semibold text-text-secondary">
          Orders
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-evenly p-2 gap-0 overflow-auto">
        {providerBlocks.map((block) => (
          <div key={block.type} className="flex flex-col items-center gap-1">
            <Block
              id={block.type}
              icon={block.icon}
              abrv={block.abrv}
              isHighlighted={isProviderBlockHighlighted(
                block,
                hoveredGridCell,
                isDragging,
                grid,
                strategyPattern,
              )}
              onDragStart={() => onProviderDragStart(block.type)}
              onDragEnd={(_id, x, y) => onProviderDragEnd(block.type, x, y)}
              onMouseEnter={() => onProviderMouseEnter(block.type)}
              onMouseLeave={onProviderMouseLeave}
            />
            <span className="text-[11px] text-text-tertiary text-center wrap-break-word max-w-25 leading-[1.2]">
              {block.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProviderColumn;
