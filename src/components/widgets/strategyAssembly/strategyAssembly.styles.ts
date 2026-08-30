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

// The grid pane's lanes - the order palette, then the Entry and Exit columns -
// side by side while the panel is wide enough to draw all three, with the
// palette moving above the columns when it is not.
//
// At least fills the viewport above, and grows past it when the grid is taller
// than the space available - which is what turns the clipping into a scroll.
// That scroll is VERTICAL only, and deliberately so.
//
// **The row has a min-content width, and it is derived rather than chosen.**
// It is 542px: the palette's 90px min-width (`ProviderColumn`'s
// `sm:min-w-22.5`) plus the `min-w-[220px]` each grid column carries to keep
// its price chip inside the cell, twice, plus two 6px gaps. That floor is owned
// by `sm:min-w-22.5` and NOT by the palette's `sm:w-27.5`: 110px is what the
// palette prefers, and it gives up 20px of it before the row stops shrinking.
// Below `lg` the panel is the viewport less the shell's 32px of padding, so the
// row stops fitting at a 574px viewport, and it used to be drawn at that width
// anyway. Measured in Chrome at 320, 360 and 390 the lanes stood at that
// collapsed 542px - the palette squeezed to 90px - and the Exit column sat at
// x 347..549 in every one of them, entirely outside the viewport, with the
// panel's own `overflow-auto` the only way to reach it and no visible scrollbar
// to say so. A conditional strategy needs both an Entry and an Exit leg, so the
// app's core task could not be completed on a phone at all.
//
// **Only the palette moves.** The two columns stay beside each other at every
// width and `columnsWrapper` shows one of them at a time; this direction change
// is what gives that viewport the panel's whole width to do it in. That matters
// at the narrowest end and nowhere else: with the palette still a lane, the
// viewport would be the panel less the palette's 90px floor and a 6px gap -
// 192 / 232 / 262 / 286 at 320 / 360 / 390 / 414 - and 192px is under the 220px
// a column needs to keep its own price chip. As a band above, the column gets
// 288 / 328 / 358 / 382, clear of that floor by 68px at the worst of them.
//
// `sm` is where the palette returns to the lane, and it is a floor with room
// rather than a fitted number: at a 640px viewport the panel measures 608px
// against that 542px min-content row, and measured there the palette sits at
// its preferred 110px with each column at 243px, so nothing is at its floor.
// 640 is also the first standard breakpoint above the 574px the row actually
// fails at. Above `lg` the panel is never narrower than 660px (measured at
// 1024, where the shell's `minmax(0,700px)` track is squeezed hardest), so the
// desktop layout never reaches the banded form.
export const contentRow = "flex flex-col sm:flex-row min-h-full gap-1.5";

// The Entry and Exit columns, side by side at EVERY width, and the box that
// decides how many of them the panel shows at once.
//
// Above `sm` it is the row it has always been and both columns are drawn in it.
// Below `sm` two of them will not fit - 446px of column against a 288px panel
// at 320 - so this becomes a one-column viewport over the same row: the columns
// are each the viewport's own width (`pagedColumn` below), the row overflows it
// to the right, and `ColumnPager` pages between them by setting `scrollLeft`.
//
// **`hidden` rather than `auto`, and that is the whole difference between this
// and the horizontal scroller AGENTS.md rejects.** A hidden overflow is a
// scroll container the *user* cannot drive: it draws no scrollbar, so it cannot
// grow by a classic scrollbar's gutter on Windows, and it cannot be scrolled to
// a position the pager does not know about. The pager is the one thing that
// moves it, so which column is on screen has exactly one owner. It is also what
// keeps the off-screen column from making the panel itself scroll sideways.
//
// **It is `overflow-hidden` on BOTH axes, and naming only the one that pages
// would be a box that does not do what the paragraph above claims.** Setting
// one axis to something other than `visible` makes the other's `visible`
// compute to `auto`, so `overflow-x-hidden` alone left this a real vertical
// scrollport. Nothing overflows it vertically today - below `sm` it is an
// auto-height flex item, so its height is its tallest column's - but the moment
// anything gives it a bounded height there, a bar the user CAN drive appears
// inside it and its gutter eats width from a paged column already sized against
// a 220px floor. A guard reading the class list would stay green through that,
// which is the second reason to say it in the constant rather than rely on one.
//
// It stays a plain row from `sm`, where both columns fit and there is nothing
// to page: `sm:overflow-visible` puts the scroll container away entirely, so a
// focus ring on a block at a column's edge is drawn rather than clipped.
export const columnsWrapper =
  "flex flex-row overflow-hidden sm:overflow-visible sm:flex-1 gap-1.5";

// =============================================================================
// HEADER
// =============================================================================

// export const header =
//   "p-4 text-center border-b border-border-neutral bg-bg-overlay";

// export const headerTextClass = "m-0 text-lg text-text-primary";

