// App-level styles → Tailwind + CVA
import { cva } from "class-variance-authority";
import { cn } from "./lib/utils";

// =============================================================================
// CVA VARIANTS
// =============================================================================

export const navLinkVariants = cva(
  [
    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
    "no-underline transition-all duration-200 border",
  ],
  {
    variants: {
      isActive: {
        true: [
          "text-text-primary bg-accent-bg-subtle border-accent-primary",
          "hover:bg-accent-bg-hover hover:text-text-primary",
        ],
        false: [
          "text-text-tertiary bg-transparent border-transparent",
          "hover:bg-neutral-bg-hover hover:text-text-primary",
        ],
      },
    },
    defaultVariants: {
      isActive: false,
    },
  },
);

// Plain utilities, no `!` anywhere. They used to carry one each, because the
// bare `button { ... }` reset in `src/index.css` sat outside a cascade layer and
// so beat every Tailwind utility however specific - without the `!` the app's
// primary action rendered in the generic grey skin instead of green. That reset
// is inside `@layer base` now, so these win on their own; see `AGENTS.md` under
// "Layout and the CSS cascade".
export const executeButtonVariants = cva(
  [
    "px-5 py-2.5 text-white border-none rounded text-sm font-medium",
    // The label carries a live order count, so it must not wrap or re-flow the
    // action bar as that count changes.
    "whitespace-nowrap transition-colors duration-200 flex items-center gap-2",
    "hover:enabled:bg-status-green-hover disabled:opacity-70",
  ],
  {
    variants: {
      isSubmitting: {
        true: "bg-disabled-bg cursor-not-allowed",
        false: "bg-status-green cursor-pointer",
      },
    },
    defaultVariants: {
      isSubmitting: false,
    },
  },
);

export const simulationBadgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium",
    "border [&>svg]:stroke-current",
  ],
  {
    variants: {
      isSimulation: {
        true: "bg-status-yellow-bg text-status-yellow border-status-yellow-bg-strong",
        false:
          "bg-status-green-bg text-status-green border-status-green-bg-strong",
      },
    },
    defaultVariants: {
      isSimulation: true,
    },
  },
);

// =============================================================================
// LAYOUT
// =============================================================================

// `lg:h-dvh` is what makes the desktop shell a real fixed-height shell. Without
// it nothing in the chain has a resolved height, so `h-full` further down
// collapses to `auto`, the content grows past the viewport and the action bar -
// Execute Trade included - ends up clipped below the fold. Below `lg` the height
// stays content-driven so the tabbed layout keeps scrolling with the page.
//
// The row template has to change with the breakpoint, because what is in the
// grid changes with it. Below `lg` there are two rows and two in-flow items -
// the tab nav, then `main`. Above `lg` the nav is `display: none` and so is not
// a grid item at all, which left `main` alone in the `auto` row and a `1fr`
// row standing empty underneath it: measured at a 1440x900 viewport the tracks
// came out `835.5px 64.5px`, so the desktop shell threw away 64.5px of viewport
// and the assembly grid was that much shorter than the window could give it.
export const appContainer =
  "flex-1 min-h-0 lg:h-dvh grid grid-rows-[auto_1fr] lg:grid-rows-[1fr] overflow-hidden bg-bg-primary";

export const mainContent = "overflow-hidden";

// =============================================================================
// NAVIGATION BAR
// =============================================================================

export const navBar =
  "flex justify-center items-center gap-6 px-6 py-3 bg-neutral-bg border-b border-border-neutral";

export const navIcon =
  "inline-flex items-center justify-center [&>svg]:stroke-current";

export const orderBadge =
  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-full text-[11px] font-semibold bg-status-green-bg-strong text-status-green";

// =============================================================================
// EXECUTE TRADE PANEL
// =============================================================================

export const executeButtonContainer =
  "shrink-0 p-4 text-center flex flex-col items-center gap-2";

export const simulationModeContainer = "flex items-center gap-2";

export const simulationToggle = cn(
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium",
  "bg-transparent text-text-tertiary border border-white-20",
  "cursor-pointer transition-all duration-200",
  "hover:bg-white-10 hover:text-text-secondary hover:border-white-30",
);

// =============================================================================
// FEEDBACK MESSAGES
// =============================================================================

export const successMessage =
  "text-status-green text-[13px] flex items-center gap-1.5 [&>svg]:stroke-current";

export const errorMessage =
  "text-status-red text-[13px] flex items-center gap-1.5 [&>svg]:stroke-current";

// The Active Orders control on the success message. It is a `<button>` - it
// switches the active panel, and it used to be a router `Link` to a `/active`
// that rendered the identical page - so it inherits the bare `button` defaults
// in `index.css`: a border, an 8px radius, `0.6em 1.2em` of padding and a grey
// fill, none of which belong on a phrase sitting inside a sentence. Those
// defaults are overridden here, in this control's own utilities, because that
// is the only mechanism: no `!` modifier and no opt-out attribute. `min-h-6` is
// the 24px WCAG 2.2 SC 2.5.8 target minimum, which 13px text alone does not
// reach.
export const successLink = cn(
  "text-status-green ml-2 inline-flex items-center gap-1",
  "border-0 rounded-none bg-transparent p-0 min-h-6 font-medium",
  "underline underline-offset-2 cursor-pointer",
  "hover:text-status-green hover:no-underline",
);
