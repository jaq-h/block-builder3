import type { AutoscaleInfo } from "lightweight-charts";

// =============================================================================
// ORDER AUTOSCALE - keeping the order levels inside the visible range
// =============================================================================
//
// The candles decide the range on their own; this widens it so a level the
// user has just dragged does not sit off-screen with only its axis tag to say
// where it went.

/**
 * The fraction of the top of the range that a logarithmic axis is allowed to
 * be pushed down to.
 *
 * A logarithmic scale has no coordinate for zero or for a negative price, so a
 * range reaching one has no bottom at all. It was reachable: `calculateYPosition`
 * worked on a 0-100 scale while the slider and the axis labels use
 * `SCALE_CONFIG.MAX_PERCENT = 50`, so a block dragged to the very bottom of its
 * cell was a 100% offset - a price of exactly zero. That reader is gone and
 * `utils/blockMapping.ts` now bounds every position to the range the axis can
 * draw, on every path - `clampOffset` where one is read for display, this
 * chart's included, and `offsetForOrder` where one is read for a payload - so
 * no drag can produce one. This guard stays anyway: it is what stops a
 * price arriving from anywhere else taking the logarithmic chart down with it,
 * and a guard that trusts its callers is not one.
 */
export const MIN_LOG_RANGE_RATIO = 1e-4;

/** The shape lightweight-charts wants for `autoscaleInfoProvider`. */
export type OrderAutoscaleProvider = (
  original: () => AutoscaleInfo | null,
) => AutoscaleInfo | null;

/**
 * Defers to the candles entirely.
 *
 * This is the reset, and it has to be a real function rather than `undefined`:
 * `applyOptions` merges its argument with a helper that *skips* an undefined
 * source value, so clearing the option by passing `undefined` leaves whatever
 * provider was installed last still installed. Delete the last order block and
 * the chart would stay stretched to a level no longer on the grid, with
 * nothing on screen to explain it. Handing the original back is exactly what
 * the series does when no provider is set at all.
 */
const DEFER_TO_CANDLES: OrderAutoscaleProvider = (original) => original();

/**
 * An `autoscaleInfoProvider` that widens the candles' own range to include
 * `prices`, or one that defers to the candles when there is nothing to
 * include.
 *
 * Always a provider, never `undefined`, for the reason on `DEFER_TO_CANDLES`.
 *
 * `isLogarithmic` changes only which prices a logarithmic axis is *able* to
 * show and where its floor sits. It is not an input to any price: see
 * `priceScale.ts`.
 */
export const orderAutoscaleProvider = (
  prices: readonly number[],
  isLogarithmic: boolean,
): OrderAutoscaleProvider => {
  const usable = prices.filter((price) =>
    isLogarithmic ? price > 0 : Number.isFinite(price),
  );
  if (!usable.length) return DEFER_TO_CANDLES;

  const min = Math.min(...usable);
  const max = Math.max(...usable);
  // A single level has no spread of its own to pad from.
  const padding = (max - min) * 0.05 || Math.abs(max) * 0.01;

  return (original) => {
    const res = original();
    if (res === null || res.priceRange === null) return res;

    res.priceRange.minValue = Math.min(res.priceRange.minValue, min - padding);
    res.priceRange.maxValue = Math.max(res.priceRange.maxValue, max + padding);

    if (isLogarithmic && res.priceRange.maxValue > 0) {
      res.priceRange.minValue = Math.max(
        res.priceRange.minValue,
        res.priceRange.maxValue * MIN_LOG_RANGE_RATIO,
      );
    }
    return res;
  };
};
