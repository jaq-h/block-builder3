import { useEffect, useRef, type FC } from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { useFreeDrag } from "../../hooks/useFreeDrag";
import { useVerticalDrag } from "../../hooks/useVerticalDrag";
import type { SvgIcon } from "../../data/orderTypes";
import type { CancelOptions } from "../../hooks/useBlockCommand";
import type { ActivationOrigin } from "../../utils/blockCommand";
import { SCALE_CONFIG } from "../../styles/grid";

/** The id every block's instructions are described by. Rendered once by GridArea. */
export const BLOCK_INSTRUCTIONS_ID = "strategy-block-instructions";

// THE ONE DELIBERATE EXCEPTION TO THE APP-WIDE BUTTON TREATMENT.
//
// `src/index.css`'s button defaults are layered now, so every button in the app
// paints whatever its own utilities ask for. This block asked for
// `bg-accent-primary`, and taking it literally turned the order palette into
// nine identical squares of solid `#855bfb` - see the PR's before-and-after.
//
// That is wrong here specifically, because a block tile is the one surface in
// this app whose *colour is its state*. A tile has to say, by colour alone at a
// glance across the panel, whether it is an ordinary palette entry, the valid
// drop target for the cell under the pointer (`isHighlighted`), the block
// currently in hand (`isCarrying`), or the ghost left where a free drag began
// (`isPlaceholder`). Painting the resting state at full accent saturation spends
// the accent before any of those has anything left to say with it - and the
// accent is what "active" means everywhere else in the app, on the selected
// assembly type, the selected timeframe and the selected price scale.
//
// So the resting tile keeps a quiet accent-tinted surface and the saturated end
// of the scale is left free for the states above. This is a design decision
// about this component, written in its own utilities rather than in a cascade
// workaround: there is no `data-unstyled` and no `!` modifier here, and adding
// either back is a regression, not an exception (`AGENTS.md`, "Layout and the
// CSS cascade").
//
// One thing genuinely improved by the layer and must not be undone: `border-2`
// now paints. The unlayered reset used to flatten it to its own 1px neutral
// border, so `isHighlighted`'s `border-white-50` drew nothing and the highlight
// was carried by the breathing glow alone.
const buttonVariants = cva(
  [
    "w-10 h-10 flex flex-col justify-center items-center p-[3px]",
    "border-2 rounded-md select-none",
    "text-text-primary",
    // Without this the browser claims a finger drag for page scrolling before
    // the first `pointermove` reaches the drag hooks - the whole gesture is
    // then a scroll and the block never moves.
    "touch-none",
    "[&_svg]:w-5 [&_svg]:h-5 [&_svg]:stroke-current [&_svg]:pointer-events-none",
  ],
  {
    variants: {
      isPlaceholder: {
        true: "bg-accent-bg-subtle-light cursor-default pointer-events-none opacity-50 border-transparent hover:bg-accent-bg-subtle-light",
        false: "bg-accent-bg-subtle opacity-100 hover:bg-accent-bg-hover",
      },
      isHighlighted: {
        true: "border-white-50 animate-block-breathing",
        false: "border-transparent animate-none",
      },
      isCarrying: {
        // The carried block stays visible and marked while the user chooses a
        // cell, so a sighted keyboard user can see what they are holding.
        true: "outline-2 outline-offset-2 outline-accent-secondary animate-block-breathing",
        false: "",
      },
    },
    defaultVariants: {
      isPlaceholder: false,
      isHighlighted: false,
      isCarrying: false,
    },
  },
);

// Keyboard steps along the price axis, in percentage points.
const PRICE_STEP = 1;
const PRICE_STEP_LARGE = 5;
const PRICE_STEP_PAGE = 10;
/** Clamped by the grid, so this reaches the end of the axis from anywhere. */
const PRICE_STEP_TO_END = SCALE_CONFIG.MAX_PERCENT * 2;

