// Chart panel styles → Tailwind + CVA, on the tokens in `src/styles/theme.ts`.
import { cva } from "class-variance-authority";
import { cn } from "../../../lib/utils";
import { panelTitleBar } from "../../../styles/shared";

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
// `chartHeaderSecondaryRow`'s `min-h` is derived from this floor.
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
 * Row one, this panel's title bar: symbol, price, timeframes. Its geometry is
 * `panelTitleBar`, shared with the assembly and Active Orders panels, so all
 * three titles sit at one height, on one 16px rail and on one centre line.
 */
export const chartHeaderPrimaryRow = cn(panelTitleBar, "justify-between");

/**
 * Row two: indicators and price scale. A toolbar strip rather than a title bar,
 * so it keeps its own tighter geometry and may wrap when narrow.
 *
 * `min-h` is what keeps the lazy fallback the same height as the real header:
 * the fallback has captions where this row has buttons, and without a floor the
 * chart body would jump upward the moment the chart chunk lands. It is derived
 * from what this row holds - `chartToggleButton`'s 24px SC 2.5.8 floor plus this
 * row's own 6px and 8px padding - so raising that floor raises this with it
 * rather than leaving the fallback a few pixels short.
 */
export const chartHeaderSecondaryRow =
  "flex flex-wrap items-center justify-between gap-3 px-4 py-1.5 pb-2 min-h-[38px]";

/**
 * A named group of chart controls. Every one of them scrolls what it cannot
 * show, and this panel is the narrowest in the app: it holds three such groups
 * and no width to spare, so the alternative is not a tighter layout but a
 * control nobody can reach. Measured on the base commit, `1W` sat outside the
 * panel's `overflow-hidden` at 390px, and `EMA 20` did the same at 1024px -
 * clipped, with no scrollbar anywhere to bring either back.
 *
 * `min-w-0` is what lets a group shrink inside its row: a flex item's automatic
 * minimum size is its content, which is exactly what pushed these past the
 * edge. `overflow-x-auto` then makes the overflow reachable rather than cut
 * off. The buttons inside are `shrink-0` (`chartToggleButton`), so they keep
 * their size and their 24px target floor instead of being squeezed under it.
 *
 * `p-1 -m-1` is what pays for that scroller, and it is not optional. A scroll
 * container clips on both axes - `overflow-x: auto` computes `overflow-y` to
 * `auto` too - and the group is exactly as tall as its 24px buttons, while the
 * focus ring `src/index.css` gives every button is `outline: 2px solid` at
 * `outline-offset: 2px`. An outline is not part of the scrollable overflow
 * region, so without this the ring is sliced flush with the button, top and
 * bottom on all twelve chart controls and at the ends of each strip as well.
 * The 4px of padding puts the whole ring inside the scrollport; the equal
 * negative margin takes it back off the margin box, so the row's geometry -
 * and `chartHeaderSecondaryRow`'s derived `min-h` - is unchanged.
 *
 * A new control group in this panel takes this rather than a bare flex row.
 */
export const chartControlGroup =
  "flex items-center gap-1 min-w-0 overflow-x-auto p-1 -m-1";

/**
 * The symbol and price at the head of the title bar, and what the group's floor
 * is made of. Which child yields width first is the whole decision here, and
 * three arrangements were measured at 390px before this one:
 *
 * - Nothing shrinks: the timeframe strip is pushed past the panel's
 *   `overflow-hidden` and `1W` cannot be reached at all.
 * - Everything shrinks: the group collapses under its own nowrap content and
 *   the price is drawn over the first timeframe button.
 * - The price shrinks: it truncates to "$8...", which is not a price.
 *
 * So the symbol and the price are `shrink-0` and the group's floor is the two
 * of them; only the offline notice gives up width, and it carries the same
 * sentence in a `title`. Everything past that floor goes to the strip, which
 * scrolls what it cannot show. Numbers stay whole and controls stay reachable.
 *
 * There is deliberately no `min-w-0` here. A flex item's automatic minimum size
 * is its content, and that is the mechanism doing the work: the group stops
 * shrinking at the symbol and the price, while the truncating notice
 * contributes nothing to that floor. `min-w-0` would switch the mechanism off
 * and put the price back on top of the first timeframe button.
 */
export const chartIdentityGroup = "flex items-center gap-3";

/** The symbol and the price: whole or not at all. */
export const chartIdentityFact = "shrink-0 whitespace-nowrap";

/** The offline notice: the one thing in the group that gives up width. */
export const chartIdentityNotice = "truncate";

/**
 * The quiet caption in front of a control group. `shrink-0` and nowrap: it
 * scrolls out of the group with the controls rather than reflowing them, which
 * is the one thing that would push a button under its target floor.
 */
export const chartControlGroupLabel =
  "shrink-0 whitespace-nowrap text-[10px] uppercase tracking-wide text-text-dimmed mr-1";
