// =============================================================================
// PRICE FORMULA - the single source of truth for "% offset from market"
// =============================================================================

/**
 * The price a block at `percentage` away from market represents.
 *
 * Deliberately dependency-free, and the shared owner of this formula for the
 * grid display and the order mapper: the cell renders its price chip from it
 * and the mapper builds Kraken payloads from it, so the price sent is the price
 * shown. A block at 25% is 25% away from market, not 2.5% (decision D3).
 *
 * OrderChart still inlines an identical copy of the formula to place its price
 * lines. Reconciling that belongs to bb3-mapping-owner, which owns that file.
 */
export const priceAtOffset = (
  marketPrice: number,
  percentage: number,
  isDescending: boolean,
): number =>
  marketPrice * (isDescending ? 1 - percentage / 100 : 1 + percentage / 100);