interface BlockProps {
  id: string;
  icon?: SvgIcon;
  abrv: string;
  /** Order type name, e.g. "Stop Loss Limit". Carries the accessible name. */
  label?: string;
  axis?: 1 | 2;
  yPosition?: number;
  axes?: ("trigger" | "limit")[];
  /** "Entry column, primary row" - the position part of the accessible name. */
  cellDescription?: string;
  /** Rendered price at the current position, e.g. "$95,861.25". */
  priceText?: string;
  /** Which way the price scale this block is drawn on runs, from its cell. */
  direction?: "upside" | "downside";
  isHighlighted?: boolean;
  isReadOnly?: boolean;
  /** This block is the one currently picked up by the command model. */
  isCarrying?: boolean;
  /** Take DOM focus on the next render, then call `onFocusHandled`. */
  shouldFocus?: boolean;
  onFocusHandled?: () => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onDragCancel?: (id: string) => void;
  /**
   * A free drag ended after it had really begun without a release to resolve -
   * see `usePointerGesture`'s `onCancel` for the ways that happens. Nothing
   * moved, and unlike `onDragCancel` this never fires for a tap, so it is the
   * outcome the user is told about.
   */
  onDragAborted?: (id: string) => void;
  /**
   * The gesture crossed the tap slop, so it is a drag. A drag supersedes an
   * active command carry, which is why this is not the same moment as
   * `onDragStart`: that one fires on pointer down, when a tap still looks
   * identical.
   *
   * Both drag hooks report it, the vertical price drag included: a price drag
   * appends the same click to the same cell and would place the carried block
   * just as surely. What the carried block's owner does about it depends on
   * whether the drag is about that same block, which is `releaseForDrag`'s
   * decision to make - not this component's.
   */
  onDragRecognised?: (id: string) => void;
  onVerticalDrag?: (id: string, pointerY: number) => void;
  /**
   * Enter, Space, or a press and release without movement. `origin` separates
   * the affordances that differ per device: pressing Enter on a block already
   * being carried places it, while clicking or tapping it again puts it back
   * down - and a mouse carry is drawn and worded differently from a finger's,
   * because a mouse leaves a cursor on screen for the block to follow.
   */
  onActivate?: (id: string, origin: ActivationOrigin) => void;
  /** Arrows while carrying: choose another target cell. */
  onCommandMove?: (dCol: number, dRow: number) => void;
  /** Escape while carrying: put the block back. */
  onCommandCancel?: (options?: CancelOptions) => void;
  /** Arrows on a placed block: move it along the price axis, towards higher prices. */
  onAdjustPrice?: (id: string, delta: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const Block: FC<BlockProps> = ({
  id,
  icon,
  abrv,
  label,
  axis,
  yPosition,
  axes = [],
  cellDescription,
  priceText,
  direction = "upside",
  isHighlighted = false,
  isReadOnly = false,
  isCarrying = false,
  shouldFocus = false,
  onFocusHandled,
  onDragStart,
  onDragEnd,
  onDragCancel,
  onDragAborted,
  onDragRecognised,
  onVerticalDrag,
  onActivate,
  onCommandMove,
  onCommandCancel,
  onAdjustPrice,
  onMouseEnter,
  onMouseLeave,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  // A block sits on a price axis whether or not it can be moved: a read-only
  // one still has to say what price it represents.
  const isOnPriceAxis =
    axis !== undefined && axes.length > 0 && yPosition !== undefined;
  const isVerticallyDraggable =
    !isReadOnly && axis !== undefined && axes.length > 0;
  const blockCursor = isReadOnly
    ? "default"
    : isVerticallyDraggable
      ? "ns-resize"
      : "grab";

  // ── Two focused hooks; only one is wired to the button at a time ──
  const { isDragging: isFreeDragging, handlers: freeDragHandlers } = useFreeDrag(
    {
      id,
      icon,
      abrv,
      disabled: isReadOnly,
      onDragStart,
      onDragEnd,
      onDragCancel,
      onDragAborted,
      onDragRecognised,
      onActivate: (blockId, origin) => onActivate?.(blockId, origin),
    },
  );

  const { isDragging: isVertDragging, handlers: vertDragHandlers } =
    useVerticalDrag({
      id,
      disabled: isReadOnly,
      onVerticalDrag,
      onDragRecognised,
      onActivate: (blockId, origin) => onActivate?.(blockId, origin),
    });

  const isDragging = isFreeDragging || isVertDragging;
  const pointerHandlers = isVerticallyDraggable
    ? vertDragHandlers
    : freeDragHandlers;

  // Focus is handed back explicitly after a place or a cancel, so it is never
  // left on an element that has just been replaced or moved.
  useEffect(() => {
    if (!shouldFocus) return;
    buttonRef.current?.focus();
    onFocusHandled?.();
  }, [shouldFocus, onFocusHandled]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (isReadOnly) return;

    if (isCarrying) {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          onCommandMove?.(-1, 0);
          return;
        case "ArrowRight":
          e.preventDefault();
          onCommandMove?.(1, 0);
          return;
        case "ArrowUp":
          e.preventDefault();
          onCommandMove?.(0, -1);
          return;
        case "ArrowDown":
          e.preventDefault();
          onCommandMove?.(0, 1);
          return;
        case "Enter":
        case " ":
          e.preventDefault();
          onActivate?.(id, "keyboard");
          return;
        case "Escape":
          e.preventDefault();
          onCommandCancel?.();
          return;
        case "Tab":
          // Tab is never swallowed - the carry is abandoned and focus moves on,
          // so a carried block can never trap the keyboard. Focus must not be
          // handed back here: the browser moves it before the request is
          // honoured, so restoring it would yank the user back to this block
          // and swallow the Tab after all.
          onCommandCancel?.({ restoreFocus: false });
          return;
        default:
          return;
      }
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate?.(id, "keyboard");
      return;
    }

    if (!isOnPriceAxis || !onAdjustPrice) return;

    // Along the price axis, "up" is always towards a higher price, whichever
    // side of the market this block sits on.
    const step = e.shiftKey ? PRICE_STEP_LARGE : PRICE_STEP;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        e.preventDefault();
        onAdjustPrice(id, step);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        e.preventDefault();
        onAdjustPrice(id, -step);
        break;
      case "PageUp":
        e.preventDefault();
        onAdjustPrice(id, PRICE_STEP_PAGE);
        break;
      case "PageDown":
        e.preventDefault();
        onAdjustPrice(id, -PRICE_STEP_PAGE);
        break;
      case "Home":
        e.preventDefault();
        onAdjustPrice(id, -PRICE_STEP_TO_END);
        break;
      case "End":
        e.preventDefault();
        onAdjustPrice(id, PRICE_STEP_TO_END);
        break;
      default:
        break;
    }
  };

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

  const name = label ?? abrv;
  const axisName = axis === 1 ? "trigger" : "limit";
  // Signed offset from the market price: positive above it, negative below.
  // That makes the value move the same way as the block does on screen, in
  // both scale directions, which is what a vertical slider has to do.
  const signedPercent =
    yPosition === undefined
      ? 0
      : direction === "downside"
        ? -yPosition
        : yPosition;
  const sliderLabel = [
    `${name} ${axisName} price`,
    cellDescription,
  ]
    .filter(Boolean)
    .join(", ");
  // At the market price itself there is no direction to sign, and "+0.00%"
  // reads as an offset that is not there.
  const sign = signedPercent === 0 ? "" : signedPercent > 0 ? "+" : "-";
  const valueText = `${sign}${Math.abs(signedPercent).toFixed(2)}%${priceText ? `, ${priceText}` : ""}`;

  // Only a palette entry offers to add anything. A read-only block describes
  // an order that already exists, in a panel with no placement affordance.
  const staticLabel = cellDescription
    ? `${name} order, ${cellDescription}`
    : isReadOnly
      ? `${name} order`
      : `Add ${name} order`;

  // A read-only block is information, not a control: it must not be a tab stop
  // that promises an interaction the panel does not offer.
  if (isReadOnly) {
    return (
      <div className="relative">
        <div
          role="img"
          aria-label={
            isOnPriceAxis ? `${sliderLabel}, ${valueText}` : staticLabel
          }
          className={cn(buttonVariants({}), "relative z-1 cursor-default")}
        >
          {iconContent}
        </div>
      </div>
    );
  }

  const ariaProps = isOnPriceAxis
    ? ({
        role: "slider",
        "aria-label": sliderLabel,
        "aria-orientation": "vertical",
        "aria-valuemin":
          direction === "downside" ? -SCALE_CONFIG.MAX_PERCENT : 0,
        "aria-valuemax":
          direction === "downside" ? 0 : SCALE_CONFIG.MAX_PERCENT,
        "aria-valuenow": Number(signedPercent.toFixed(2)),
        "aria-valuetext": valueText,
      } as const)
    : ({ "aria-label": staticLabel } as const);

  return (
    <div
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          buttonVariants({
            isPlaceholder: isFreeFormDragging,
            isHighlighted: isHighlighted && !isDragging,
            isCarrying,
          }),
          // Keep relative z-index; the overlay portal handles the high z
          "relative z-1",
        )}
        {...ariaProps}
        aria-describedby={BLOCK_INSTRUCTIONS_ID}
        {...pointerHandlers}
        onKeyDown={handleKeyDown}
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
