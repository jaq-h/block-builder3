import { useEffect, useRef, type FC } from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { useFreeDrag } from "../../hooks/useFreeDrag";
import { useVerticalDrag } from "../../hooks/useVerticalDrag";
import type { SvgIcon } from "../../data/orderTypes";
import type { CancelOptions } from "../../hooks/useBlockCommand";
import type { ActivationOrigin } from "../../utils/blockCommand";
import type { BlockDirection } from "../../types/grid";
import {
  MAX_OFFSET_PERCENT,
  signedOffset,
  type PriceAxisLeg,
} from "../../utils/blockMapping";
import { BLOCK_TILE_SHAPE } from "./blockTile";
import XIcon from "../../assets/icons/x.svg?react";

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
    ...BLOCK_TILE_SHAPE,
    // Without this the browser claims a finger drag for page scrolling before
    // the first `pointermove` reaches the drag hooks - the whole gesture is
    // then a scroll and the block never moves.
    "touch-none",
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
const PRICE_STEP_TO_END = MAX_OFFSET_PERCENT * 2;

// THE POINTER'S REMOVAL AFFORDANCE, AND THE ONLY ONE MOST BLOCKS HAVE.
//
// Dragging a block clear of the grid removes it, and for a long time that was
// the whole story - which meant it was no story at all for the majority of the
// grid: a cell that draws a price axis wires `useVerticalDrag` instead of
// `useFreeDrag`, so a placed Limit, Stop Loss or Take Profit could not be
// dragged off at all and Clear All, which destroys the entire strategy, was the
// only way to be rid of one. Decision D9 made that gap load-bearing by naming
// delete-and-rebuild as *the* way to correct a misplaced order.
//
// It is rendered rather than revealed, and that is the decision the whole task
// turns on. A control shown on `:hover` exists for a mouse and for nothing
// else: a finger has no hover, and the sticky `:hover` a tap leaves behind on
// some browsers is an accident rather than an affordance. Parity across mouse,
// keyboard and touch is the point here, so the control is simply there, for all
// three, at all times.
//
// `w-6 h-6` is 24px, the WCAG 2.2 SC 2.5.8 minimum target size, and it is the
// same floor `chartToggleButton` carries for the same reason. The colour is
// quiet at rest and turns red under the cursor or the focus ring: a grid full
// of red dots would spend, on the least-used control on screen, exactly the
// visual weight the block tiles need for saying what they are.
const removeButton = cn(
  "absolute -top-2 -right-2 z-2",
  // `p-0` is load-bearing, not tidiness. `src/index.css`'s layered `button`
  // default is `padding: 0.6em 1.2em`, and under `box-sizing: border-box` a
  // `width` cannot shrink a box below its own padding and border - so `w-6`
  // asked for 24px and the button measured 40.375px wide in Chrome, wider than
  // the 40px tile it sits on. The app has exactly one mechanism for a control
  // that wants to look different, and it is stating the utility (`AGENTS.md`,
  // "Layout and the CSS cascade"); this is that, and `BLOCK_TILE_SHAPE`'s own
  // `p-[3px]` is the same move for the same reason.
  "p-0 w-6 h-6 flex items-center justify-center rounded-full cursor-pointer",
  "border border-border-neutral bg-bg-column text-white-70",
  "transition-colors duration-150",
  "hover:bg-status-red-bg-strong hover:border-status-red-border hover:text-text-primary",
  "focus-visible:bg-status-red-bg-strong focus-visible:border-status-red-border focus-visible:text-text-primary",
  "[&_svg]:w-3 [&_svg]:h-3 [&_svg]:stroke-current [&_svg]:pointer-events-none",
);

interface BlockProps {
  id: string;
  icon?: SvgIcon;
  abrv: string;
  /** Order type name, e.g. "Stop Loss Limit". Carries the accessible name. */
  label?: string;
  /**
   * Which price axis this block is drawn on in the cell rendering it, or
   * `undefined`/`null` when that cell draws no axis at all.
   *
   * Handed down rather than worked out here, and that is the point: this
   * component used to answer the same question again from `axis` and `axes`,
   * so in a cell that drew every block flat - a bulk cell holding a Market
   * order - a limit leg still believed it was on an axis. `legInCell` in
   * `utils/blockMapping.ts` is the one answer, and it needs the cell to give
   * it, which this component does not have.
   */
  leg?: PriceAxisLeg | null;
  yPosition?: number;
  /** "Entry column, primary row" - the position part of the accessible name. */
  cellDescription?: string;
  /** Rendered price at the current position, e.g. "$95,861.25". */
  priceText?: string;
  /** Which way the price scale this block is drawn on runs, from its cell. */
  direction?: BlockDirection;
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
  /**
   * Take this block off the grid. Passed for a *placed* block only - a palette
   * entry is an order type rather than an order, so there is nothing there to
   * remove - which is what decides whether this component draws the remove
   * control and whether Delete and Backspace do anything on it.
   */
  onRemove?: (id: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const Block: FC<BlockProps> = ({
  id,
  icon,
  abrv,
  label,
  leg,
  yPosition,
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
  onRemove,
  onMouseEnter,
  onMouseLeave,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  // A block sits on a price axis whether or not it can be moved: a read-only
  // one still has to say what price it represents. One derivation, from the leg
  // the cell handed down - the vertical drag and the accessible slider are two
  // faces of the same fact and must never be able to disagree about it.
  const isOnPriceAxis = !!leg && yPosition !== undefined;
  const isVerticallyDraggable = !isReadOnly && isOnPriceAxis;
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

    // Both keys, because a block is a thing in a place and the platforms differ
    // about which one deletes it. Before Enter and Space rather than after,
    // since neither of those can match here and reading order is what a later
    // reader checks. `preventDefault` on Backspace is not decoration: an
    // ancestor scroller or an older browser can still read it as "go back".
    if (onRemove && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      onRemove(id);
      return;
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
  const axisName = leg ?? "limit";
  // Signed offset from the market price: positive above it, negative below.
  // That makes the value move the same way as the block does on screen, in
  // both scale directions, which is what a vertical slider has to do. The sign
  // comes from the mapping owner, so it is the same one the price chip beside
  // this block was drawn with.
  const signedPercent =
    yPosition === undefined ? 0 : signedOffset(yPosition, direction);
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
        "aria-valuemin": direction === "downside" ? -MAX_OFFSET_PERCENT : 0,
        "aria-valuemax": direction === "downside" ? 0 : MAX_OFFSET_PERCENT,
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
      {onRemove && (
        <button
          type="button"
          // Named for the order rather than for the glyph, and carrying the
          // cell, because two cells can hold orders of the same type and a
          // list of identical "Remove" buttons names none of them.
          aria-label={`Remove ${name} order${
            cellDescription ? `, ${cellDescription}` : ""
          }`}
          className={removeButton}
          onClick={(e) => {
            // The cell listens for a click to place whatever is in hand.
            // Removing a block is not placing one, so this click stops here -
            // without it, deleting a block while carrying a palette order
            // would delete the block AND drop the carried order into its cell.
            e.stopPropagation();
            onRemove(id);
          }}
        >
          <XIcon />
        </button>
      )}
    </div>
  );
};

export default Block;