// =============================================================================
// THE SELECTED-STATE TICK
// =============================================================================

// The slot a control draws its selected-state tick in: `w-3` is the 11px glyph
// plus its stroke, held whether or not the tick is there so choosing one of a
// pair does not nudge either label sideways.
//
// One constant rather than one per control, because the reserved width and the
// glyph are ONE fact and two controls draw it - the pattern buttons and the
// column pager. `BLOCK_TILE_SHAPE` in `src/components/blocks/blockTile.ts`
// records what the alternative costs: a hand-copied class list is how two
// drawings of one fact come to disagree without either file saying so.
export const selectedTickSlot =
  "inline-flex w-3 shrink-0 items-center justify-center [&>svg]:stroke-current";

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

// A fixed slot rather than a conditionally rendered icon, so both labels stay
// on the same rail. The row uses it twice, once holding the tick and once
// empty.
export const patternMarker = selectedTickSlot;

export const patternLabel = "text-xs font-semibold";

export const patternDescription = "text-[9px] opacity-70 mt-0.5";

// =============================================================================
// COLUMNS
// =============================================================================

// `min-w-[220px]` is the width at which a cell's price chip still fits inside
// it. The chip is laid out at `calc(50% + 25px)` from the axis centre and is
// about 66px wide at a BTC price, against 8px of cell padding and 8px of cell
// margin either side: measured at 390, a 202px cell put `$58,322.4` at
// x 247..305.5 with the cell edge at 323, so 17.5px of slack. Narrower and the
// price the user is about to trade at is clipped, which is why the paged form
// above gives a column the panel's whole width rather than squeezing two in.
// Width is deliberately NOT here: `pagedColumn` owns it in both forms of the
// layout, because below `sm` it is a proportion of the paged viewport and from
// `sm` it is a share of the row. Two width utilities on one element resolve by
// stylesheet order rather than by the order they are written in, so one owner
// is the only way to say which wins.
export const column =
  "flex flex-col min-w-[220px] bg-bg-column border border-border-dimmed rounded-lg overflow-hidden p-0";

// What a column is inside the paged viewport above.
//
// Not the viewport's whole width any more: the captain asked for the off-page
// column to show through by 20%, as a cue that there is more to view. So a
// column takes the width that leaves exactly that much of its sibling on
// screen. With `W` the viewport, `C` the column and the row's 6px gap between
// them, `C + 6 + 0.2C = W`, hence `C = (W - 6) / 1.2` - which is the calc
// below rather than a percentage, because the gap is a length and the peek is
// a proportion, and folding one into the other is how the two would drift.
//
// It still refuses to shrink, so the pair overflows rather than squeezing, and
// from `sm` it gives all of this up and shares the row with its sibling as it
// always did.
export const pagedColumn =
  "w-[calc((100%-0.375rem)/1.2)] shrink-0 sm:w-full sm:shrink";

