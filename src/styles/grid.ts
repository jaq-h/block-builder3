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
/**
 * The block tile's edge length in CSS pixels. The tile is square, so this one
 * number is its width as well as its height, and it is the only place either is
 * stated as a number.
 *
 * Three things read it, and a second copy is how any two of them come to
 * disagree without either file saying so:
 *
 *   - the price-axis layout below, which insets the track by a tile and centres
 *     a block on its own position with `BLOCK_HEIGHT / 2`;
 *   - `DragOverlay`, which centres the ghost on the pointer by half a tile;
 *   - `src/utils/dropTarget.ts`, which hit-tests that ghost's edges against the
 *     cells to decide which one a release landed in.
 *
 * `src/components/blocks/blockTile.test.ts` pins it against `BLOCK_TILE_SHAPE`'s
 * own `w-10 h-10`, so resizing the tile in the class list alone fails there
 * rather than silently drawing axis blocks off-centre and moving every drop
 * target by a few pixels.
 */
export const BLOCK_HEIGHT = 40;
export const MARKET_GAP = 10; // Gap between market axis and 0% block position

/**
 * A cell's own chrome above the axis: its 8px padding top and bottom, its 1px
 * border top and bottom, and the order-type header (a 16.5px line plus `mb-1`).
 */
export const CELL_CHROME = 8 * 2 + 1 * 2 + 20.5;

/**
 * The shortest track a price axis can be dragged on and still mean anything:
 * two block heights, so a block has somewhere above and below it to go.
 */
export const MIN_TRACK_HEIGHT = BLOCK_HEIGHT * 2;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Vertical space the track gives up to the block itself and the market label. */
export const TRACK_INSET = BLOCK_HEIGHT + MARKET_PADDING + MARKET_GAP;

export const getTrackHeight = () => `calc(100% - ${TRACK_INSET}px)`;

/** `getTrackHeight` in pixels, for a measured track element. */
export const getTrackHeightPx = (elementHeight: number) =>
  elementHeight - TRACK_INSET;

/**
 * The floor a grid cell may be drawn at, and the only place that floor is
 * written. Cells are `flex-1`, so wherever the panel has room they simply share
 * it and stand taller than this; the floor is what a short viewport falls back
 * to, and it is the height at which the price axis stops working rather than
 * the height a cell normally renders at.
 *
 * It replaced a flat 220px, which was 30px more than the assembly panel could
 * give three of them on a 900px-tall window. That is what put a scrollbar on an
 * empty grid and clipped the last two orders out of the palette - the grid did
 * not have more content than it had room for, it had a minimum it could not
 * justify. Deriving it means a change to the block height or to the market
 * label moves the floor with them instead of leaving it stale.
 */
export const CELL_MIN_HEIGHT = CELL_CHROME + TRACK_INSET + MIN_TRACK_HEIGHT;

/**
 * The height the at-market strip adds to a cell that draws one: a block tile,
 * the `pt-2` above it, the 1px rule it hangs under and the `mt-2` above that.
 */
export const AT_MARKET_STRIP_HEIGHT = BLOCK_HEIGHT + 8 + 1 + 8;

/**
 * The floor for a cell, asked with what that cell actually draws.
 *
 * A cell holding a Market order beside a priced one draws the axis AND the
 * at-market strip, and the strip is a sibling of the axis in a `flex-col` - so
 * on a short viewport it takes its height out of the axis, which is the one
 * thing `CELL_MIN_HEIGHT` exists to stop. The floor grows with the strip
 * instead. It stays one derivation rather than a magic number beside the
 * class list: change the tile size and both halves move together.
 */
export const cellMinHeight = (drawsAtMarketStrip: boolean): number =>
  CELL_MIN_HEIGHT + (drawsAtMarketStrip ? AT_MARKET_STRIP_HEIGHT : 0);

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
// TRACK GEOMETRY - the one mapping between a yPosition and a pixel
// =============================================================================
//
// The renderer and the vertical drag used to derive the track independently:
// `getBlockPositionerProps` from the axis column, the drag from the containing
// cell with its own constants. They disagreed in offset and scale, so every drag
// jumped on its first move: measured in Chrome against the base commit, a block
// rendered at 25.00% and grabbed exactly on its own centre read back through the
// drag as 31.98%. That figure is the measurement, not a derivation from assumed
// pixel values, which is why it is not round - do not recompute it. Both
// directions now go through this pair.

/**
 * Where the block's top edge is laid out, in pixels from the top of the axis
 * column it is positioned within. This is the numeric form of the `top` that
 * `getBlockPositionerProps` emits as CSS.
 */
export const getBlockTopPx = (
  yPosition: number,
  elementHeight: number,
  isDescending: boolean,
): number =>
  getTrackHeightPx(elementHeight) * getPositionPercent(yPosition, isDescending) +
  getTrackStart(isDescending);

/**
 * The exact inverse: the yPosition that lays the block's centre out at
 * `pointerY`, given the rect of the axis column it is positioned within.
 */
