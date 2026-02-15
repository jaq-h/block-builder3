import React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { useDraggable } from "../../hooks/useDraggable";
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
      isDragging: {
        true: "fixed z-[1000] pointer-events-none",
        false: "relative z-[1]",
      },
      isPlaceholder: {
        true: "bg-accent-bg-hover cursor-default pointer-events-none opacity-50 border-transparent hover:bg-accent-bg-hover",
        false: "bg-accent-primary opacity-100 hover:bg-accent-secondary",
      },
      isHighlighted: {
        true: "border-white-50 animate-block-breathing",
        false: "border-transparent animate-none",
      },
    },
    compoundVariants: [
      {
        isDragging: true,
        isPlaceholder: false,
        className: "pointer-events-none",
      },
    ],
    defaultVariants: {
      isDragging: false,
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

  const { isDragging, isVerticalOnly, position, handleMouseDown } =
    useDraggable({
      id,
      isVerticallyDraggable,
      onDragStart: isReadOnly ? undefined : onDragStart,
      onDragEnd: isReadOnly ? undefined : onDragEnd,
      onVerticalDrag: isReadOnly ? undefined : onVerticalDrag,
    });

  const IconComponent = icon;

  const iconContent = IconComponent ? (
    <IconComponent width={20} height={20} />
  ) : (
    <span>{abrv}</span>
  );

  return (
    <div
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isDragging && !isVerticalOnly && (
        <button
          className={buttonVariants({
            isDragging: false,
            isPlaceholder: true,
            isHighlighted: false,
          })}
        >
          {iconContent}
        </button>
      )}
      <button
        className={cn(
          buttonVariants({
            isDragging: isDragging && !isVerticalOnly,
            isPlaceholder: false,
            isHighlighted: isHighlighted && !isDragging,
          }),
        )}
        onMouseDown={isReadOnly ? undefined : handleMouseDown}
        onClick={!isDragging ? onClick : undefined}
        style={{
          ...(isDragging && !isVerticalOnly
            ? { left: position.x - 17, top: position.y - 17 }
            : {}),
          cursor: isDragging && isVerticalOnly ? "grabbing" : blockCursor,
        }}
      >
        {iconContent}
      </button>
    </div>
  );
};

export default Block;
