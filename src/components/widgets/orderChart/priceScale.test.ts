import { describe, it, expect } from "vitest";
import { PriceScaleMode } from "lightweight-charts";

import {
  DEFAULT_PRICE_SCALE,
  PRICE_SCALE_OPTIONS,
  priceScaleMode,
} from "./priceScale";

describe("priceScale", () => {
  it("maps each scale onto the library mode", () => {
    expect(priceScaleMode("linear")).toBe(PriceScaleMode.Normal);
    expect(priceScaleMode("logarithmic")).toBe(PriceScaleMode.Logarithmic);
  });

  it("starts linear, because that is what the panel has always shown", () => {
    expect(DEFAULT_PRICE_SCALE).toBe("linear");
  });

  it("offers exactly the scales it can map, each with an accessible name", () => {
    expect(PRICE_SCALE_OPTIONS.map((o) => o.kind)).toEqual([
      "linear",
      "logarithmic",
    ]);
    for (const option of PRICE_SCALE_OPTIONS) {
      expect(option.description.length).toBeGreaterThan(option.label.length);
    }
  });
});
