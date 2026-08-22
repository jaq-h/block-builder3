// Chart panel styles → Tailwind + CVA, on the tokens in `src/styles/theme.ts`.
import { cva } from "class-variance-authority";

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

/** The header block, both rows. One bottom border, so it reads as one bar. */
export const chartHeader =
  "border-b border-border-neutral bg-bg-overlay shrink-0";

export const chartHeaderRow = "flex items-center justify-between gap-3 px-4";

/** Row one: symbol, price, timeframes. */
export const chartHeaderPrimaryRow = `${chartHeaderRow} py-2`;

/** Row two: indicators and price scale. Tighter, and it may wrap when narrow. */
// `min-h` is what keeps the lazy fallback the same height as the real header:
// the fallback has captions where this row has buttons, and without a floor the
// chart body would jump upward the moment the chart chunk lands.
export const chartHeaderSecondaryRow = `${chartHeaderRow} flex-wrap py-1.5 pb-2 min-h-[35px]`;

export const chartControlGroup = "flex items-center gap-1";

/** The quiet caption in front of a control group. */
export const chartControlGroupLabel =
  "text-[10px] uppercase tracking-wide text-text-dimmed mr-1";
