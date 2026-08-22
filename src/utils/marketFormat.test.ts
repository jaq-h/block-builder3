import { describe, it, expect } from "vitest";

import {
  formatMarketPrice,
  formatPriceForAPI,
  formatQuantityForAPI,
  roundToTick,
} from "@utils/marketFormat";
import {
  ALL_MARKET_PRECISIONS,
  ARB_USD,
  BTC_USD,
  ETH_USD,
  SOL_USD,
} from "@/test/marketFixtures";
import type { ActiveMarket } from "@/types/markets";
import { findMarket } from "@data/markets";

// =============================================================================
// TICK ROUNDING
// =============================================================================

describe("roundToTick", () => {
  it("snaps to the nearest whole number of ticks", () => {
    expect(roundToTick(50_123.456, 0.1)).toBe(50_123.5);
    expect(roundToTick(0.45678, 0.0001)).toBe(0.4568);
    expect(roundToTick(10.13, 0.05)).toBe(10.15);
  });

  // `375 * 0.0001` is 0.037500000000000006 in binary floating point, and that
  // tail is exactly what a precision check downstream trips over. The
  // recomposition goes back through `toFixed` for this reason.
  it("leaves no floating point tail behind", () => {
    expect(String(roundToTick(0.03751, 0.0001))).toBe("0.0375");
    expect(String(roundToTick(2.675, 0.005))).not.toMatch(/0000000/);
  });

  // These are guards, not features: a tick that is missing, zero or negative
  // cannot snap anything, and silently returning 0 would put a zero price into
  // a payload. Handing the price back leaves `validateOrder` to reject it.
  it("hands the price back when the tick is unusable", () => {
    expect(roundToTick(123.45, 0)).toBe(123.45);
    expect(roundToTick(123.45, -1)).toBe(123.45);
    expect(roundToTick(123.45, Number.NaN)).toBe(123.45);
  });

  it("hands a non-finite price straight back", () => {
    expect(roundToTick(Number.NaN, 0.1)).toBeNaN();
    expect(roundToTick(Number.POSITIVE_INFINITY, 0.1)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

// =============================================================================
// PRICE FORMATTING FOR THE API
// =============================================================================

describe("formatPriceForAPI", () => {
  // The precision is Kraken's, per pair, and it is a *width* for a price: the
  // exchange is sent the same number of decimals every time for a given pair.
  it("uses the pair's own decimals, padding to that width", () => {
    expect(formatPriceForAPI(50_123.456, BTC_USD)).toBe("50123.5");
    expect(formatPriceForAPI(2_345.6789, ETH_USD)).toBe("2345.68");
    expect(formatPriceForAPI(0.4567891, ARB_USD)).toBe("0.4568");
    expect(formatPriceForAPI(50_000, BTC_USD)).toBe("50000.0");
  });

  // FORMERLY THE BEHAVIOUR OF A MAGNITUDE HEURISTIC. Precision was chosen from
  // how big the number was - 6 decimals below 1, 4 below 100, 2 above - so the
  // same pair got different precisions at different prices. ETH/USD takes two
  // decimals at every price, and these are the two cases that used to disagree.
  it("does not vary the precision with the size of the price", () => {
    expect(formatPriceForAPI(12.3456789, ETH_USD)).toBe("12.35");
    expect(formatPriceForAPI(2_345.6789, ETH_USD)).toBe("2345.68");
    expect(formatPriceForAPI(180.129, SOL_USD)).toBe("180.13");
  });

  it("always returns a string, never a number", () => {
    ALL_MARKET_PRECISIONS.forEach((precision) => {
      expect(typeof formatPriceForAPI(1_234.5678, precision)).toBe("string");
    });
  });

  // A "NaN" in a payload would read as a present price to a bare presence
  // check. Handing the value back unformatted keeps `validateOrder`'s "must be
  // a finite number" as the message the user sees.
  it("does not turn a non-finite price into a formatted string", () => {
    expect(formatPriceForAPI(Number.NaN, ETH_USD)).toBe("NaN");
  });
});

// =============================================================================
// QUANTITY FORMATTING FOR THE API
// =============================================================================

describe("formatQuantityForAPI", () => {
  // `lot_decimals` is a maximum rather than a width, so unlike a price this
  // does not pad: half a bitcoin stays "0.5".
  it("rounds to the pair's lot decimals without padding", () => {
    expect(formatQuantityForAPI("0.5", BTC_USD)).toBe("0.5");
    expect(formatQuantityForAPI("125.123456789", ARB_USD)).toBe("125.12346");
    expect(formatQuantityForAPI("125.123456789", BTC_USD)).toBe("125.12345679");
  });

  it("leaves a quantity that is not a number alone", () => {
    expect(formatQuantityForAPI("half a bitcoin", BTC_USD)).toBe(
      "half a bitcoin",
    );
    expect(formatQuantityForAPI("", BTC_USD)).toBe("");
  });
});

// =============================================================================
// PRICE FORMATTING FOR THE SCREEN
// =============================================================================

describe("formatMarketPrice", () => {
  const active = (
    symbol: string,
    precision: ActiveMarket["precision"],
  ): ActiveMarket => ({
    market: findMarket(symbol)!,
    precision,
  });

  it("draws a price at the selected pair's precision", () => {
    expect(formatMarketPrice(50_123.456, active("BTC/USD", BTC_USD))).toBe(
      "$50,123.5",
    );
    expect(formatMarketPrice(0.4567891, active("ARB/USD", ARB_USD))).toBe(
      "$0.4568",
    );
  });

  // The window before Kraken's metadata lands. Two decimals is what the app has
  // always shown, and it is display only - `mapGridToOrders` refuses to build a
  // payload without a precision record, so nothing can be *priced* from this.
  it("falls back to two decimals while the precision is unknown", () => {
    expect(formatMarketPrice(1_234.5, active("ETH/USD", null))).toBe(
      "$1,234.50",
    );
    expect(formatMarketPrice(1_234.5)).toBe("$1,234.50");
  });

  it("has no price to draw when there is no price", () => {
    expect(formatMarketPrice(null)).toBe("—");
    expect(formatMarketPrice(Number.NaN, active("BTC/USD", BTC_USD))).toBe("—");
  });

  it("takes the currency mark from the market rather than assuming one", () => {
    expect(formatMarketPrice(10, active("SOL/USD", SOL_USD))).toBe("$10.00");
  });
});
