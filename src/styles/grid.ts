// =============================================================================
// GRID STYLES - Shared grid styles and constants
// =============================================================================

import { cva } from "class-variance-authority";
import { cn } from "../lib/utils";
import type { CSSProperties } from "react";

// =============================================================================
// SCALE CONFIGURATION - Single Source of Truth
// =============================================================================

export const SCALE_CONFIG = {
  MIN_PERCENT: 0, // Minimum percentage value
  MAX_PERCENT: 50, // Maximum percentage value
  STEP_COUNT: 5, // Number of labels on the scale (0%, 12.5%, 25%, 37.5%, 50%)
} as const;

// Generate scale labels as whole numbers for display
export const getScaleLabels = (isDescending: boolean): string[] => {
  const { MIN_PERCENT, MAX_PERCENT, STEP_COUNT } = SCALE_CONFIG;
  const step = (MAX_PERCENT - MIN_PERCENT) / (STEP_COUNT - 1);
  const labels: string[] = [];

  for (let i = 0; i < STEP_COUNT; i++) {
    const value = MIN_PERCENT + step * i;
    labels.push(`${Math.round(value)}%`);
  }

  // Descending: 0% at top (near market), increasing downward
  // Ascending: 0% at bottom (near market), increasing upward
  return isDescending ? labels : labels.reverse();
};

// =============================================================================
// LAYOUT CONSTANTS
// =============================================================================

export const MARKET_PADDING = 20; // Space for market axis and price label
export const BLOCK_HEIGHT = 40; // Height of block element
export const MARKET_GAP = 10; // Gap between market axis and 0% block position

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export const getTrackHeight = () =>
  `calc(100% - ${BLOCK_HEIGHT + MARKET_PADDING + MARKET_GAP}px)`;

export const getTrackStart = (isDescending: boolean) =>
  isDescending ? MARKET_PADDING + MARKET_GAP : 0;

export const getTrackEnd = (isDescending: boolean) =>
  isDescending ? 0 : MARKET_PADDING + MARKET_GAP;

// Convert yPosition (0 to MAX_PERCENT) to track percentage (0 to 1)
export const getPositionPercent = (
  yPosition: number,
  isDescending: boolean,
) => {
  const { MAX_PERCENT } = SCALE_CONFIG;
  // Clamp yPosition to valid range
  const clampedPosition = Math.max(0, Math.min(MAX_PERCENT, yPosition));
  // Convert to 0-1 range based on max percent
  const normalizedPosition = clampedPosition / MAX_PERCENT;
  return isDescending ? normalizedPosition : 1 - normalizedPosition;
};

// =============================================================================
// CELL CONTAINER - Interactive version with drag/drop states (CVA)
// =============================================================================

const gridActivePattern =
  "linear-gradient(to right, rgba(255, 255, 255, 0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 1px, transparent 1px)";
const gridValidPattern =
  "linear-gradient(to right, rgba(255, 255, 255, 0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 1px, transparent 1px)";

export function getInteractiveCellContainerProps(opts: {
  isOver: boolean;
  isValidTarget: boolean;
  isDisabled: boolean;
  tint?: string;
}) {
  const { isOver, isValidTarget, isDisabled, tint } = opts;

  const className = cn(
    "flex-1 relative rounded-lg m-2 flex flex-col p-2 min-h-[220px] overflow-visible",
    "transition-[border-color,box-shadow,background-image,background-color] duration-200",
    // Border
    isDisabled
      ? "border border-transparent"
      : isOver
        ? "border border-accent-secondary"
        : isValidTarget
          ? "border border-accent-primary"
          : "border border-border-dimmed",
    // Box shadow
    isOver
      ? "shadow-[0_0_0_1px_var(--color-accent-secondary)]"
      : isValidTarget
        ? "shadow-[0_0_0_1px_var(--color-accent-primary)]"
        : "shadow-none",
    // Background color
    isDisabled ? "bg-bg-column" : !tint ? "bg-bg-cell-active" : "",
    // Animation
    (isOver || isValidTarget) && !isDisabled ? "animate-breathing" : "",
  );

  const style: CSSProperties = {};
  if (!isDisabled && tint) {
    style.backgroundColor = tint;
  }
  if (!isDisabled && isOver) {
    style.backgroundImage = gridActivePattern;
    style.backgroundSize = "20px 20px";
  } else if (!isDisabled && isValidTarget) {
    style.backgroundImage = gridValidPattern;
    style.backgroundSize = "20px 20px";
  }

  return { className, style };
}

// =============================================================================
// CELL CONTAINER - Read-only version for display widgets
// =============================================================================

export function getReadOnlyCellContainerProps(tint?: string) {
  const className =
    "flex-1 relative border border-border-dimmed rounded-lg m-2 flex flex-col p-2 min-h-[220px] overflow-visible";
  const style: CSSProperties = {};
  if (tint) {
    style.backgroundColor = tint;
  } else {
    style.backgroundColor = "rgba(104, 107, 130, 0.08)";
  }
  return { className, style };
}