// The column the pager is not showing.
//
// It is DRAWN, and drawn deliberately: 20% of it shows past the viewport's
// edge as wayfinding (see `pagedColumn`). **Visible does not mean droppable.**
// A peeking cell steals drops - measured at a 390px viewport, a release at the
// far right edge put 30px of the dragged tile over an off-page Exit cell
// against 4px over the Entry cell it was drawn on, so greatest-overlap placed
// the order into a column that was not on screen. That measurement is the
// reason this class exists at all.
//
// `pointer-events: none` is what withholds it, and it is doing three jobs at
// once. It takes the peeking column out of hit testing, so a press on the
// sliver does nothing and no release lands in it - though `dropTarget.ts` keeps
// a withheld cell as withheld rather than as absent, so a release over one is
// REFUSED rather than read as a release clear of the grid, which the free drag
// removes a block on. It is INHERITED, so one computed read per cell answers
// it for the whole column - which is how `cellBoxesFromDom` excludes those
// cells without knowing anything about how the panel pages, and how
// `GridArea`'s tab-order rule finds the column that is off page. And it is
// written by a breakpoint, so it says "off page" only where paging exists;
// from `sm` both columns are drawn and it resolves to nothing.
//
// **Inheritance alone does not do the first of those jobs, and that is why the
// rule is written twice.** An inherited value is what an element gets when
// nothing declares one for it, and one thing inside a column does declare one:
// `getBlockPositionerProps` draws every block on a price axis inside an
// absolutely positioned strip that is itself `pointer-events-none`, with
// `*:pointer-events-auto` opting the tile back in so the strip does not
// swallow presses meant for the cell under it. That opt-in beat the column, so
// a block drawn in the peeking sliver stayed tappable and draggable: a tap
// announced the `staysInCell` refusal for an order the user can barely see, and
// a vertical drag re-priced it, with no highlight and the pager still reading
// `aria-pressed="true"` on the column the block is not in. Derived from the
// constants rather than measured, a dual-axis cell's leading leg leaves about
// 14px of its 40px tile drawn and live inside the sliver at 320 and about 16px
// at 414. **Only DIRECT interaction with a block ever leaked**: a cell declares
// no `pointer-events` of its own, so it does inherit the refusal, and
// `cellBoxesFromDom` reads the cell - drop resolution was never wrong and this
// does not change it.
//
// `[&:is(&)_*]` answers it over the whole subtree, and it wins by SPECIFICITY
// rather than by stylesheet order. `:is(&)` repeats this class in the compound,
// so the rule lands at (0,2,0) against the positioner's (0,1,0) `:is(& > *)`;
// a plain `[&_*]` would tie at (0,1,0) and be settled by whichever of the two
// utilities Tailwind happened to emit second, which is the same "two things
// that merely agree" the width comment above refuses.
//
// It is written `max-sm:` and has deliberately NO `sm:` counterpart. Reversing
// a subtree rule means declaring `auto` on every descendant, and at (0,2,0)
// that would beat the positioner's own `pointer-events-none` and turn a strip
// spanning each cell into a hit target at every width above `sm`. So the rule
// does not exist where both columns are drawn, which is also where nothing
// needs withholding.
//
// What it deliberately does NOT do is hide the column, and that is the whole
// difference from the `visibility: hidden` this replaced. A hidden element
// cannot hold focus, so the browser dropped focus to `<body>` whenever the
// pager hid the column the focused element lived in - the defect four rounds
// of focus hand-offs failed to close. Nothing here becomes unfocusable, so
// that defect is gone rather than accepted. Tab is kept out of the off-page
// column by `tabindex`, in `GridArea`, which does not blur what it applies to.
export const offPageColumn =
  "pointer-events-none sm:pointer-events-auto max-sm:[&:is(&)_*]:pointer-events-none";

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
//
// It wraps, for the same reason `contentRow` above does and by the same rule.
// Clear All and Reverse come to 219px beside a 203px Execute Trade, and the bar
// has the panel's width less 32px of padding to draw them in - 326px at a 390px
// viewport. Measured there before this wrapped, Execute Trade stood at
// x 267.5..470.8 against a 390px viewport and the panel's own `overflow-hidden`
// clipped the last 80.8px of it with nothing to scroll: the button that submits
// the strategy could not be pressed on a phone. Wrapped, the actions take the
// first line and Execute Trade the second, and both fit at 320. On a panel wide
// enough for one line nothing moves - `flex-wrap` costs a single-line row
// nothing.
export const utilityRow =
  "shrink-0 flex flex-wrap items-stretch justify-between gap-4 p-4 border-t border-border-neutral bg-bg-overlay";

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

// =============================================================================
// COLUMN PAGER
// =============================================================================

// The control that moves the user to the other column, and the panel's answer
// to the width that cannot hold both. `sm:hidden` rather than a wrapper, so
// above `sm` it is not a flex item of `contentRow` at all and the row is the
// two-lane row it has always been, to the pixel.
//
// **`px-2` is what keeps the buttons' focus rings inside the pane, and it is
// the reason this bar is not flush with the lanes above and below it.** The
// grid pane carries no horizontal padding, so a lane is flush with the panel's
// content edge - and the panel clips there. A lane's own focusable children are
// inset within it (a palette tile by the palette's padding, a block by its
// cell's margin), so nothing had ever been focusable at that edge before; a
// `flex-1` button in a flush row is. Measured at 390 with the Exit button
// focused, its box ended at x 374 against a clip at 374 and the ring's whole
// right segment - `outline: 2px` at `outline-offset: 2px`, so x 376..378 - was
// drawn nowhere, leaving the ring an open bracket. Every other control in this
// panel sits inside a padded bar for the same reason; 8px against the 4px a
// ring needs is that, not an alignment.
export const columnPagerRow =
  "sm:hidden shrink-0 flex items-stretch gap-1.5 px-2";

// One button per column, sharing the width. Its selected state is drawn the way
// `PatternSelector` draws one - an accent border, a tick in a slot reserved on
// both buttons, and `aria-pressed` - because a control may never say which of
// two things is chosen in colour alone.
export const columnPagerButton = cva(
  "flex-1 flex items-center justify-center gap-1 min-h-9 px-3 py-1.5 rounded-lg border-2 text-xs font-semibold cursor-pointer transition-[background-color,border-color] duration-200",
  {
    variants: {
      isActive: {
        true: "border-accent-outline bg-accent-bg-subtle text-text-primary",
        false:
          "border-border-neutral bg-neutral-bg text-text-tertiary hover:bg-neutral-bg-hover hover:border-accent-primary",
      },
    },
  },
);

// The tick's slot, present on both buttons so choosing a column does not nudge
// its label sideways. The same slot the pattern buttons above draw their tick
// in, from its one owner.
export const columnPagerMarker = selectedTickSlot;
