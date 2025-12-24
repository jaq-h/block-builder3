import React from "react";
import styled from "styled-components";
import Block from "../../blocks/block";
import type { BlockData } from "../../../utils/cardAssemblyUtils";
import { getCellDisplayMode } from "../../../utils/blockFactory";

// Styled Components
interface CellContainerProps {
  $isOver: boolean;
  $isValidTarget: boolean;
  $isDisabled: boolean;
  $align: "left" | "right";
}

const breathingAnimation = `
  @keyframes breathing {
    0%, 100% {
      border-color: rgba(255, 255, 255, 0.5);
      box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.1);
    }
    50% {
      border-color: rgba(255, 255, 255, 1);
      box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.2);
    }
  }
`;

const CellContainer = styled.div<CellContainerProps>`
  ${breathingAnimation}
  flex: 1;
  position: relative;
  border: ${({ $isOver }) => ($isOver ? "3px" : "1px")} solid
    ${({ $isOver, $isValidTarget, $isDisabled }) =>
      $isDisabled
        ? "#222"
        : $isOver
          ? "#fff"
          : $isValidTarget
            ? "#888"
            : "#444"};
  background-color: ${({ $isDisabled }) =>
    $isDisabled ? "rgba(0, 0, 0, 0.4)" : "transparent"};
  background-image: ${({ $isOver, $isValidTarget, $isDisabled }) => {
    if ($isDisabled) return "none";
    if ($isOver) {
      return `
        linear-gradient(to right, rgba(255, 255, 255, 0.4) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 1px, transparent 1px)
      `;
    }
    if ($isValidTarget) {
      return `
        linear-gradient(to right, rgba(255, 255, 255, 0.2) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 1px, transparent 1px)
      `;
    }
    return "none";
  }};
  background-size: ${({ $isOver, $isValidTarget }) =>
    $isOver || $isValidTarget ? "20px 20px" : "auto"};
  animation: ${({ $isOver, $isValidTarget }) =>
    $isOver || $isValidTarget ? "breathing 1.5s ease-in infinite" : "none"};
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: ${({ $align }) =>
    $align === "left" ? "flex-start" : "flex-end"};
  padding: ${({ $isOver }) => ($isOver ? "6px" : "8px")};
  min-height: 200px;
  overflow: visible;
  transition:
    border-width 0.2s,
    padding 0.2s,
    background-image 0.2s;
`;

const AxisContainer = styled.div<{ $align: "left" | "right" }>`
  position: relative;
  width: 50%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: ${({ $align }) =>
    $align === "left" ? "flex-start" : "flex-end"};
  padding: 0 8px;
  border-${({ $align }) => ($align === "left" ? "right" : "left")}: 1px solid rgba(255, 255, 255, 0.1);
`;

const AxisLabel = styled.div`
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  z-index: 1;
  pointer-events: none;
`;

const PercentageScale = styled.div`
  position: absolute;
  right: 2px;
  top: 20px;
  bottom: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
`;

const BlockPositioner = styled.div<{ $yPosition: number }>`
  position: absolute;
  left: 0;
  right: 0;
  top: ${({ $yPosition }) => {
    const topOffset = 20;
    const bottomMargin = 8;
    return `calc(${topOffset}px + (100% - ${topOffset + bottomMargin}px) * ${(100 - $yPosition) / 100})`;
  }};
  display: flex;
  justify-content: center;
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
`;

const EmptyPlaceholder = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.2);
  font-size: 12px;
`;

const CenteredContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LimitOnlyContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  position: relative;
`;

