import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

// =============================================================================
// LIVE CANDLES - the backfill and the bar still being written, as one list
// =============================================================================
//
// `useOHLCData` hands out two things: `candles`, the REST backfill, given a
// deliberately stable identity so a consumer's effect deps do not churn while
// it loads, and `latestCandle`, the bar the WebSocket is still writing. The
// candle series consumes both - `setData` then `update` - so it advances on
// its own.
//
// An overlay indicator cannot do that. It is a function of the whole series,
// so it needs the whole series, and feeding it the backfill alone freezes its
// last point at the moment of the fetch while the candles keep moving
// underneath it. A stale average looks exactly like a live one, which is worse
// than drawing none at all. This is the one place the two halves are put back
// together, so both the candles and every overlay read the same bars.
//
// The bar still being written participates. That is the convention every
// charting package draws - the last point of a moving average moves with the
// bar it sits on - and it is what makes the overlay readable as current; the
// choice is recorded in `movingAverage.ts` next to the EMA seed and pinned by
// `liveCandles.test.ts`.

/**
 * `candles` with `latest` folded in: appended when the interval has rolled
 * over, or written over the last bar while that bar is still forming.
 *
 * Returns `candles` itself, identity intact, when there is nothing to fold in,
 * so a consumer's effect does not re-run for a tick that changed nothing.
 */
export const withLatestCandle = (
  candles: readonly CandlestickData<UTCTimestamp>[],
  latest: CandlestickData<UTCTimestamp> | null,
): readonly CandlestickData<UTCTimestamp>[] => {
  if (!latest) return candles;
  if (!candles.length) return [latest];

  const last = candles[candles.length - 1];
  if (latest.time > last.time) return [...candles, latest];
  if (latest.time === last.time) return [...candles.slice(0, -1), latest];

  // A tick older than the last bar we hold: either one the backfill already
  // covers or one that arrived out of order. The backfill is the more complete
  // record of a closed bar, so it wins rather than being rewound.
  return candles;
};
