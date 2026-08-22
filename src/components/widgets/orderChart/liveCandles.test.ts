import { describe, it, expect } from "vitest";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

import { withLatestCandle } from "./liveCandles";
import { simpleMovingAverage } from "./indicators";

// =============================================================================
// HARNESS
// =============================================================================

const bar = (
  time: number,
  close: number,
): CandlestickData<UTCTimestamp> => ({
  time: time as UTCTimestamp,
  open: close,
  high: close,
  low: close,
  close,
});

const backfill = [bar(60, 10), bar(120, 20), bar(180, 30)];

// =============================================================================
// TESTS
// =============================================================================

describe("withLatestCandle", () => {
  it("hands back the backfill untouched, identity included, with no live bar", () => {
    // Identity matters: a new array on every render would re-run every
    // consumer's effect for a tick that changed nothing.
    expect(withLatestCandle(backfill, null)).toBe(backfill);
  });

  it("rewrites the last bar while that bar is still forming", () => {
    const forming = bar(180, 36);

    expect(withLatestCandle(backfill, forming)).toEqual([
      bar(60, 10),
      bar(120, 20),
      forming,
    ]);
  });

  it("appends a bar when the interval has rolled over", () => {
    const rolled = bar(240, 40);

    expect(withLatestCandle(backfill, rolled)).toEqual([...backfill, rolled]);
  });

  it("ignores a tick older than the last bar it already holds", () => {
    expect(withLatestCandle(backfill, bar(120, 999))).toBe(backfill);
  });

  it("starts the list from the live bar when the backfill is empty", () => {
    const only = bar(60, 10);
    expect(withLatestCandle([], only)).toEqual([only]);
  });

  it("leaves the backfill alone rather than mutating it", () => {
    const source = [...backfill];
    withLatestCandle(source, bar(240, 40));
    withLatestCandle(source, bar(180, 36));

    expect(source).toEqual(backfill);
  });

  it("moves a moving average's last point as the forming bar moves", () => {
    // The convention, executed rather than asserted in prose: the bar still
    // being written participates in the average, so the overlay's last point
    // tracks the price instead of freezing at the fetch.
    const closes = [bar(60, 10), bar(120, 20), bar(180, 30)];

    const atFetch = simpleMovingAverage(withLatestCandle(closes, null), 3);
    const later = simpleMovingAverage(
      withLatestCandle(closes, bar(180, 60)),
      3,
    );

    expect(atFetch.at(-1)).toEqual({ time: 180, value: 20 });
    expect(later.at(-1)).toEqual({ time: 180, value: 30 });
  });
});
