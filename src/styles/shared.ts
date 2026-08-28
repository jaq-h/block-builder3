// Shared style constants and CVA variants for Strategy Assembly widget
import { cva } from "class-variance-authority";
import { cn } from "../lib/utils";

// =============================================================================
// LAYOUT CLASSES
// =============================================================================

export const flexColumn = "flex flex-col";
export const flexRow = "flex flex-row";
export const flexCenter = "flex items-center justify-center";
export const flexSpaceBetween = "flex justify-between items-center";

// =============================================================================
// HEADER
// =============================================================================

export const baseHeader =
  "p-2 text-center border-b border-border-neutral bg-bg-header";

export const headerText = cva("font-semibold text-text-secondary", {
  variants: {
    size: {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-lg",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

// =============================================================================
// PANEL HEADER BAR
// =============================================================================

/**
 * The geometry every desktop panel's title bar is drawn to, written once
 * because two bars that merely agreed is how they came to disagree: measured on
 * the base commit the assembly panel's bar stood 77.69px tall against the chart
 * panel's 66.19px, their contents sat 194.14px apart on the horizontal rail and
 * 2px apart vertically, so what should read as one rule drawn across the app
 * had a step in it. A new panel gets `panelTitleBar` below rather than its own
 * copy of the declarations.
 *
 * The rail is everything the bars share except the height: `px-4` puts every
 * bar's content on the same 16px rail from its own panel's edge, `items-center`
 * on one centre line, `gap-3` between its pieces, and `shrink-0` so a full
 * panel cannot squeeze the bar itself. The height is the one thing the two
 * users of it disagree about, so each states its own.
 */
const panelTitleBarRail = "shrink-0 flex items-center gap-3 px-4";

/**
 * The title bar every desktop panel is drawn to, and the constant a new panel
 * takes.
 *
 * The height is fixed rather than left to padding so that what a bar happens to
 * carry cannot change where its neighbour's bottom edge lands. `h-16` clears
 * the tallest control any of the bars holds - the two-line pattern button,
 * 51.5px - with room to breathe.
 *
 * Geometry only: a panel whose header is a single bar wants `panelHeaderBar`
 * below, which adds the rule and the background. The chart panel draws those
 * itself, around a title bar and the toolbar row beneath it, so it takes this.
 */
export const panelTitleBar = cn(panelTitleBarRail, "h-16");

/**
 * The one deliberate exception to the fixed height above, and the only bar
 * allowed to take it: the chart panel's, which is the only title bar carrying
 * controls rather than a title alone.
 *
 * `h-16` becomes a floor and the row may wrap, so a strip that does not fit
 * beside the pair drops onto a second line **inside the bar** instead of being
 * drawn outside the panel's `overflow-hidden` and going out of reach. That was
 * the state on `main`: seven timeframe buttons, and at every viewport below
 * 480px and in the 1024-1100px band where the chart panel sits at its 300px
 * floor, the trailing ones were painted outside the panel with nothing to
 * scroll them back. See `AGENTS.md`, "Layout and the CSS cascade".
 *
 * **Why this is safe for the other two panels, measured rather than argued.**
 * The constant exists so the three title bars share one height, one rail and
 * one centre line - and they are only ever side by side above `lg`, since below
 * it the layout is tabbed and no two are on screen at once. Measured across
 * 320-1920px with the offline warning showing, this bar is **exactly 64px at
 * every width from 360px up**, wrapped or not: two lines come to 20px of text
 * plus a 12px row gap plus a 24px control, which is 56px and still inside the
 * floor. It exceeds 64px only at 320px, where the pair, the price and the
 * warning cannot share one line either - and there the panels are tabbed. The
 * assembly and Active Orders bars keep `panelTitleBar` unchanged.
 *
 * `content-center` keeps the wrapped lines together on the bar's centre line
 * rather than letting `align-content: stretch` push them to its two edges.
 */
export const wrappingPanelTitleBar = cn(
  panelTitleBarRail,
  "min-h-16 flex-wrap content-center",
);

/**
 * A panel header that is a single bar: the shared title-bar geometry plus the
 * rule and the background that close it off. The assembly panel and the Active
 * Orders panel are this shape. The chart panel is not - it carries a toolbar
 * row below its title bar, so its header block is taller than these two and it
 * owns the border and the background at the block rather than at the row.
 */
export const panelHeaderBar = cn(
  panelTitleBar,
  "border-b border-border-neutral bg-bg-overlay",
);

/** The title a panel header bar names itself with, at one size for all of them. */
export const panelHeaderTitle = "text-sm font-semibold text-text-primary";

// =============================================================================
// BADGE
// =============================================================================

export type BadgeType = "primary" | "conditional" | "accent";

export const badge = cva(
  "px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wide border",
  {
    variants: {
      type: {
        primary: "bg-entry-badge text-entry-text border-entry-badge-border",
        conditional:
          "bg-conditional-badge text-conditional-text border-conditional-badge-border",
        accent:
          "bg-accent-bg-subtle text-accent-secondary border-accent-primary",
      },
    },
    defaultVariants: {
      type: "accent",
    },
  },
);

// =============================================================================
// BUTTONS
// =============================================================================

export const baseButton =
  "flex items-center justify-center gap-2 px-4 py-2 border border-border-dimmed rounded-md bg-bg-header text-text-secondary text-sm cursor-pointer transition-all duration-200 hover:bg-accent-bg-subtle hover:border-accent-primary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed";

export const iconButton = cn(baseButton, "p-2 min-w-0");

// =============================================================================
// PLACEHOLDER
// =============================================================================

export const emptyPlaceholder =
  "flex-1 flex items-center justify-center text-text-placeholder text-xs";

// =============================================================================
// ALERT/WARNING
// =============================================================================

export const warningAlert =
  "flex flex-col items-center justify-center p-3 m-2 border-2 border-dashed border-accent-primary rounded-lg bg-accent-bg-subtle text-center";

export const warningIcon = "text-2xl mb-2";

export const warningText = "text-[11px] text-accent-primary font-medium";

export const warningSubtext = "text-[9px] text-accent-bg-hover mt-1";

// =============================================================================
// COMMON PATTERNS
// =============================================================================

export function absolutePositioned(pos?: {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}) {
  // For dynamic absolute positioning, return className + style
  const style: Record<string, string> = {};
  if (pos?.top) style.top = pos.top;
  if (pos?.right) style.right = pos.right;
  if (pos?.bottom) style.bottom = pos.bottom;
  if (pos?.left) style.left = pos.left;
  return { className: "absolute", style };
}

export const scrollContainer = "overflow-auto flex-1";

// =============================================================================
// LABEL
// =============================================================================

export const label = cva("text-text-muted pointer-events-none", {
  variants: {
    size: {
      xs: "text-[8px]",
      sm: "text-[9px]",
      md: "text-[10px]",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export const orderTypeLabel =
  "text-[11px] font-semibold text-text-secondary capitalize";

// =============================================================================
// DIVIDERS
// =============================================================================

export const horizontalDivider = "w-full h-px bg-border-neutral";

export const verticalDivider = "w-px h-full bg-border-neutral";

// =============================================================================
// CARD/PANEL
// =============================================================================

export const panel =
  "bg-bg-column border border-border-dimmed rounded-lg overflow-hidden";

export const panelHeader = cn(baseHeader, "bg-bg-header-hover");

export const panelContent = "p-2";

// =============================================================================
// DEBUG
// =============================================================================

export const debugPanel =
  "p-2 text-[10px] text-text-muted bg-bg-overlay border-t border-border-dimmed";
