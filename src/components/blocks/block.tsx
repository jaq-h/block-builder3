import React from "react";
import styled from "styled-components";
import { useDraggable } from "../../hooks/useDraggable";

const breathingAnimation = `
  @keyframes blockBreathing {
    0%, 100% {
      border-color: rgba(255, 255, 255, 0.5);
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
    }
    50% {
      border-color: rgba(255, 255, 255, 1);
      box-shadow: 0 0 15px rgba(255, 255, 255, 0.5);
    }
  }
`;

interface ButtonProps {
  $isDragging: boolean;
  $isPlaceholder?: boolean;
  $isHighlighted?: boolean;
}

const Button = styled.button<ButtonProps>`
  ${breathingAnimation}
  width: 40px;
  height: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 3px;
  border: ${({ $isHighlighted }) =>
    $isHighlighted ? "2px solid #fff" : "none"};
  border-radius: 4px;
  background-color: ${({ $isPlaceholder }) =>
    $isPlaceholder ? "rgba(146, 59, 163, 0.4)" : "#923ba3"};
  cursor: ${({ $isDragging, $isPlaceholder }) =>
    $isPlaceholder ? "default" : $isDragging ? "grabbing" : "grab"};
  user-select: none;
  position: ${({ $isDragging }) => ($isDragging ? "fixed" : "relative")};
  z-index: ${({ $isDragging }) => ($isDragging ? 1000 : 1)};
  pointer-events: ${({ $isDragging, $isPlaceholder }) =>
    $isDragging || $isPlaceholder ? "none" : "auto"};
  opacity: ${({ $isPlaceholder }) => ($isPlaceholder ? 0.5 : 1)};
  color: #fff;
  animation: ${({ $isHighlighted }) =>
    $isHighlighted ? "blockBreathing 1.5s ease-in-out infinite" : "none"};
  &:hover {
    background-color: ${({ $isPlaceholder }) =>
      $isPlaceholder ? "rgba(146, 59, 163, 0.4)" : "#d0d0d0"};
  }
  svg {
    width: 20px;
    height: 20px;
  }
`;

const PercentageTooltip = styled.div`
  position: absolute;
  right: -60px;
  top: 50%;
  transform: translateY(-50%);
  background-color: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1001;
  &::before {
    content: "";
    position: absolute;
    left: -4px;
    top: 50%;
    transform: translateY(-50%);
    border-right: 4px solid rgba(0, 0, 0, 0.8);
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
  }
`;

const BlockWrapper = styled.div`
  position: relative;
`;

const IconImage = styled.img`
  width: 24px;
  height: 24px;
  filter: brightness(0) invert(1);
  pointer-events: none;
`;

interface BlockProps {
  id: string;
  icon?: string;
  abrv: string;
  axis?: 1 | 2;
  yPosition?: number;
  axes?: ("trigger" | "limit")[];
  hidePercentage?: boolean;
  isHighlighted?: boolean;
  onClick?: () => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onVerticalDrag?: (id: string, mouseY: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const Block: React.FC<BlockProps> = ({
  id,
  icon,
  abrv,
  axis,
  yPosition = 50,
  axes = [],
  hidePercentage = false,
  isHighlighted = false,
  onClick,
  onDragStart,
  onDragEnd,
  onVerticalDrag,
  onMouseEnter,
  onMouseLeave,
}) => {
  const isVerticallyDraggable = axis !== undefined && axes.length > 0;
  const blockCursor = isVerticallyDraggable ? "ns-resize" : "grab";

  const { isDragging, isVerticalOnly, position, handleMouseDown } =
    useDraggable({
      id,
      isVerticallyDraggable,
      onDragStart,
      onDragEnd,
      onVerticalDrag,
    });

  const showPercentage =
    !hidePercentage && yPosition !== undefined && yPosition >= 0;

  return (
    <BlockWrapper onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {isDragging && !isVerticalOnly && (
        <Button $isDragging={false} $isPlaceholder={true}>
          {icon ? <IconImage src={icon} alt={abrv} /> : <span>{abrv}</span>}
        </Button>
      )}
      <Button
        $isDragging={isDragging && !isVerticalOnly}
        $isHighlighted={isHighlighted && !isDragging}
        onMouseDown={handleMouseDown}
        onClick={!isDragging ? onClick : undefined}
        style={{
          ...(isDragging && !isVerticalOnly
            ? { left: position.x - 17, top: position.y - 17 }
            : {}),
          cursor: isDragging && isVerticalOnly ? "grabbing" : blockCursor,
        }}
      >
        {icon ? <IconImage src={icon} alt={abrv} /> : <span>{abrv}</span>}
        {showPercentage && (
          <div style={{ fontSize: "8px", marginTop: "2px" }}>
            {Math.round(yPosition)}%
          </div>
        )}
        {isDragging && isVerticalOnly && showPercentage && (
          <PercentageTooltip>{Math.round(yPosition)}%</PercentageTooltip>
        )}
      </Button>
    </BlockWrapper>
  );
};

export default Block;
