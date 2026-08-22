// =============================================================================
// MARKET FORMATTING - the single owner of "how many decimals does this pair use"
// =============================================================================
//
// Before this module the answer was spread across four places and all four
// disagreed:
//
//   - `orderMapper.formatPriceForAPI` branched on the base asset and otherwise
//     picked a precision from the *magnitude* of the number (6 below 1, 4 below
//     100, 2 above). Magnitude is not precision: ETH/USD takes 2 decimals at
//     every price, so a $12.34 ETH price was formatted to 4 and rejected.
//   - `krakenRest.formatPrice` branched on `symbol.includes('BTC')`, which is
//     also true of ETH/BTC.
//   - `utils/grid.formatPrice` was a flat 2 decimals for display.
//   - `buildTrigger` received no symbol at all and fell back to BTC's.
//
// So one payload could carry a trigger price at one precision and a limit price
// at another, and the price on screen could be a third. All of them are now one
// question with one answer: what does *Kraken* say about this pair
// (`MarketPrecision`), and that record is passed in rather than derived from
// the symbol string.
//
// Nothing here has a default precision, on purpose. A caller that has not got
// one yet must say so; substituting BTC's rules is the bug this replaces.

import type { ActiveMarket, MarketPrecision } from "../types/markets";

/** How many decimal places a number is written with, e.g. 0.0001 -> 4. */
const decimalPlaces = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const text = String(value);
  const dot = text.indexOf(".");
  if (dot === -1) {
    // Exponential notation ("1e-8") has no dot but plenty of decimals.
    const exponent = text.indexOf("e-");
    return exponent === -1 ? 0 : Number(text.slice(exponent + 2));
  }
  return text.length - dot - 1;
};

/**
 * Snap a price to the pair's tick.
 *
 * Kraken rejects a price that is not a whole number of ticks, and a rejection
 * is invisible to the user: the order simply never appears. Rounding to the
 * pair's price decimals is not the same check - `tick_size` and
 * `pair_decimals` happen to agree on every pair this app ships today, and are
 * free to disagree on the next one.
 *
 * The recomposition goes back through `toFixed` because `375 * 0.0001` is
 * `0.037500000000000006` in binary floating point, and that extra tail is
 * exactly what a precision check downstream would trip over.
 */
export const roundToTick = (price: number, tickSize: number): number => {
  if (!Number.isFinite(price)) return price;
  if (!Number.isFinite(tickSize) || tickSize <= 0) return price;

  const ticks = Math.round(price / tickSize);
  return Number((ticks * tickSize).toFixed(decimalPlaces(tickSize)));
};

/**
 * Format a price for a Kraken order payload.
 *
 * Tick first, then decimals: snapping to the tick is what Kraken validates, and
 * fixing the decimals is what keeps the string it receives free of a floating
 * point tail. A non-finite price is handed back as-is so `validateOrder` can
 * report it as the bad number it is rather than as the string "NaN".
 */
export const formatPriceForAPI = (
  price: number,
  precision: MarketPrecision,
): string => {
  if (!Number.isFinite(price)) return String(price);
  return roundToTick(price, precision.tickSize).toFixed(precision.priceDecimals);
};

/**
 * Format an order quantity for a Kraken order payload.
 *
 * `lot_decimals` differs by pair as sharply as price precision does - 8 for
 * BTC, 5 for ARB - and a quantity carrying more decimals than the pair accepts
 * is rejected the same silent way a bad price is.
 *
 * Unlike a price, this does **not** pad. `lot_decimals` is a maximum, not a
 * width: half a bitcoin is `"0.5"`, and padding it to `"0.50000000"` would put
 * seven digits into the payload that say nothing and that the user never typed.
 * Rounding through `Number` after `toFixed` is what drops the padding while
 * keeping the rounding.
 *
 * A quantity that is not a finite number is passed through untouched: turning
 * `"half a bitcoin"` into `"NaN"` would hide it from `validateOrder`, whose
 * "must be a positive number" is the message the user should actually see.
 * Blank is handled separately for the same reason - `Number("")` is 0, so an
 * empty quantity would otherwise be reformatted into a confident `"0"` that the
 * user never typed.
 */
export const formatQuantityForAPI = (
  quantity: string,
  precision: MarketPrecision,
): string => {
  if (quantity.trim() === "") return quantity;
  const value = Number(quantity);
  if (!Number.isFinite(value)) return quantity;
  return String(Number(value.toFixed(precision.quantityDecimals)));
};

/**
 * Format a price for the screen.
 *
 * Display follows the same per-pair precision the payload does, because
 * decision D3 is that the price shown is the price sent. Until Kraken's
 * metadata arrives there is no precision to follow, and rather than guess one
 * this falls back to two decimals - the behaviour the app has always had. That
 * window is safe because it is display only: `mapGridToOrders` refuses to build
 * a payload at all without a `MarketPrecision`, so no order can be priced from
 * a fallback the chip was drawn with.
 */
export const formatMarketPrice = (
  price: number | null,
  market?: ActiveMarket | null,
): string => {
  if (price === null || !Number.isFinite(price)) return "—";

  const decimals = market?.precision?.priceDecimals ?? 2;
  const prefix = market?.market.quotePrefix ?? "$";

  return `${prefix}${price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};
