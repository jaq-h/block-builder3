// =============================================================================
// MARKET SELECTOR STYLES
// =============================================================================
//
// Theme tokens only - the same `bg-bg-overlay` / `border-border-neutral` /
// `text-text-*` scale the rest of the app uses, so this row sits in the panel
// chrome rather than beside it.
//
// This stays a native `<select>` rather than becoming a `<button>` with a menu:
// it brings the keyboard and mobile behaviour of a real picker for free, and
// nothing here has to reimplement it.

export const marketSelectorRow =
  "shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 bg-bg-overlay border-b border-border-neutral";

export const marketSelectorLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-text-muted";

// `relative` so the chevron can sit inside it; `appearance-none` so the
// platform arrow does not double up with the one we draw.
export const marketSelectWrapper = "relative inline-flex items-center";

export const marketSelect =
  "appearance-none cursor-pointer rounded-md border border-border-neutral bg-neutral-bg py-1 pl-2.5 pr-7 text-[13px] font-medium text-text-primary transition-[background-color,border-color] duration-200 hover:border-accent-primary hover:bg-accent-bg-hover-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-outline";

export const marketSelectChevron =
  "pointer-events-none absolute right-2 text-[10px] leading-none text-text-muted";

export const marketPriceReadout =
  "text-[12px] tabular-nums text-text-secondary";

export const marketMetadataWarning = "text-[11px] text-status-yellow";
