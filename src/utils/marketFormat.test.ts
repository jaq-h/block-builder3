import { describe, it, expect } from "vitest";

import {
  formatMarketPrice,
  formatPriceForAPI,
  formatQuantityForAPI,
  roundToTick,
  NO_PRECISION,
  NO_PRICE,
} from "@utils/marketFormat";
import {
  ALL_MARKET_PRECISIONS,
  ARB_USD,
  BTC_USD,
  ETH_USD,
  OP_USD,
  SOL_USD,
} from "@/test/marketFixtures";
import type { ActiveMarket, MarketPrecision } from "@/types/markets";
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

  // `String(Number(x))` switches to exponential notation below 1e-6, so this
  // used to put "5e-7" into `order_qty` - a wrong value with no error, which is
  // the silent rejection this module exists to prevent. It was out of reach
  // only because every shipped pair's `ordermin` happens to sit above 1e-6, an
  // invariant held by data rather than by structure.
  it("writes even the smallest quantity in plain decimal notation", () => {
    expect(formatQuantityForAPI("0.0000005", BTC_USD)).toBe("0.0000005");
    expect(formatQuantityForAPI("0.00000012", BTC_USD)).toBe("0.00000012");
    expect(formatQuantityForAPI("0.000001", BTC_USD)).toBe("0.000001");

    [
      "0.0000005",
      "0.00000012",
      "0.000001",
      "0.00000001",
      "0.5",
      "125.123456789",
    ].forEach((quantity) => {
      expect(formatQuantityForAPI(quantity, BTC_USD)).not.toMatch(/e/i);
    });
  });

  // Rounding below the pair's precision gives zero, and zero is a number the
  // user can see is wrong. "0e-7" is not.
  it("rounds a quantity finer than the pair accepts down to a plain zero", () => {
    expect(formatQuantityForAPI("0.0000005", ARB_USD)).toBe("0");
  });

  it("leaves no bare trailing dot on a whole number", () => {
    expect(formatQuantityForAPI("2", BTC_USD)).toBe("2");
    expect(formatQuantityForAPI("2.000000001", BTC_USD)).toBe("2");
    expect(formatQuantityForAPI("100", ARB_USD)).toBe("100");
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

  // The window before Kraken's metadata lands, and the state after a failed
  // fetch. Two decimals is BTC's habit rather than a neutral default: it draws
  // a real ARB price of 0.4231 as "$0.42", a different price level, quietly.
  // Decision D3 is that the price shown is the price sent, so rather than pick
  // a width this refuses to draw a number at all.
  it("draws no number at all when the pair's precision is unknown", () => {
    expect(formatMarketPrice(1_234.5, active("ETH/USD", null))).toBe(
      NO_PRECISION,
    );
    expect(formatMarketPrice(0.4231, active("ARB/USD", null))).toBe(
      NO_PRECISION,
    );
    expect(formatMarketPrice(1_234.5)).toBe(NO_PRECISION);

    expect(formatMarketPrice(0.4231, active("ARB/USD", null))).not.toMatch(
      /\d/,
    );
  });

  // Two different facts, so two different words: one says no price has arrived,
  // the other that one has but the rule for writing it has not.
  it("tells a missing price apart from a missing precision", () => {
    expect(NO_PRICE).not.toBe(NO_PRECISION);
    expect(formatMarketPrice(null, active("ARB/USD", ARB_USD))).toBe(NO_PRICE);
    expect(formatMarketPrice(0.4231, active("ARB/USD", null))).toBe(
      NO_PRECISION,
    );
  });

  it("has no price to draw when there is no price", () => {
    expect(formatMarketPrice(null)).toBe("—");
    expect(formatMarketPrice(Number.NaN, active("BTC/USD", BTC_USD))).toBe("—");
  });

  it("takes the currency mark from the market rather than assuming one", () => {
    expect(formatMarketPrice(10, active("SOL/USD", SOL_USD))).toBe("$10.00");
  });

  // The readout must not have moved. Every value below is a real Kraken figure -
  // last, ask, bid, high, low and open, fetched live for all five pairs - and
  // every one of them already sits on its pair's tick, so routing the display
  // through the snap is a no-op for everything the app ships. This is the pin:
  // a change that does move what the market readout draws fails here rather
  // than shipping a display change nobody agreed to.
  it("draws real Kraken prices exactly as it always has", () => {
    const cases: [string, MarketPrecision, number, string][] = [
      ["BTC/USD", BTC_USD, 109_243.7, "$109,243.7"],
      ["BTC/USD", BTC_USD, 109_243.8, "$109,243.8"],
      ["BTC/USD", BTC_USD, 111_980.0, "$111,980.0"],
      ["ETH/USD", ETH_USD, 4_512.36, "$4,512.36"],
      ["ETH/USD", ETH_USD, 4_512.37, "$4,512.37"],
      ["ETH/USD", ETH_USD, 4_398.11, "$4,398.11"],
      ["SOL/USD", SOL_USD, 204.53, "$204.53"],
      ["SOL/USD", SOL_USD, 204.54, "$204.54"],
      ["SOL/USD", SOL_USD, 197.82, "$197.82"],
      ["ARB/USD", ARB_USD, 0.4231, "$0.4231"],
      ["ARB/USD", ARB_USD, 0.4232, "$0.4232"],
      ["ARB/USD", ARB_USD, 0.4118, "$0.4118"],
      ["OP/USD", OP_USD, 0.6842, "$0.6842"],
      ["OP/USD", OP_USD, 0.6843, "$0.6843"],
      ["OP/USD", OP_USD, 0.7011, "$0.7011"],
    ];

    cases.forEach(([symbol, precision, price, expected]) => {
      expect(formatMarketPrice(price, active(symbol, precision))).toBe(expected);
    });
  });

  // The divergence being closed. `tick_size` and `pair_decimals` agree on every
  // pair shipped today by coincidence, not by rule, and `tick_size` is read from
  // Kraken at runtime - so the next pair listed can disagree with no code change
  // here. When it does, the chip and the payload must still be the same number:
  // decision D3 is that the price shown IS the price sent.
  it("agrees with the payload when the tick is not one unit of the last decimal", () => {
    const coarseTick: MarketPrecision = {
      ...ARB_USD,
      priceDecimals: 4,
      tickSize: 0.0005,
    };

    expect(formatMarketPrice(0.4567, active("ARB/USD", coarseTick))).toBe(
      "$0.4565",
    );
    expect(formatPriceForAPI(0.4567, coarseTick)).toBe("0.4565");

    // Same number on the chip and in the payload, for anything the grid can
    // compute - not just the one value above.
    [0.4567, 0.1234, 0.98765, 1.00024].forEach((price) => {
      expect(formatMarketPrice(price, active("ARB/USD", coarseTick))).toBe(
        `$${formatPriceForAPI(price, coarseTick)}`,
      );
    });
  });
});
