// Strategy Assembly styled components → Tailwind + CVA
import { cva } from "class-variance-authority";
import type { CSSProperties } from "react";
import { cn } from "../../../lib/utils";
import { panelHeaderBar } from "../../../styles/shared";

// =============================================================================
// CONTAINER & LAYOUT
// =============================================================================

export const container = "h-full flex flex-col max-w-[700px] bg-bg-primary";

// The scrolling viewport of the panel: it takes whatever height is left after
// the pattern selector and the action bar, and scrolls inside that. It used to
// also carry a `max-h-[763px]`, a magic number from a fixed-height layout that
// then pushed the action bar off the bottom of shorter viewports.
//
// It is deliberately a plain block, not a flex row. As a flex row its own
// definite height became the flex line's cross size, which pinned the columns
// to it and left them silently clipping their last grid row. The flex row lives
// one level in, in `contentRow`, where its height is free to grow.
export const contentWrapper = "flex-1 min-h-0 overflow-auto py-1.5";

// At least fills the viewport above, and grows past it when the grid is taller
// than the space available - which is what turns the clipping into a scroll.
export const contentRow = "flex min-h-full gap-1.5";

export const columnsWrapper = "flex flex-1 gap-1.5";

// =============================================================================
// HEADER
// =============================================================================

// export const header =
//   "p-4 text-center border-b border-border-neutral bg-bg-overlay";

// export const headerTextClass = "m-0 text-lg text-text-primary";

// =============================================================================
// PATTERN SELECTOR
// =============================================================================

// The assembly panel's own panel header. Its geometry - height, rail, border,
// background - comes from `panelHeaderBar` so that it and the chart panel's
// header stay one continuous rule across the two columns; only what this bar
// carries is written here.
export const patternSelectorRow = cn(panelHeaderBar, "gap-2");

export const patternButton = cva(
  "flex flex-col items-center px-4 py-2 rounded-lg cursor-pointer transition-all duration-200 min-w-[120px] border-2",
  {
    variants: {
      isActive: {
        true: "border-accent-outline bg-accent-bg-subtle text-text-primary hover:bg-accent-bg-hover hover:border-accent-secondary",
        false:
          "border-border-neutral bg-neutral-bg text-text-tertiary hover:bg-neutral-bg-hover hover:border-accent-primary",
      },
    },
  },
);

// The tick and the label sit on one line, with the tick's slot present on both
// buttons so choosing a pattern does not nudge its label sideways.
export const patternLabelRow = "flex items-center gap-1";

// A fixed slot rather than a conditionally rendered icon: `w-3` is the tick's
// 11px plus its stroke, and reserving it keeps both labels on the same rail.
export const patternMarker =
  "inline-flex w-3 shrink-0 items-center justify-center [&>svg]:stroke-current";

export const patternLabel = "text-xs font-semibold";

export const patternDescription = "text-[9px] opacity-70 mt-0.5";

// =============================================================================
// COLUMNS
// =============================================================================

export const column =
  "flex flex-col min-w-[220px] w-full bg-bg-column border border-border-dimmed rounded-lg overflow-hidden p-0";

export function getColumnHeaderProps(tint?: string) {
  const className = "p-2 text-center border-b border-border-dimmed";
  const style: CSSProperties = {
    backgroundColor: tint || "rgba(104, 107, 130, 0.08)",
  };
  return { className, style };
}

export const columnHeaderText = "text-sm font-semibold text-text-secondary";

// =============================================================================
// UTILITY ROW
// =============================================================================

// Grid actions anchored left, the primary action anchored right, rather than one
// centred group. Both ends hold their position for the whole session, so adding
// a block no longer slides the buttons sideways as Execute Trade appears.
// `shrink-0` pins the bar to the bottom of the panel instead of letting the
// scrolling grid above squeeze it out of the viewport.
export const utilityRow =
  "shrink-0 flex items-stretch justify-between gap-4 p-4 border-t border-border-neutral bg-bg-overlay";

export const utilityActions = "flex items-stretch gap-4";

// Present whether or not it holds a button, so the row's height never changes.
export const utilityPrimaryAction = "flex items-stretch";

export const utilityButton =
  "flex items-center justify-center gap-2 px-4 py-2 border border-border-neutral rounded-md bg-neutral-bg text-text-secondary text-sm cursor-pointer transition-[background-color,border-color] duration-200 [&>svg]:stroke-text-secondary [&>svg]:opacity-80 hover:bg-accent-bg-hover-light hover:border-accent-primary hover:text-text-primary hover:[&>svg]:stroke-text-primary hover:[&>svg]:opacity-100";

// =============================================================================
// DEBUG PANEL
// =============================================================================

export const debugPanel =
  "p-2 text-[10px] text-text-muted bg-bg-overlay border-t border-border-dimmed";

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
