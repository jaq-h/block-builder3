import { describe, it, expect } from "vitest";
import { PriceScaleMode } from "lightweight-charts";

import { priceScaleMode } from "./priceScaleMode";

describe("priceScaleMode", () => {
  it("maps each scale onto the library mode", () => {
    expect(priceScaleMode("linear")).toBe(PriceScaleMode.Normal);
    expect(priceScaleMode("logarithmic")).toBe(PriceScaleMode.Logarithmic);
  });
});
