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

/**
 * The bars `next` adds to the end of `drawn`, or `null` when `next` is not an
 * extension of it.
 *
 * This exists for the one transition that made the newest candle blink: at a
 * bar close `useOHLCData` moves the bar it was writing into `candles`, and
 * redrawing the series with `setData(candles)` replaces every bar on the chart
 * with a list that does not yet contain the bar now forming. The chart is left
 * without it until the next tick arrives, so the newest candle vanishes and
 * comes back on every close. The bar that closed is already drawn - as the bar
 * that was forming, at the same time - so the honest redraw is to write that
 * one bar over itself with `update()` and leave the rest of the series alone.
 *
 * Extension is judged by reference identity across every bar before the last,
 * which is what the fold above produces (`[...candles, latest]` keeps every
 * earlier bar's identity). One of those earlier bars having been rebuilt - a
 * corrected backfill, a new market - is deliberately not an extension, and its
 * caller falls back to a full `setData`.
 *
 * The bar at the end is compared by time rather than by identity, and reissued
 * when it is a different object, because the feed rewrites exactly that one bar
 * in place. After the backfill `latestCandle` is the same object as
 * `candles.at(-1)`; the first tick for that still-forming bar replaces it with
 * a fresh object while `candles` keeps its identity, and the next rollover
 * folds that fresh object back in as the last element. Judged on identity alone
 * that is a rebuilt bar, so the first close after every backfill - and
 * therefore after every mount, market switch and timeframe change - redrew the
 * whole series. Reissuing it is safe: it rewrites a bar at a time the series
 * already holds, which is what `update()` is for.
 *
 * A series holding nothing is not an extension either, however the prefix
 * compares: every bar it gains is its first draw rather than a bar close. That
 * case is the one the feed produces most - `useOHLCData` holds the empty
 * `NO_CANDLES` for a request that has not resolved, so every mount, market
 * switch and timeframe change passes through it - and answering it with the
 * whole backfill would turn one bulk load into a per-bar `update()` for each of
 * several hundred bars, positioning the time scale by right-edge shifting
 * rather than by a bulk load. A close always appends onto a series that already
 * holds the bar that closed.
 */
export const appendedCandles = (
  drawn: readonly CandlestickData<UTCTimestamp>[],
  next: readonly CandlestickData<UTCTimestamp>[],
): CandlestickData<UTCTimestamp>[] | null => {
  if (!drawn.length) return null;
  if (next.length < drawn.length) return null;

  const last = drawn.length - 1;
  for (let i = 0; i < last; i += 1) {
    if (drawn[i] !== next[i]) return null;
  }

  if (drawn[last] === next[last]) return next.slice(drawn.length);
  if (drawn[last].time !== next[last].time) return null;
  return next.slice(last);
};
