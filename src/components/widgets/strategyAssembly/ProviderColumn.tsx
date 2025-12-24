import React from "react";
import styled from "styled-components";
import Block from "../../blocks/block";
import { isProviderBlockHighlighted } from "../../../utils/cardAssemblyUtils";
import type { GridData } from "../../../utils/cardAssemblyUtils";
import type { OrderTypeDefinition } from "../../../data/orderTypes";
import type { CellPosition } from "../../../utils/cardAssemblyUtils";

// Styled Components
const ProviderColumnContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 60px;
  width: 80px;
  border-right: 1px solid #444;
  background-color: rgba(50, 50, 50, 0.3);
`;

const ProviderHeader = styled.div`
  padding: 8px;
  text-align: center;
  border-bottom: 1px solid #444;
`;

const ProviderHeaderText = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #ccc;
`;

const ProviderRow = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: 8px;
  gap: 0;
  overflow: auto;
`;

// Props interface
interface ProviderColumnProps {
  providerBlocks: OrderTypeDefinition[];
  hoveredGridCell: CellPosition | null;
  isDragging: boolean;
  grid: GridData;
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
  onProviderDragStart,
  onProviderDragEnd,
  onProviderMouseEnter,
  onProviderMouseLeave,
}) => {
  return (
    <ProviderColumnContainer>
      <ProviderHeader>
        <ProviderHeaderText>Orders</ProviderHeaderText>
      </ProviderHeader>
      <ProviderRow>
        {providerBlocks.map((block) => (
          <Block
            key={block.type}
            id={block.type}
            icon={block.icon}
            abrv={block.abrv}
            hidePercentage={true}
            isHighlighted={isProviderBlockHighlighted(
              block,
              hoveredGridCell,
              isDragging,
              grid,
            )}
            onDragStart={() => onProviderDragStart(block.type)}
            onDragEnd={(_id, x, y) => onProviderDragEnd(block.type, x, y)}
            onMouseEnter={() => onProviderMouseEnter(block.type)}
            onMouseLeave={onProviderMouseLeave}
          />
        ))}
      </ProviderRow>
    </ProviderColumnContainer>
  );
};

export default ProviderColumn;
