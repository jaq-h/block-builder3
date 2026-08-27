import { describe, it, expect } from "vitest";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

import { appendedCandles, withLatestCandle } from "./liveCandles";
import { simpleMovingAverage } from "@widgets/orderChart/indicators";

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

  it("accumulates without a gap when applied the way the feed applies it", () => {
    // The feed folds twice over: `useOHLCData` folds a bar in the moment it
    // closes, and the chart folds the bar still forming on top. Driven that way
    // across several rollovers every bar has to survive, because an average
    // computed over a window with a hole in it is still a finite number and
    // still looks like a live line.
    let closed = backfill;
    let forming = bar(180, 30);

    for (const next of [bar(240, 40), bar(300, 50), bar(360, 60)]) {
      closed = withLatestCandle(closed, forming);
      forming = next;
    }

    expect(withLatestCandle(closed, forming).map((c) => c.time)).toEqual([
      60, 120, 180, 240, 300, 360,
    ]);
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

describe("appendedCandles", () => {
  it("reports the bars a bar close added, and nothing else", () => {
    const closed = withLatestCandle(backfill, bar(240, 40));
    expect(appendedCandles(backfill, closed)).toEqual([bar(240, 40)]);
  });

  it("reports nothing for a list that has not grown", () => {
    expect(appendedCandles(backfill, [...backfill])).toEqual([]);
  });

  // A bar behind the one at the end being written over: a corrected backfill,
  // not a close. Only a full redraw can carry those values to the series.
  it("refuses a list whose earlier bars were rebuilt", () => {
    const rebuilt = [backfill[0], bar(120, 21), backfill[2], bar(240, 40)];
    expect(appendedCandles(backfill, rebuilt)).toBeNull();
  });

  // The sequence the live feed produces after every backfill: the bar at the
  // end is a new object for the same bar, because a tick rewrote the forming
  // candle before the interval rolled over. That bar is already drawn at that
  // time, so it is reissued rather than answered with a whole-series redraw.
  it("reissues a final bar the feed rewrote in place, and the bars after it", () => {
    const rewritten = bar(180, 31);
    const closed = withLatestCandle(
      [backfill[0], backfill[1], rewritten],
      bar(240, 40),
    );

    expect(appendedCandles(backfill, closed)).toEqual([
      rewritten,
      bar(240, 40),
    ]);
  });

  it("reissues a rewritten final bar even when nothing was appended", () => {
    const rewritten = bar(180, 31);

    expect(
      appendedCandles(backfill, [backfill[0], backfill[1], rewritten]),
    ).toEqual([rewritten]);
  });

  // Rewriting the bar at the end is one thing; a different bar standing where
  // it was is a different series, and update() cannot express that.
  it("refuses a final bar whose time has changed", () => {
    expect(
      appendedCandles(backfill, [backfill[0], backfill[1], bar(200, 30)]),
    ).toBeNull();
  });

  it("refuses a shorter list, which is a different series", () => {
    expect(appendedCandles(backfill, [bar(60, 10)])).toBeNull();
    expect(appendedCandles(backfill, [])).toBeNull();
  });

  // Nothing drawn gaining a whole backfill is the first draw, not a bar close:
  // the series holds no bar for the arriving ones to be an extension of.
  it("refuses a series that holds nothing, whatever arrives", () => {
    expect(appendedCandles([], backfill)).toBeNull();
    expect(appendedCandles([], [])).toBeNull();
  });
});
