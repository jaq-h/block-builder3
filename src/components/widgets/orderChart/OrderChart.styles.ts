// Chart panel styles → Tailwind + CVA, on the tokens in `src/styles/theme.ts`.
import { cva } from "class-variance-authority";
import { cn } from "../../../lib/utils";
import { wrappingPanelTitleBar } from "../../../styles/shared";

// =============================================================================
// TOOLBAR BUTTON
// =============================================================================
//
// One variant for every toggle in the chart header - the timeframes, the price
// scale and the indicators - so a control added to either row cannot drift out
// of the toolbar's look. Each one is a real `<button>` with `aria-pressed`, so
// Tab reaches it, Enter and Space operate it, and a screen reader reads its
// pressed state back without any live region of its own.
//
// Plain utilities, no `!` anywhere. They each used to carry one, because the
// bare `button { ... }` reset in `src/index.css` sat outside a cascade layer and
// beat every Tailwind utility however specific - without them these buttons kept
// the starter's `1em` font and `0.6em 1.2em` padding, and two rows of that spend
// a quarter of a 400px panel on chrome. The reset is inside `@layer base` now,
// so these win on their own; see `AGENTS.md` under "Layout and the CSS cascade".
//
// `min-h-6` is the WCAG 2.2 SC 2.5.8 minimum target size, 24 CSS px, and it is a
// floor rather than a height so a control carrying a taller label still grows.
// Padding alone does not reach it: an 11px label with `leading-none` inside
// `py-1` and a 1px border measures 21px tall, which is what every control in
// both toolbar rows rendered at before this change. `min-w-6` is the same floor
// on the other axis - no label here is narrow enough to need it today, and it is
// written down so the next abbreviation added cannot quietly breach it.
export const chartToggleButton = cva(
  [
    // `shrink-0` so the 24px floor holds inside a flex row that runs out of
    // width: a flex item's default is to shrink, and a control squeezed under
    // the floor breaches SC 2.5.8 exactly as a control drawn under it does.
    "inline-flex shrink-0 items-center justify-center min-h-6 min-w-6",
    "px-2 py-1 rounded-md text-[11px] font-medium leading-none",
    "transition-colors duration-150 cursor-pointer whitespace-nowrap",
  ],
  {
    variants: {
      isActive: {
        true: "text-accent-primary bg-accent-bg-subtle border-accent-primary hover:bg-accent-bg-hover",
        false:
          "text-text-muted bg-transparent border-border-neutral hover:text-text-primary hover:bg-accent-bg-hover",
      },
    },
    defaultVariants: { isActive: false },
  },
);

// =============================================================================
// TOOLBAR LAYOUT
// =============================================================================

/**
 * The header block, both rows. It owns the bottom border and the background so
 * the two rows read as one bar, which is why neither row draws either itself.
 * This panel's header block is therefore taller than the other two panels' -
 * it carries a toolbar under its title bar - and it is only the title bar that
 * lines up with them.
 */
export const chartHeader =
  "border-b border-border-neutral bg-bg-overlay shrink-0";

/**
 * Row one, this panel's title bar: the pair, its price, any warning about that
 * price, and the timeframes.
 *
 * `wrappingPanelTitleBar` is the shared rail with its fixed height relaxed to a
 * floor and wrapping allowed - the app's one documented exception to
 * `panelTitleBar`, and that constant's docblock carries why it is safe for the
 * other two panels. It is what keeps the trailing timeframes inside the panel
 * instead of outside its `overflow-hidden`.
 */
export const chartHeaderPrimaryRow = cn(
  wrappingPanelTitleBar,
  "justify-between",
);

/**
 * Row two: indicators and price scale. A toolbar strip rather than a title bar,
 * so it keeps its own tighter geometry, and it wraps for the same reason the
 * row above does.
 *
 * It used to carry a `min-h-[38px]` floor, to hold the lazy placeholder's
 * header at the same height as the real one. That floor is gone because the job
 * is: both are now the same component (`ChartHeader`), so they measure equal by
 * construction at every width. A constant could not have done it anyway - what
 * a wrapped row measures depends on the panel's width, and at a 1024px viewport
 * the real header stood 139px against the placeholder's 103px while the floor
 * was in place and agreeing with itself, a 36px jump - the same one it made at
 * 390px.
 */
export const chartHeaderSecondaryRow =
  "flex flex-wrap items-center justify-between gap-3 px-4 py-1.5 pb-2";

/**
 * One group of related toggles: the timeframes, the indicators, the scale.
 *
 * `flex-wrap` is what makes a group too wide for its row fold onto a second
 * line of its own rather than overflow. Both halves are needed and they act at
 * different moments: the row wrapping moves a *whole group* to its own line,
 * and this moves *buttons within a group* once the group is alone on a line and
 * still too wide - which is the case at a 1024px viewport, where the chart panel
 * is at its 300px floor and the Indicators group needs 300.41px of a 268px row.
 * Before this, `EMA 20` was simply painted 16.41px outside the panel.
 *
 * It is deliberately **not** a scroll container. `overflow-x-auto` here was
 * tried and reverted: the group's own height then depends on the platform's
 * scrollbar - about 15px taller wherever bars take space rather than overlay,
 * which is most of Windows and Linux and none of this project's development
 * machines - and it puts the buttons' focus rings inside a clipping box.
 * `AGENTS.md` records that as a standing rule: the app's chrome wraps, it never
 * scrolls.
 */
export const chartControlGroup = "flex flex-wrap items-center gap-1";

/** The quiet caption in front of a control group. */
export const chartControlGroupLabel =
  "text-[10px] uppercase tracking-wide text-text-dimmed mr-1";
