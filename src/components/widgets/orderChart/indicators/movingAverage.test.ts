import { describe, it, expect } from "vitest";
import type { UTCTimestamp } from "lightweight-charts";

import {
  exponentialMovingAverage,
  simpleMovingAverage,
} from "./movingAverage";
import { OVERLAY_INDICATORS } from "./registry";
import type { IndicatorCandle } from "./types";

// =============================================================================
// HARNESS
// =============================================================================

const series = (closes: readonly number[]): IndicatorCandle[] =>
  closes.map((close, i) => ({ time: (1_000 + i * 60) as UTCTimestamp, close }));

const values = (points: { value: number }[]): number[] =>
  points.map((p) => p.value);

/**
 * Half-up to two decimals, which is how the published tables below are
 * rounded. `toFixed` rounds a binary-float tie the other way (23.525 prints as
 * "23.52"), and every one of these vectors contains such a tie, so comparing
 * through `toFixed` would fail on correct output.
 */
const round2 = (x: number): number =>
  Math.round((x + Number.EPSILON * Math.abs(x)) * 100) / 100;

// =============================================================================
// A KNOWN SERIES
// =============================================================================
//
// The 30 closes and both 10-period vectors below are the worked example
// published in the StockChartSchool article on moving averages - the same
// numbers every charting package is checked against. They are the point of
// this file: an average that is merely "smooth" looks right on a screenshot
// and can still be off by a period, seeded wrongly, or shifted by one candle.

const KNOWN_CLOSES = [
  22.27, 22.19, 22.08, 22.17, 22.18, 22.13, 22.23, 22.43, 22.24, 22.29, 22.15,
  22.39, 22.38, 22.61, 23.36, 24.05, 23.75, 23.83, 23.95, 23.63, 23.82, 23.87,
  23.65, 23.19, 23.1, 23.33, 22.68, 23.1, 22.4, 22.17,
] as const;

const KNOWN_SMA_10 = [
  22.22, 22.21, 22.23, 22.26, 22.3, 22.42, 22.61, 22.77, 22.91, 23.08, 23.21,
  23.38, 23.53, 23.65, 23.71, 23.68, 23.61, 23.51, 23.43, 23.28, 23.13,
] as const;

const KNOWN_EMA_10 = [
  22.22, 22.21, 22.24, 22.27, 22.33, 22.52, 22.8, 22.97, 23.13, 23.28, 23.34,
  23.43, 23.51, 23.53, 23.47, 23.4, 23.39, 23.26, 23.23, 23.08, 22.92,
] as const;

// =============================================================================
// TESTS
// =============================================================================

describe("simpleMovingAverage", () => {
  it("reproduces the published 10-period vector", () => {
    const out = simpleMovingAverage(series(KNOWN_CLOSES), 10);
    expect(values(out).map(round2)).toEqual([...KNOWN_SMA_10]);
  });

  it("emits its first point where the window first fills, not at candle 0", () => {
    const out = simpleMovingAverage(series(KNOWN_CLOSES), 10);
    expect(out).toHaveLength(KNOWN_CLOSES.length - 9);
    // Candle index 9 is the tenth candle: 1000 + 9 * 60.
    expect(out[0].time).toBe(1_540);
  });

  it("is the plain mean of the window", () => {
    // [1..5], period 3: (1+2+3)/3, (2+3+4)/3, (3+4+5)/3.
    expect(values(simpleMovingAverage(series([1, 2, 3, 4, 5]), 3))).toEqual([
      2, 3, 4,
    ]);
  });

  it("is empty until there are enough candles", () => {
    expect(simpleMovingAverage(series([1, 2]), 3)).toEqual([]);
    expect(values(simpleMovingAverage(series([1, 2, 3]), 3))).toEqual([2]);
  });

  it("drops a non-finite close rather than propagating it", () => {
    // Without the guard the window containing NaN yields NaN, and a NaN point
    // makes the whole line series disappear rather than gapping.
    const out = simpleMovingAverage(series([1, 2, NaN, 3, 4, 5]), 3);
    expect(values(out)).toEqual([2, 3, 4]);
  });

  it("refuses a period that is not a positive integer", () => {
    expect(() => simpleMovingAverage(series([1, 2, 3]), 0)).toThrow(
      /positive integer/,
    );
    expect(() => simpleMovingAverage(series([1, 2, 3]), 2.5)).toThrow(
      /positive integer/,
    );
  });
});

describe("exponentialMovingAverage", () => {
  it("reproduces the published 10-period vector", () => {
    const out = exponentialMovingAverage(series(KNOWN_CLOSES), 10);
    expect(values(out).map(round2)).toEqual([...KNOWN_EMA_10]);
  });

  it("seeds with the simple average of the first full window", () => {
    const out = exponentialMovingAverage(series(KNOWN_CLOSES), 10);
    const [seed] = values(simpleMovingAverage(series(KNOWN_CLOSES), 10));
    expect(out[0].value).toBeCloseTo(seed, 12);
    expect(out[0].time).toBe(1_540);
  });

  it("applies the 2/(period+1) smoothing factor", () => {
    // Period 3 gives a smoothing factor of exactly 0.5, so the arithmetic is
    // checkable by hand: seed (1+2+3)/3 = 2, then 4*.5 + 2*.5 = 3, 5*.5 + 3*.5 = 4.
    expect(
      values(exponentialMovingAverage(series([1, 2, 3, 4, 5]), 3)),
    ).toEqual([2, 3, 4]);
  });

  it("is empty until there are enough candles", () => {
    expect(exponentialMovingAverage(series([1, 2]), 3)).toEqual([]);
  });

  it("drops a non-finite close rather than poisoning every later value", () => {
    const out = exponentialMovingAverage(series([1, 2, NaN, 3, 4, 5]), 3);
    expect(values(out)).toEqual([2, 3, 4]);
  });
});

describe("OVERLAY_INDICATORS", () => {
  it("gives every indicator a unique id", () => {
    const ids = OVERLAY_INDICATORS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every indicator an accessible name that is not just its label", () => {
    for (const indicator of OVERLAY_INDICATORS) {
      expect(indicator.description.length).toBeGreaterThan(
        indicator.label.length,
      );
    }
  });

  it("computes without throwing on an empty chart", () => {
    for (const indicator of OVERLAY_INDICATORS) {
      expect(indicator.compute([])).toEqual([]);
    }
  });
});
