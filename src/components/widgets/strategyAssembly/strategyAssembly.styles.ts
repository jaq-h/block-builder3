// Strategy Assembly styled components → Tailwind + CVA
import { cva } from "class-variance-authority";
import type { CSSProperties } from "react";

// =============================================================================
// CONTAINER & LAYOUT
// =============================================================================

export const container =
  "max-w-[620px] h-full mx-auto flex flex-col bg-bg-primary";

export const contentWrapper = "flex flex-1 overflow-auto gap-1.5 py-1.5";

export const columnsWrapper = "flex flex-1 h-full gap-1.5";

// =============================================================================
// HEADER
// =============================================================================

export const header =
  "p-4 text-center border-b border-border-neutral bg-bg-overlay";

export const headerTextClass = "m-0 text-lg text-text-primary";

// =============================================================================
// PATTERN SELECTOR
// =============================================================================

export const patternSelectorRow =
  "flex justify-center gap-2 px-4 py-3 bg-bg-cell-active border-b border-border-neutral";

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

export const utilityRow =
  "flex justify-center gap-4 p-4 border-t border-border-neutral bg-bg-overlay";

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
