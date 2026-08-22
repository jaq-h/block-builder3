import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

// =============================================================================
// LIVE CANDLES - the accumulated bars and the one still being written
// =============================================================================
//
// `useOHLCData` hands out two things: `candles`, every bar that has closed, and
// `latestCandle`, the bar the WebSocket is still writing. The split exists so
// `candles` keeps a stable identity between bar closes - a consumer's effect
// must not churn on every tick - and it is the reason there are two values to
// reconcile at all.
//
// `withLatestCandle` is the single fold that reconciles them, and both sides of
// the feed go through it. `useOHLCData` folds a bar into `candles` the moment
// the interval rolls over and that bar is final; the chart folds the bar still
// forming on top, for anything that needs the series exactly as it stands now.
// One fold, so the list the candles are drawn from and the list an indicator is
// computed over cannot drift apart.
//
// They did drift, in both directions, which is why this is written down. Fed
// the backfill alone an overlay froze at the fetch while the candles kept
// moving. Fed each tick folded into a backfill that never grew, it advanced but
// dropped every bar that had closed since, so a 20-period average was drawn
// over a window with an hour-wide hole in it. Both look exactly like a live
// line, which is what makes them worse than drawing nothing.
//
// The bar still being written participates in an indicator's average. That is
// the convention every charting package draws - the last point of a moving
// average moves with the bar it sits on - and the choice is recorded in
// `movingAverage.ts` next to the EMA seed.

/**
 * `candles` with `latest` folded in: appended when the interval has rolled
 * over, or written over the last bar while that bar is still forming.
 *
 * Returns `candles` itself, identity intact, when there is nothing to fold in,
 * so a consumer's effect does not re-run for a tick that changed nothing.
 */
export const withLatestCandle = (
  candles: CandlestickData<UTCTimestamp>[],
  latest: CandlestickData<UTCTimestamp> | null,
): CandlestickData<UTCTimestamp>[] => {
  if (!latest) return candles;
  if (!candles.length) return [latest];

  const last = candles[candles.length - 1];
  if (latest.time > last.time) return [...candles, latest];
  if (latest.time === last.time) return [...candles.slice(0, -1), latest];

  // A tick older than the last bar we hold: either one the backfill already
  // covers or one that arrived out of order. The accumulated list is the more
  // complete record of a closed bar, so it wins rather than being rewound.
  return candles;
};
