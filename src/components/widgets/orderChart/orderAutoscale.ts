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
 * range reaching one has no bottom at all. It is reachable: `calculateYPosition`
 * works on a 0-100 scale while the slider and the axis labels use
 * `SCALE_CONFIG.MAX_PERCENT = 50`, so a block dragged to the very bottom of its
 * cell is a 100% offset - a price of exactly zero. That root cause is in the
 * drag layer and is owned by `bb3-mapping-owner`; this is only the guard that
 * stops it taking the logarithmic chart down with it.
 */
export const MIN_LOG_RANGE_RATIO = 1e-4;

/**
 * An `autoscaleInfoProvider` that widens the candles' own range to include
 * `prices`, or `undefined` when there is nothing to include - which is how the
 * series is told to go back to scaling itself.
 *
 * `isLogarithmic` changes only which prices a logarithmic axis is *able* to
 * show and where its floor sits. It is not an input to any price: see
 * `priceScale.ts`.
 */
export const orderAutoscaleProvider = (
  prices: readonly number[],
  isLogarithmic: boolean,
):
  | ((original: () => AutoscaleInfo | null) => AutoscaleInfo | null)
  | undefined => {
  const usable = prices.filter((price) =>
    isLogarithmic ? price > 0 : Number.isFinite(price),
  );
  if (!usable.length) return undefined;

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
