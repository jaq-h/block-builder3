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

// The grid pane: the scrolling placement surface above, and the cell-locked
// note below it. A flex column so the note is `shrink-0` and the scroller keeps
// a bounded height - putting the note *inside* `contentWrapper` would have made
// it scroll away, and `contentRow`'s `min-h-full` would have overflowed the
// panel by the note's own height the moment it appeared.
export const gridPane = "flex-1 min-h-0 flex flex-col";

// A placed order was asked to change cells, and it does not (decision D9). It
// is ordinary visible text rather than a live region: `LiveAnnouncer` is the
// grid's one voice, and a second would cut it off. Same palette as the primary
// order warning inside a cell, because it is the same kind of message.
// Flush with the grid pane's own edges, so it lines up with the palette column
// on the left and the Exit column on the right rather than floating 6px inside
// them. The pane carries no horizontal padding, so no margin is the alignment.
export const cellLockedNote =
  "shrink-0 mt-1.5 px-3 py-2 rounded-lg border border-dashed border-accent-outline bg-accent-bg-subtle-light text-[11px] leading-snug text-accent-primary";

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
// background - comes from `panelHeaderBar`, so its title sits at the same
// height and on the same rail as the chart panel's title bar beside it. It is
// the title bars that line up, not the header blocks: the chart's carries a
// toolbar row under its title and draws its own rule around both. Only what
// this bar carries is written here; `src/styles/shared.ts` owns the geometry.
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

// The tick and the label sit on one line: a slot, the label, and a slot equal to
// the first. The leading slot is present on both buttons so choosing a pattern
// does not nudge its label sideways, and the trailing one balances it so the
// label stays on the same centre line as the description beneath it.
export const patternLabelRow = "flex items-center gap-1";

// A fixed slot rather than a conditionally rendered icon: `w-3` is the tick's
// 11px plus its stroke, and reserving it keeps both labels on the same rail.
// The row uses it twice, once holding the tick and once empty.
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
