import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";

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

const BlockWrapper = styled.div`
  position: relative;
`;

interface BlockProps {
  id: string;
  icon?: string;
  abrv: string;
  isHighlighted?: boolean;
  onClick?: () => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const Block: React.FC<BlockProps> = ({
  id,
  abrv,
  isHighlighted = false,
  onClick,
  onDragStart,
  onDragEnd,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setPosition({
      x: e.clientX,
      y: e.clientY,
    });
    onDragStart?.(id);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX,
        y: e.clientY,
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        setIsDragging(false);
        onDragEnd?.(id, e.clientX, e.clientY);
      }
    },
    [isDragging, id, onDragEnd],
  );

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <BlockWrapper onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {/* Static placeholder that stays in place while dragging */}
      {isDragging && (
        <Button $isDragging={false} $isPlaceholder={true}>
          <span>{`${abrv}`}</span>
        </Button>
      )}
      {/* The actual draggable block (or clone for provider) */}
      <Button
        $isDragging={isDragging}
        $isHighlighted={isHighlighted && !isDragging}
        onMouseDown={handleMouseDown}
        onClick={!isDragging ? onClick : undefined}
        style={
          isDragging
            ? {
                left: position.x - 17,
                top: position.y - 17,
              }
            : {}
        }
      >
        <span>{`${abrv}`}</span>
      </Button>
    </BlockWrapper>
  );
};

export default Block;
