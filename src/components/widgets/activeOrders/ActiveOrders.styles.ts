// Active Orders widget → Tailwind + CVA
import { cva } from "class-variance-authority";
import type { CSSProperties } from "react";

// =============================================================================
// CONTAINER & LAYOUT
// =============================================================================

export const container =
  "max-w-[520px] h-full mx-auto flex flex-col bg-bg-primary";

export const contentWrapper = "flex flex-1 overflow-auto gap-1.5 p-1.5";

export const columnsWrapper = "flex flex-1 h-full gap-1.5";

// =============================================================================
// HEADER
// =============================================================================

export const header =
  "p-4 text-center border-b border-border-neutral bg-bg-overlay";

export const headerTextClass = "m-0 text-lg text-text-primary";

// =============================================================================
// STATUS BAR
// =============================================================================

export const statusBar =
  "flex justify-between items-center px-4 py-2.5 bg-bg-cell-active border-b border-border-neutral";

export const statusInfo = "flex items-center gap-4";

export const statusItem = "flex items-center gap-1.5 text-xs";

export const statusLabel = "text-text-muted";

export function getStatusValueProps(color?: string) {
  const className = "font-medium";
  const style: CSSProperties = {
    color: color || "rgba(255, 255, 255, 0.9)",
  };
  return { className, style };
}

export function getStatusDotProps(color: string) {
  const className = "w-2 h-2 rounded-full inline-block";
  const style: CSSProperties = { backgroundColor: color };
  return { className, style };
}

// =============================================================================
// COLUMNS
// =============================================================================

export const columnClass =
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
// REFRESH BUTTON
// =============================================================================

export const refreshButton =
  "flex items-center justify-center gap-1.5 px-3 py-1.5 border border-border-neutral rounded-md bg-neutral-bg text-white-70 text-xs cursor-pointer transition-all duration-200 [&>svg]:stroke-current hover:bg-accent-bg-hover-light hover:border-accent-primary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed";

// =============================================================================
// EMPTY STATE
// =============================================================================

export const emptyStateContainer =
  "flex-1 flex flex-col items-center justify-center px-6 py-12 text-center";

export const emptyStateIcon =
  "mb-4 opacity-50 flex items-center justify-center [&>svg]:stroke-current";

export const emptyStateTitle =
  "m-0 mb-2 text-base font-semibold text-text-secondary";

export const emptyStateDescription =
  "m-0 text-[13px] text-text-muted max-w-[280px]";

// =============================================================================
// ORDER COUNT BADGE (CVA)
// =============================================================================

export const orderCountBadge = cva(
  "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-[10px] text-[11px] font-semibold",
  {
    variants: {
      variant: {
        entry: "bg-entry-count-bg text-entry-count-text",
        exit: "bg-exit-count-bg text-exit-count-text",
        default: "bg-accent-bg-subtle text-accent-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// =============================================================================
// NAVIGATION LINK
// =============================================================================

export const navLink =
  "inline-flex items-center gap-1 text-xs text-accent-primary no-underline cursor-pointer transition-opacity duration-200 hover:opacity-80 hover:underline [&>svg]:w-3 [&>svg]:h-3";

// =============================================================================
// FOOTER
// =============================================================================

export const footer =
  "flex justify-center items-center px-4 py-3 border-t border-border-neutral bg-bg-overlay";

// =============================================================================
// LAST UPDATED TEXT
// =============================================================================

export const lastUpdated = "text-[10px] text-white-40";

// =============================================================================
// DEV CONTROLS (Development Mode Only)
// =============================================================================

export const devControlsContainer =
  "flex flex-col gap-3 px-4 py-3 bg-status-yellow-bg-subtle border-t border-dashed border-status-yellow-bg-strong";

export const devControlsHeader =
  "flex items-center gap-2 text-[11px] font-semibold text-status-yellow uppercase tracking-wide [&>svg]:stroke-current";

export const devControlsRow = "flex flex-wrap gap-2 items-center";

export const devButton = cva(
  "flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium cursor-pointer transition-all duration-200 [&>svg]:stroke-current disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        fill: "border border-status-blue-border bg-status-blue-bg text-status-blue hover:bg-status-blue-bg-hover",
        cancel:
          "border border-status-red-border bg-status-red-bg text-status-red hover:bg-status-red-bg-hover",
        reset:
          "border border-status-grey-border bg-status-grey-bg text-status-grey hover:bg-status-grey-bg-hover",
        default:
          "border border-status-yellow-border bg-status-yellow-bg-hover text-status-yellow hover:bg-status-yellow-bg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export const devLabel = "text-[10px] text-text-muted";

export const orderIdSelect =
  "px-2 py-1 rounded text-[11px] bg-neutral-bg-medium border border-white-20 text-white-90 cursor-pointer min-w-[120px] focus:outline-none focus:border-accent-primary [&>option]:bg-bg-column [&>option]:text-white-90";