// =============================================================================
// ROW LABEL BADGE (CVA)
// =============================================================================

export const rowLabelBadge = cva(
  "absolute top-1 right-1 px-1.5 py-0.5 rounded-[3px] text-[8px] font-semibold uppercase tracking-wide border",
  {
    variants: {
      type: {
        primary: "bg-row-label-bg text-row-label-text border-row-label-border",
        conditional:
          "bg-conditional-badge text-conditional-text border-conditional-badge-border",
      },
    },
  },
);

// =============================================================================
// CELL HEADER
// =============================================================================

export const cellHeader = "flex flex-col gap-0.5 mb-1";

export const orderTypeLabel =
  "text-[11px] font-semibold text-text-secondary capitalize";

// =============================================================================
// AXIS COMPONENTS
// =============================================================================

export function getAxisLabelItemProps(
  position?: "above" | "below",
  isSingleAxis?: boolean,
) {
  const className = cn(
    "absolute text-[9px] text-text-muted whitespace-nowrap pointer-events-none -translate-x-1/2",
    position === "above" ? "top-0.5" : "bottom-0.5",
  );
  const style: CSSProperties = {
    left: isSingleAxis !== false ? "50%" : "35%",
  };
  return { className, style };
}

export const sliderArea = "flex-1 relative flex flex-row overflow-visible";

export function getAxisColumnProps(isSingleAxis?: boolean) {
  const className = cn(
    "relative h-full flex flex-col overflow-visible",
    isSingleAxis ? "flex-1" : "flex-none w-1/2",
  );
  return className;
}

// =============================================================================
// PERCENTAGE SCALE & SLIDER TRACK
// =============================================================================

export function getPercentageScaleProps(isDescending?: boolean) {
  const isDesc = isDescending ?? false;
  const className =
    "absolute left-0 flex flex-col justify-between text-[8px] text-white-25 pointer-events-none";
  const style: CSSProperties = {
    top: `${getTrackStart(isDesc) + BLOCK_HEIGHT / 2}px`,
    bottom: `${getTrackEnd(isDesc) + BLOCK_HEIGHT / 2}px`,
  };
  return { className, style };
}

export function getSliderTrackProps(
  isDescending?: boolean,
  isSingleAxis?: boolean,
) {
  const isDesc = isDescending ?? false;
  const className =
    "absolute w-0.5 bg-linear-to-b from-slider-from to-slider-to -translate-x-1/2 pointer-events-none";
  const style: CSSProperties = {
    left: isSingleAxis !== false ? "50%" : "35%",
    top: `${getTrackStart(isDesc) + BLOCK_HEIGHT / 2}px`,
    bottom: `${getTrackEnd(isDesc) + BLOCK_HEIGHT / 2}px`,
  };
  return { className, style };
}

// =============================================================================
// MARKET PRICE LINE & LABEL
// =============================================================================

export function getMarketPriceLineProps(isDescending?: boolean) {
  const isDesc = isDescending ?? false;
  const className =
    "absolute left-0 right-0 h-0 border-t-2 border-dashed border-accent-secondary flex items-center justify-center z-5 pointer-events-none";
  const style: CSSProperties = isDesc
    ? { top: `${MARKET_PADDING}px` }
    : { bottom: `${MARKET_PADDING}px` };
  return { className, style };
}

export function getMarketPriceLabelProps(isDescending?: boolean) {
  const isDesc = isDescending ?? false;
  const className =
    "absolute left-1/2 -translate-x-1/2 text-[9px] font-medium text-text-primary whitespace-nowrap bg-bg-primary px-1.5 py-0.5 rounded-[3px] z-6";
  const style: CSSProperties = isDesc ? { bottom: "6px" } : { top: "6px" };
  return { className, style };
}

// =============================================================================
// BLOCK POSITIONER
// =============================================================================

export function getBlockPositionerProps(
  yPosition: number,
  isDescending?: boolean,
  isSingleAxis?: boolean,
) {
  const isDesc = isDescending ?? false;
  const percent = getPositionPercent(yPosition, isDesc);
  const offset = getTrackStart(isDesc);

  const className =
    "absolute flex justify-center pointer-events-none z-2 [&>*]:pointer-events-auto";
  const style: CSSProperties = {
    left: isSingleAxis !== false ? "0" : "-15%",
    right: isSingleAxis !== false ? "0" : "15%",
    top: `calc(${getTrackHeight()} * ${percent} + ${offset}px)`,
  };
  return { className, style };
}

// =============================================================================
// DASHED INDICATOR
// =============================================================================

