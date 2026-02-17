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

export const executeButtonVariants = cva(
  [
    "px-5 py-2.5 text-white border-none rounded text-sm font-medium",
    "transition-colors duration-200 flex items-center gap-2",
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

export const appContainer = "min-h-screen flex flex-col bg-bg-primary";

export const mainContent = "flex-1 flex flex-col";

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
  "p-4 text-center flex flex-col items-center gap-2";

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

export const successLink =
  "text-status-green ml-2 inline-flex items-center gap-1";
