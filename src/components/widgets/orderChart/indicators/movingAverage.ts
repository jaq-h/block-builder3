import type { LineData, UTCTimestamp } from "lightweight-charts";
import type { IndicatorCandle } from "./types";

// =============================================================================
// MOVING AVERAGES
// =============================================================================
//
// Both averages are defined on the *close*, and both emit their first point at
// the candle where the window first fills - index `period - 1`, not index 0.
// Emitting earlier would mean averaging over fewer candles than the period
// claims, which draws a line that is not the indicator it is labelled as.
//
// The EMA is seeded with the SMA of the first full window, which is the
// convention every published EMA table uses. Seeding with the first close
// instead is also common and gives *different numbers*, so the choice is
// pinned by `movingAverage.test.ts` against a published series rather than
// left to whoever edits this next.
//
// The second convention, pinned for the same reason: the bar that is still
// being written counts. Whatever candles arrive here are averaged, and the
// caller hands over the live list, forming bar included - see
// `liveCandles.ts`. Dropping it would hold the last point one bar behind the
// candles for the whole life of that bar, which on a 1m timeframe is a line
// that is visibly and permanently stale.

/**
 * Candles the indicators may average.
 *
 * A single non-finite close would poison every later EMA value permanently, so
 * such candles are dropped rather than propagated. The window then closes over
 * the gap, which is the same thing a feed with a missing bar does.
 */
const usableCandles = (
  candles: readonly IndicatorCandle[],
): readonly IndicatorCandle[] =>
  candles.every((c) => Number.isFinite(c.close))
    ? candles
    : candles.filter((c) => Number.isFinite(c.close));

const assertPeriod = (period: number): void => {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error(
      `Moving average period must be a positive integer, got ${period}`,
    );
  }
};

/** The arithmetic mean of the last `period` closes, at every candle that has one. */
export const simpleMovingAverage = (
  candles: readonly IndicatorCandle[],
  period: number,
): LineData<UTCTimestamp>[] => {
  assertPeriod(period);

  const source = usableCandles(candles);
  if (source.length < period) return [];

  const out: LineData<UTCTimestamp>[] = [];
  // A rolling sum rather than a fresh window sum per point: the naive form is
  // O(n * period) and this chart re-runs it on every candle tick.
  let sum = 0;
  for (let i = 0; i < source.length; i++) {
    sum += source[i].close;
    if (i >= period) sum -= source[i - period].close;
    if (i >= period - 1) {
      out.push({ time: source[i].time, value: sum / period });
    }
  }
  return out;
};

/**
 * The exponentially weighted average, smoothing factor `2 / (period + 1)`,
 * seeded with the simple average of the first full window.
 */
export const exponentialMovingAverage = (
  candles: readonly IndicatorCandle[],
  period: number,
): LineData<UTCTimestamp>[] => {
  assertPeriod(period);

  const source = usableCandles(candles);
  if (source.length < period) return [];

  const smoothing = 2 / (period + 1);
  const out: LineData<UTCTimestamp>[] = [];

  let seed = 0;
  for (let i = 0; i < period; i++) seed += source[i].close;
  let previous = seed / period;
  out.push({ time: source[period - 1].time, value: previous });

  for (let i = period; i < source.length; i++) {
    previous = source[i].close * smoothing + previous * (1 - smoothing);
    out.push({ time: source[i].time, value: previous });
  }
  return out;
};
