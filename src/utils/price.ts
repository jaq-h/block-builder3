// =============================================================================
// PRICE FORMULA - the single source of truth for "% offset from market"
// =============================================================================

/**
 * The price a block at `percentage` away from market represents.
 *
 * Deliberately dependency-free and deliberately the only implementation of this
 * formula in the tree. The grid cell renders its price chip from it and the
 * order mapper builds Kraken payloads from it, so the price sent is the price
 * shown. A block at 25% is 25% away from market, not 2.5% (decision D3).
 */
export const priceAtOffset = (
  marketPrice: number,
  percentage: number,
  isDescending: boolean,
): number =>
  marketPrice * (isDescending ? 1 - percentage / 100 : 1 + percentage / 100);
