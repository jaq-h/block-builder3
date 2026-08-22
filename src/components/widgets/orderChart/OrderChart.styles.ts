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
// The `!` modifiers are load-bearing, exactly as they are in
// `executeButtonVariants`: `src/index.css` still carries the Vite starter's
// bare `button { ... }` rules, and unlayered CSS beats every Tailwind utility
// however specific. Without them these buttons keep the starter's `1em` font
// and `0.6em 1.2em` padding, which is what the timeframes used to render at -
// two rows of that would spend a quarter of a 400px panel on chrome. Moving
// that reset into `@layer base` is the real fix and repaints every button in
// the app, so it stays its own change.
export const chartToggleButton = cva(
  [
    "px-2! py-1! rounded-md! text-[11px]! font-medium! leading-none!",
    "transition-colors duration-150 cursor-pointer whitespace-nowrap",
  ],
  {
    variants: {
      isActive: {
        true: "text-accent-primary! bg-accent-bg-subtle! border-accent-primary! hover:bg-accent-bg-hover!",
        false:
          "text-text-muted! bg-transparent! border-border-neutral! hover:text-text-primary! hover:bg-accent-bg-hover!",
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
 * chart body would jump upward the moment the chart chunk lands.
 */
export const chartHeaderSecondaryRow =
  "flex flex-wrap items-center justify-between gap-3 px-4 py-1.5 pb-2 min-h-[35px]";

export const chartControlGroup = "flex items-center gap-1";

/** The quiet caption in front of a control group. */
export const chartControlGroupLabel =
  "text-[10px] uppercase tracking-wide text-text-dimmed mr-1";
