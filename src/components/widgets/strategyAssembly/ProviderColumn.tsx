import React from "react";
import styled from "styled-components";
import Block from "../../blocks/block";
import { isProviderBlockHighlighted } from "../../../utils/cardAssemblyUtils";
import type { GridData } from "../../../utils/cardAssemblyUtils";
import type { OrderTypeDefinition } from "../../../data/orderTypes";
import type { CellPosition } from "../../../utils/cardAssemblyUtils";
import type { StrategyPattern } from "./StrategyAssemblyTypes";

// Styled Components
const ProviderColumnContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 90px;
  width: 110px;
  border: 1px solid rgba(229, 231, 235, 0.2);
  border-radius: 8px;
  background-color: rgb(22, 18, 31);
  overflow: hidden;
`;

const ProviderHeader = styled.div`
  padding: 8px;
  text-align: center;
  border-bottom: 1px solid #e5e7eb;
  background-color: rgba(104, 107, 130, 0.1);
`;

const ProviderHeaderText = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
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

const BlockItemWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`;

const BlockLabel = styled.span`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  white-space: normal;
  word-wrap: break-word;
  max-width: 100px;
  line-height: 1.2;
`;

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
    <ProviderColumnContainer>
      <ProviderHeader>
        <ProviderHeaderText>Orders</ProviderHeaderText>
      </ProviderHeader>
      <ProviderRow>
        {providerBlocks.map((block) => (
          <BlockItemWrapper key={block.type}>
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
            <BlockLabel>{block.label}</BlockLabel>
          </BlockItemWrapper>
        ))}
      </ProviderRow>
    </ProviderColumnContainer>
  );
};

export default ProviderColumn;