export function getDashedIndicatorProps(
  yPosition: number,
  isDescending?: boolean,
  isSingleAxis?: boolean,
) {
  const isDesc = isDescending ?? false;
  const percent = getPositionPercent(yPosition, isDesc);
  const offset = getTrackStart(isDesc);
  const endOffset = getTrackEnd(isDesc);

  const className =
    "absolute w-px border-l-2 border-dashed border-accent-outline pointer-events-none z-1 -translate-x-1/2";
  const style: CSSProperties = {
    left: isSingleAxis !== false ? "50%" : "35%",
  };

  if (isDesc) {
    // Descending: market/0% is at the top, block is below → highlight from 0% down to block
    style.top = `${offset + BLOCK_HEIGHT / 2}px`;
    style.bottom = `calc(100% - ${getTrackHeight()} * ${percent} - ${offset + BLOCK_HEIGHT / 2}px)`;
  } else {
    // Ascending: market/0% is at the bottom, block is above → highlight from block down to 0%
    style.top = `calc(${getTrackHeight()} * ${percent} + ${offset + BLOCK_HEIGHT / 2}px)`;
    style.bottom = `${endOffset + BLOCK_HEIGHT / 2}px`;
  }
  return { className, style };
}

// =============================================================================
// PERCENTAGE LABEL
// =============================================================================

export function getPercentageLabelProps(
  yPosition: number,
  isDescending?: boolean,
  sign?: string,
  isSingleAxis?: boolean,
) {
  const isDesc = isDescending ?? false;
  const percent = getPositionPercent(yPosition, isDesc);
  const offset = getTrackStart(isDesc);

  const className =
    "absolute text-[10px] font-medium text-accent-primary pointer-events-none z-9999 whitespace-nowrap";
  const style: CSSProperties = {
    left: isSingleAxis !== false ? "calc(50% + 25px)" : "calc(35% + 25px)",
    top: `calc(${getTrackHeight()} * ${percent} + ${offset + BLOCK_HEIGHT / 2 - 6}px)`,
  };

  // Sign prefix handled in component via text content
  return { className, style, sign: sign || "" };
}

// =============================================================================
// CALCULATED PRICE LABEL
// =============================================================================

export function getCalculatedPriceLabelProps(
  yPosition: number,
  isDescending?: boolean,
  isSingleAxis?: boolean,
  isBuy?: boolean,
) {
  const isDesc = isDescending ?? false;
  const percent = getPositionPercent(yPosition, isDesc);
  const offset = getTrackStart(isDesc);

  const className =
    "absolute text-[9px] font-medium text-text-primary pointer-events-none z-9999 whitespace-nowrap px-1.5 py-0.5 rounded-[3px]";
  const style: CSSProperties = {
    backgroundColor: isBuy
      ? "rgba(76, 175, 80, 0.85)"
      : "rgba(244, 67, 54, 0.85)",
    left: isSingleAxis !== false ? "calc(50% + 25px)" : "calc(35% + 25px)",
    top: `calc(${getTrackHeight()} * ${percent} + ${offset + BLOCK_HEIGHT / 2 + 8}px)`,
  };
  return { className, style };
}

// =============================================================================
// EMPTY STATE & PLACEHOLDERS
// =============================================================================

export const emptyPlaceholder =
  "flex-1 flex items-center justify-center text-text-placeholder text-xs";

export const centeredContainer = "flex-1 flex items-center justify-center";

// =============================================================================
// WARNING ALERT
// =============================================================================

export const warningAlert =
  "flex flex-col items-center justify-center p-3 m-2 border-2 border-dashed border-accent-outline rounded-lg bg-accent-bg-subtle-light text-center";

export const warningIcon =
  "mb-2 flex items-center justify-center [&>svg]:stroke-accent-primary";

export const warningText = "text-[11px] text-accent-primary font-medium";

export const warningSubtext = "text-[9px] text-accent-muted mt-1";

// =============================================================================
// STATUS BADGE (CVA)
// =============================================================================

export const statusBadge = cva(
  "absolute top-1 left-1 px-1.5 py-0.5 rounded-[3px] text-[8px] font-semibold uppercase tracking-wide border",
  {
    variants: {
      status: {
        active:
          "bg-status-green-bg-strong text-status-green border-status-green-border",
        pending:
          "bg-status-yellow-bg-strong text-status-yellow border-status-yellow-border",
        filled:
          "bg-status-blue-bg-strong text-status-blue border-status-blue-border",
        cancelled:
          "bg-status-grey-bg-strong text-status-grey border-status-grey-border",
      },
    },
  },
);

// =============================================================================
// EMPTY CELL MESSAGE
// =============================================================================

export const emptyCellMessage =
  "flex-1 flex items-center justify-center text-neutral-muted text-[11px] italic";

// =============================================================================
// COLUMN TINT HELPERS
// =============================================================================

export const columnTints = {
  entry: {
    cell: "rgba(100, 200, 100, 0.08)",
    header: "rgba(100, 200, 100, 0.15)",
  },
  exit: {
    cell: "rgba(200, 100, 100, 0.08)",
    header: "rgba(200, 100, 100, 0.15)",
  },
} as const;
