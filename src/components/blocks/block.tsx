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
  border: 2px solid
    ${({ $isHighlighted }) =>
      $isHighlighted ? "rgba(255, 255, 255, 0.5)" : "transparent"};
  border-radius: 6px;
  background-color: ${({ $isPlaceholder }) =>
    $isPlaceholder ? "rgba(133, 91, 251, 0.3)" : "#855bfb"};
  cursor: ${({ $isDragging, $isPlaceholder }) =>
    $isPlaceholder ? "default" : $isDragging ? "grabbing" : "grab"};
  user-select: none;
  position: ${({ $isDragging }) => ($isDragging ? "fixed" : "relative")};
  z-index: ${({ $isDragging }) => ($isDragging ? 1000 : 1)};
  pointer-events: ${({ $isDragging, $isPlaceholder }) =>
    $isDragging || $isPlaceholder ? "none" : "auto"};
  opacity: ${({ $isPlaceholder }) => ($isPlaceholder ? 0.5 : 1)};
  color: var(--text-color-icon-logo);
  animation: ${({ $isHighlighted }) =>
    $isHighlighted ? "blockBreathing 1.5s ease-in-out infinite" : "none"};
  &:hover {
    background-color: ${({ $isPlaceholder }) =>
      $isPlaceholder
        ? "rgba(133, 91, 251, 0.3)"
        : "var(--outline-color-secondary)"};
  }
  svg {
    width: 20px;
    height: 20px;
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
  isReadOnly?: boolean;
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
  axes = [],
  isHighlighted = false,
  isReadOnly = false,
  onClick,
  onDragStart,
  onDragEnd,
  onVerticalDrag,
  onMouseEnter,
  onMouseLeave,
}) => {
  const isVerticallyDraggable =
    !isReadOnly && axis !== undefined && axes.length > 0;
  const blockCursor = isReadOnly
    ? "default"
    : isVerticallyDraggable
      ? "ns-resize"
      : "grab";

  const { isDragging, isVerticalOnly, position, handleMouseDown } =
    useDraggable({
      id,
      isVerticallyDraggable,
      onDragStart: isReadOnly ? undefined : onDragStart,
      onDragEnd: isReadOnly ? undefined : onDragEnd,
      onVerticalDrag: isReadOnly ? undefined : onVerticalDrag,
    });

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
        onMouseDown={isReadOnly ? undefined : handleMouseDown}
        onClick={!isDragging ? onClick : undefined}
        style={{
          ...(isDragging && !isVerticalOnly
            ? { left: position.x - 17, top: position.y - 17 }
            : {}),
          cursor: isDragging && isVerticalOnly ? "grabbing" : blockCursor,
        }}
      >
        {icon ? <IconImage src={icon} alt={abrv} /> : <span>{abrv}</span>}
      </Button>
    </BlockWrapper>
  );
};

export default Block;
