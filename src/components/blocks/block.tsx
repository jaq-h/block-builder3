import React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { useFreeDrag } from "../../hooks/useFreeDrag";
import { useVerticalDrag } from "../../hooks/useVerticalDrag";
import type { SvgIcon } from "../../data/orderTypes";

const buttonVariants = cva(
  [
    "w-10 h-10 flex flex-col justify-center items-center p-[3px]",
    "border-2 rounded-md select-none",
    "text-text-primary",
    "[&_svg]:w-5 [&_svg]:h-5 [&_svg]:stroke-current [&_svg]:pointer-events-none",
  ],
  {
    variants: {
      isPlaceholder: {
        true: "bg-accent-bg-hover cursor-default pointer-events-none opacity-50 border-transparent hover:bg-accent-bg-hover",
        false: "bg-accent-primary opacity-100 hover:bg-accent-secondary",
      },
      isHighlighted: {
        true: "border-white-50 animate-block-breathing",
        false: "border-transparent animate-none",
      },
    },
    defaultVariants: {
      isPlaceholder: false,
      isHighlighted: false,
    },
  },
);

interface BlockProps {
  id: string;
  icon?: SvgIcon;
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

  // ── Two focused hooks; only one is wired to the button at a time ──
  const { isDragging: isFreeDragging, handleMouseDown: handleFreeDragDown } =
    useFreeDrag({
      id,
      icon,
      abrv,
      onDragStart: isReadOnly ? undefined : onDragStart,
      onDragEnd: isReadOnly ? undefined : onDragEnd,
    });

  const { isDragging: isVertDragging, handleMouseDown: handleVertDragDown } =
    useVerticalDrag({
      id,
      onVerticalDrag: isReadOnly ? undefined : onVerticalDrag,
    });

  const isDragging = isFreeDragging || isVertDragging;
  const handleMouseDown = isVerticallyDraggable
    ? handleVertDragDown
    : handleFreeDragDown;

  const IconComponent = icon;

  const iconContent = IconComponent ? (
    <IconComponent width={20} height={20} />
  ) : (
    <span>{abrv}</span>
  );

  // When performing a free (non-vertical) drag, the moving visual is rendered
  // by DragOverlay via a portal.  This component only shows the ghost
  // placeholder at the original grid position.
  const isFreeFormDragging = isFreeDragging;

  return (
    <div
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        className={cn(
          buttonVariants({
            isPlaceholder: isFreeFormDragging,
            isHighlighted: isHighlighted && !isDragging,
          }),
          // Keep relative z-index; the overlay portal handles the high z
          "relative z-1",
        )}
        onMouseDown={isReadOnly ? undefined : handleMouseDown}
        onClick={!isDragging ? onClick : undefined}
        style={{
          cursor: isVertDragging ? "grabbing" : blockCursor,
        }}
      >
        {iconContent}
      </button>
    </div>
  );
};

export default Block;