// Props interface
interface GridCellProps {
  colIndex: number;
  rowIndex: number;
  blocks: BlockData[];
  isOver: boolean;
  isValidTarget: boolean;
  isDisabled: boolean;
  align: "left" | "right";
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
  align,
  onMouseEnter,
  onMouseLeave,
  onBlockDragStart,
  onBlockDragEnd,
  onBlockVerticalDrag,
}) => {
  const displayMode = getCellDisplayMode(blocks);

  // Check if cell should show axis 1 (trigger)
  const hasAxis1Blocks = blocks.some((block) => block.axis === 1);

  // Check if cell should show axis 2 (limit)
  const hasAxis2Blocks = blocks.some((block) => block.axis === 2);

  const renderContent = () => {
    // Empty cell
    if (displayMode === "empty") {
      return <EmptyPlaceholder>Drop here</EmptyPlaceholder>;
    }

    // No-axis blocks (axes: []) - centered, not draggable, no % shown
    if (displayMode === "no-axis") {
      return (
        <CenteredContainer>
          {blocks.map((block) => (
            <Block
              key={block.id}
              id={block.id}
              icon={block.icon}
              abrv={block.abrv}
              axes={block.axes}
              hidePercentage={true}
              onDragStart={onBlockDragStart}
              onDragEnd={onBlockDragEnd}
            />
          ))}
        </CenteredContainer>
      );
    }

    // Limit-only blocks (axes: ["limit"]) - centered with single axis
    if (displayMode === "limit-only") {
      return (
        <LimitOnlyContainer>
          <AxisLabel style={{ alignSelf: "center" }}>Limit</AxisLabel>
          <PercentageScale style={{ marginLeft: "0" }}>
            <span>100%</span>
            <span>75%</span>
            <span>50%</span>
            <span>25%</span>
            <span>0%</span>
          </PercentageScale>
          {blocks.map((block) => (
            <BlockPositioner key={block.id} $yPosition={block.yPosition}>
              <Block
                id={block.id}
                icon={block.icon}
                abrv={block.abrv}
                axis={block.axis}
                yPosition={block.yPosition}
                axes={block.axes}
                onDragStart={onBlockDragStart}
                onDragEnd={onBlockDragEnd}
                onVerticalDrag={onBlockVerticalDrag}
              />
            </BlockPositioner>
          ))}
        </LimitOnlyContainer>
      );
    }

    // Dual-axis mode (trigger and/or limit)
    return (
      <>
        {/* Only show Trigger axis if there are blocks on it */}
        {hasAxis1Blocks && (
          <AxisContainer $align="left">
            <AxisLabel>Trigger</AxisLabel>
            <PercentageScale>
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </PercentageScale>
            {blocks
              .filter((block) => block.axis === 1)
              .map((block) => (
                <BlockPositioner key={block.id} $yPosition={block.yPosition}>
                  <Block
                    id={block.id}
                    icon={block.icon}
                    abrv={block.abrv}
                    axis={block.axis}
                    yPosition={block.yPosition}
                    axes={block.axes}
                    onDragStart={onBlockDragStart}
                    onDragEnd={onBlockDragEnd}
                    onVerticalDrag={onBlockVerticalDrag}
                  />
                </BlockPositioner>
              ))}
          </AxisContainer>
        )}
        {/* Only show Limit axis if there are blocks on it */}
        {hasAxis2Blocks && (
          <AxisContainer $align="right">
            <AxisLabel>Limit</AxisLabel>
            <PercentageScale>
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </PercentageScale>
            {blocks
              .filter((block) => block.axis === 2)
              .map((block) => (
                <BlockPositioner key={block.id} $yPosition={block.yPosition}>
                  <Block
                    id={block.id}
                    icon={block.icon}
                    abrv={block.abrv}
                    axis={block.axis}
                    yPosition={block.yPosition}
                    axes={block.axes}
                    onDragStart={onBlockDragStart}
                    onDragEnd={onBlockDragEnd}
                    onVerticalDrag={onBlockVerticalDrag}
                  />
                </BlockPositioner>
              ))}
          </AxisContainer>
        )}
      </>
    );
  };

  return (
    <CellContainer
      data-col={colIndex}
      data-row={rowIndex}
      $isOver={isOver}
      $isValidTarget={isValidTarget}
      $isDisabled={isDisabled}
      $align={align}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {renderContent()}
    </CellContainer>
  );
};

export default GridCell;
