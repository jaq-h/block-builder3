import { describe, it, expect } from "vitest";
import type { AutoscaleInfo } from "lightweight-charts";

import {
  MIN_LOG_RANGE_RATIO,
  orderAutoscaleProvider,
} from "./orderAutoscale";

// =============================================================================
// HARNESS
// =============================================================================

/** What the candles alone would have chosen. */
const candles = (minValue: number, maxValue: number) => (): AutoscaleInfo => ({
  priceRange: { minValue, maxValue },
});

const apply = (
  provider: ReturnType<typeof orderAutoscaleProvider>,
  original: () => AutoscaleInfo | null,
) => provider(original)!.priceRange!;

// =============================================================================
// TESTS
// =============================================================================

describe("orderAutoscaleProvider", () => {
  it("hands the series back to its own scaling when there is nothing to include", () => {
    expect(apply(orderAutoscaleProvider([], false), candles(70_000, 80_000))).toEqual(
      { minValue: 70_000, maxValue: 80_000 },
    );
  });

  it("releases the range again when the last order block is deleted", () => {
    // The case that was slipping through. A level far below the candles
    // widens the range; deleting that block has to give the range back. The
    // reset must be a provider that defers, never `undefined`: `applyOptions`
    // merges with a helper that skips an undefined source value, so an
    // undefined here would leave the widening provider installed for good and
    // the chart would stay zoomed out to 25,000 with no block at 25,000.
    const widened = orderAutoscaleProvider([25_000], false);
    expect(apply(widened, candles(70_000, 80_000)).minValue).toBeLessThan(70_000);

    const afterDelete = orderAutoscaleProvider([], false);
    expect(afterDelete).toBeTypeOf("function");
    expect(apply(afterDelete, candles(70_000, 80_000))).toEqual({
      minValue: 70_000,
      maxValue: 80_000,
    });
  });

  it("widens the candles' range to hold every order level, with padding", () => {
    const range = apply(
      orderAutoscaleProvider([60_000, 90_000], false),
      candles(70_000, 80_000),
    );
    const padding = 30_000 * 0.05;

    expect(range.minValue).toBe(60_000 - padding);
    expect(range.maxValue).toBe(90_000 + padding);
  });

  it("never narrows a range the candles already need", () => {
    const range = apply(
      orderAutoscaleProvider([75_000], false),
      candles(10_000, 200_000),
    );

    expect(range.minValue).toBe(10_000);
    expect(range.maxValue).toBe(200_000);
  });

  it("pads a single level off its own magnitude, since it has no spread", () => {
    const range = apply(
      orderAutoscaleProvider([50_000], false),
      candles(50_000, 50_000),
    );

    expect(range.minValue).toBe(50_000 - 500);
    expect(range.maxValue).toBe(50_000 + 500);
  });

  it("leaves a non-positive level out of a logarithmic range", () => {
    // A block dragged to the very bottom of its cell is a 100% offset, which
    // is a price of zero: `calculateYPosition` runs on a 0-100 scale while the
    // slider uses MAX_PERCENT = 50. A logarithmic axis has no coordinate for
    // it, and letting it set the floor takes the whole chart with it.
    const range = apply(
      orderAutoscaleProvider([0, 90_000], true),
      candles(70_000, 80_000),
    );

    expect(range.minValue).toBeGreaterThan(0);
    expect(range.maxValue).toBe(90_000 + 90_000 * 0.01);
  });

  it("keeps a logarithmic floor above zero even when the candles ask for zero", () => {
    const range = apply(
      orderAutoscaleProvider([90_000], true),
      candles(0, 80_000),
    );

    expect(range.minValue).toBe(range.maxValue * MIN_LOG_RANGE_RATIO);
    expect(range.minValue).toBeGreaterThan(0);
  });

  it("still shows a non-positive level on a linear axis, where it has a place", () => {
    // Linear behaviour is deliberately unchanged: the zero-price defect is the
    // drag layer's, and hiding its symptom here would only make it harder to see.
    const range = apply(
      orderAutoscaleProvider([0, 90_000], false),
      candles(70_000, 80_000),
    );

    expect(range.minValue).toBeLessThanOrEqual(0);
  });

  it("passes a null range straight through", () => {
    const provider = orderAutoscaleProvider([50_000], true);
    expect(provider(() => null)).toBeNull();
    expect(provider(() => ({ priceRange: null }))).toEqual({
      priceRange: null,
    });
  });
});