export const positionFromPointer = (
  trackRect: { top: number; height: number },
  pointerY: number,
  isDescending: boolean,
): number => {
  const trackHeight = getTrackHeightPx(trackRect.height);
  if (trackHeight <= 0) return 0;

  const centreOffset = getTrackStart(isDescending) + BLOCK_HEIGHT / 2;
  const percent = Math.max(
    0,
    Math.min(1, (pointerY - trackRect.top - centreOffset) / trackHeight),
  );
  const normalized = isDescending ? percent : 1 - percent;
  return normalized * SCALE_CONFIG.MAX_PERCENT;
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
  /** Whether this cell draws an at-market strip under its axis. */
  hasAtMarketStrip?: boolean;
}) {
  const { isOver, isValidTarget, isDisabled, tint, hasAtMarketStrip } = opts;

  const className = cn(
    "flex-1 relative rounded-lg m-2 flex flex-col p-2 overflow-visible",
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

  const style: CSSProperties = { minHeight: cellMinHeight(!!hasAtMarketStrip) };
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

export function getReadOnlyCellContainerProps(
  tint?: string,
  hasAtMarketStrip?: boolean,
) {
  const className =
    "flex-1 relative border border-border-dimmed rounded-lg m-2 flex flex-col p-2 overflow-visible";
  const style: CSSProperties = { minHeight: cellMinHeight(!!hasAtMarketStrip) };
  if (tint) {
    style.backgroundColor = tint;
  } else {
    style.backgroundColor = "rgba(104, 107, 130, 0.08)";
  }
  return { className, style };
}

// =============================================================================
// THE CELL'S TOP-RIGHT RAIL
// =============================================================================
//
// One absolutely positioned cluster in the cell's top-right corner, holding the
// cell's own controls and then the row-label badge. It exists because the cell
// now has a control at all: removal is per CELL rather than per block, so there
// is one clear button for the cell and it needs a home that is not a block's
// tile. The badge no longer positions itself, because two things owning one
// corner is how they come to overlap.
//
// **The rail is right-anchored and the badge is its LAST child, which is what
// makes every position in it final.** A right-anchored group grows leftwards,
// so an item added at the front moves nothing that follows it. That buys two
// things at once, and both were measured rather than assumed:
//
//   - **The badge never moves.** An empty cell shows the badge alone and an
//     occupied one shows the clear button beside it; measured in Chrome at
//     1440x900 down the Exit column, the badge sits 5px from the cell's right
//     border edge and 8px from its top in BOTH states. Put the badge first and
//     it slides 28px left the moment the cell takes an order, so a column of
//     cells no longer lines its badges up.
//   - **The clear button never moves either.** A cell-detail editor is planned
//     - an edit icon that flips the cell to its rear side to type values in -
//     and it joins this rail at the FRONT, so the clear button stays exactly
//     where the user last pressed it. Nothing in this rail may be reordered to
//     put a growing set of controls to the right of a fixed one.
//
// A pleasant consequence rather than the reason: the extreme corner is the
// inert badge, so a press aimed vaguely at "the corner" of a cell does not
// destroy its orders.
//
// `items-center` with `min-h-6`: the badge is about 17px tall and a control is
// 24px, so the rail is 24px tall whether or not it holds a control, and a
// cluster whose parts share a centre line reads as one thing. Without the
// floor the badge would sit 3px higher on an empty cell than on a full one.
//
// The z-index puts it over the axis furniture below it. Nothing in the axis is
// drawn this high in the cell today - the price chips ride at `z-9999` but sit
// on their block's own offset, which starts below the market line - so this is
// the belt to that brace rather than a fix for an overlap on screen.
export const cellActionRail =
  "absolute top-1 right-1 z-10 flex items-center gap-1 min-h-6";

/**
 * A control in the rail above: 24px square, which is the WCAG 2.2 SC 2.5.8
 * minimum target size and the same floor `chartToggleButton` carries.
 *
 * `p-0` beside it is load-bearing rather than tidiness. `src/index.css`'s
 * layered `button` default is `padding: 0.6em 1.2em`, and under
 * `box-sizing: border-box` a `width` cannot shrink a box below its own padding
 * and border - so `w-6` alone asks for 24px and gets 40.375px, measured in
 * Chrome on the control this replaced. The app has exactly one mechanism for a
 * control that wants to look different, and it is stating the utility
 * (`AGENTS.md`, "Layout and the CSS cascade"); this is that.
 *
 * It is rendered, never revealed on hover: a control shown on `:hover` exists
 * for a mouse and for nothing else, and the sticky `:hover` a tap leaves behind
 * on some browsers is an accident rather than an affordance.
 *
 * Quiet at rest and red under the cursor or the focus ring. A grid full of red
 * dots would spend, on the least-used control on screen, exactly the visual
 * weight the block tiles need for saying what they are.
 */
export const cellClearButton = cn(
  "p-0 w-6 h-6 flex items-center justify-center rounded-full cursor-pointer",
  "border border-border-neutral bg-bg-column text-white-70",
  "transition-colors duration-150",
  "hover:bg-status-red-bg-strong hover:border-status-red-border hover:text-text-primary",
  "focus-visible:bg-status-red-bg-strong focus-visible:border-status-red-border focus-visible:text-text-primary",
  "[&_svg]:w-3 [&_svg]:h-3 [&_svg]:stroke-current [&_svg]:pointer-events-none",
);

// =============================================================================
// ROW LABEL BADGE (CVA)
// =============================================================================
//
// Positioned by `cellActionRail` above rather than by itself. It used to carry
// its own `absolute top-1 right-1`, which is the corner the cell's controls now
// need; two things owning one corner is how they come to overlap.

export const rowLabelBadge = cva(
  "px-1.5 py-0.5 rounded-[3px] text-[8px] font-semibold uppercase tracking-wide border whitespace-nowrap",
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

/**
 * The cell's header line: the orders it holds, named once each.
 *
 * `truncate` rather than wrapping, because `CELL_CHROME` counts this as one
 * 16.5px line and a second line would come out of the axis below it - the one
 * thing `CELL_MIN_HEIGHT` exists to stop. Nothing is lost to a screen reader:
 * the cell's own group label lists what it holds, and every tile in it carries
 * its own name.
 */
export const orderTypeLabel =
  "text-[11px] font-semibold text-text-secondary capitalize truncate";

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

/**
 * The row a price axis column sits in, and **the thing that gives that column
 * its height.** It must stay a flex ROW whose children are stretched: stretch
 * only supplies a height while the cross axis IS the height, so a `flex-col`
 * here, or an `items-start`/`items-center`/`items-end`/`items-baseline` that
 * opts the children out, collapses the whole axis exactly as the `h-full` on
 * `getAxisColumnProps` did. Read that function's docblock for what a collapse
 * costs; the axis column also has to remain this box's DIRECT child.
 */
export const sliderArea = "flex-1 relative flex flex-row overflow-visible";

/**
 * The box a price axis is drawn inside, and the one the vertical drag measures
 * to invert that layout. **Its height comes from `sliderArea` stretching it,
 * and it must never be asked for as a percentage again.**
 *
 * Everything the axis draws is positioned against this box and nothing else:
 * the track and the percentage scale are `top`/`bottom` insets on it, and
 * `getBlockPositionerProps` lays a block out at `calc((100% - 70px) * percent)`
 * within it. Every one of those reads zero if this box reads zero, so a single
 * collapsed height is the whole axis at once - no track to grab, a scale
 * clumped into 60px, and an offset mapped onto a NEGATIVE 70px range, which
 * draws the block above the market line and moves it the wrong way.
 *
 * It carried `h-full` and did exactly that. A percentage height needs a
 * definite height to resolve against, and the chain above it is only definite
 * while the grid columns are flex items of a ROW. `columnsWrapper` STACKED them
 * below `sm` at the time, making them items of a column with no definite
 * height, because below `lg` the shell is deliberately content-sized. That
 * stacking has since gone - the columns are side by side at every width now and
 * the panel pages between them - so what follows is the record of the collapse
 * rather than something reproducible today. `height: 100%` resolved to 0, and
 * since every child here is absolutely positioned there was no content to fall
 * back on. Measured in
 * Chrome with a Limit in Entry: this box and the track stood at 150px/80px at
 * 640 and above and at 0px/0px at 320, 360, 390 and 414, with the block drawn
 * at y 24.5 instead of y 99.5.
 *
 * `align-items: stretch` is what sizes it now - the default for a flex item,
 * and the parent (`sliderArea`) is a `flex-row` whose cross axis IS this
 * height. Stretch needs no definite parent height, so nothing above this box
 * can take its height away again. It was doing the work above `sm` all along:
 * `h-full` was
 * redundant there, which is why removing it leaves 768, 1024 and 1440
 * measuring exactly what they measured before.
 *
 * Do not restore `h-full`, and do not answer a future collapse with a pixel
 * height or a `min-h-*` here: the axis is a proportion of whatever height the
 * cell has, so a number would be a second owner of `CELL_MIN_HEIGHT`'s job.
 */
export function getAxisColumnProps(isSingleAxis?: boolean) {
  const className = cn(
    "relative flex flex-col overflow-visible",
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
    "absolute flex justify-center pointer-events-none z-2 *:pointer-events-auto";
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
// THE AT-MARKET STRIP
// =============================================================================
//
// Where a cell draws the orders that carry no price - a Market order - when it
// is drawing a price axis for the ones that do. It is off the ruler on purpose:
// the strip has no track, no percentage scale and no position to read, because
// a market order has no offset from the market to draw. It says which orders
// those are and that they execute at the market, and the axis above it keeps
// the ruler for the orders that are placed against it.
//
// `shrink-0` because it is a sibling of `sliderArea`, which is `flex-1`: the
// axis gives up the height, and `cellMinHeight` is what stops it giving up
// more than it has. It is drawn UNDER the axis at every direction, so its
// position does not move with the cell's scale.

export const atMarketStrip =
  "shrink-0 mt-2 pt-2 border-t border-border-dimmed flex items-center gap-2";

export const atMarketLabel =
  "text-[9px] text-text-muted uppercase tracking-wide whitespace-nowrap";

export const atMarketBlocks = "flex flex-row items-center gap-1";

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
