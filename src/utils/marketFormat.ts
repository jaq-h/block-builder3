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
// Nothing here has a default precision, on purpose - for the screen as much as
// for the payload. A caller that has not got one yet must say so; substituting
// BTC's two decimals is the bug this replaces, and it is no less a wrong price
// for being one nobody submits.

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
 *
 * The padding is trimmed off the string rather than rounded away through
 * `Number`, because `String(Number(x))` switches to exponential notation below
 * 1e-6: `formatQuantityForAPI("0.0000005", BTC_USD)` produced `"5e-7"`, which
 * went into `order_qty` as a wrong value with no error - the silent rejection
 * this module exists to prevent. It was unreachable on the five pairs shipped
 * today only because every one of their `ordermin` values happens to sit above
 * 1e-6, so `validateOrder` refused such a quantity first. That is an invariant
 * held by data that happens to line up rather than by structure, which is the
 * same reasoning rejected for the display/tick divergence above.
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

  const fixed = value.toFixed(precision.quantityDecimals);
  if (!fixed.includes(".")) return fixed;
  return fixed.replace(/0+$/, "").replace(/\.$/, "");
};

/**
 * Format a price for the screen.
 *
 * Display follows the same per-pair precision the payload does, because
 * decision D3 is that the price shown is the price sent - so this snaps to the
 * tick first, exactly as `formatPriceForAPI` does, rather than only rounding to
 * the pair's decimals.
 *
 * That step is not redundant. Rounding to `pair_decimals` and snapping to
 * `tick_size` give the same answer only while `tick_size` equals
 * `10^-pair_decimals`, which is true of all five pairs shipped today and is an
 * invariant held by data that happens to line up, not by anything structural.
 * `tick_size` is read from Kraken at runtime, so the sixth pair added - by a
 * lane whose whole purpose is adding pairs - can break it with no code change
 * and nothing failing: at `pair_decimals` 4 with a `tick_size` of 0.0005 the
 * chip would read $0.4567 while the payload carried 0.4565. A silent divergence
 * between the price shown and the price sent is the exact thing D3 exists to
 * prevent, so both go through the same snap.
 *
 * Snapping is verified to be a no-op for every pair on offer: the live readout
 * for BTC, ETH, SOL, ARB and OP draws exactly what it drew before, which
 * `marketFormat.test.ts` pins against real Kraken values.
 *
 * Without a `MarketPrecision` there is no answer to draw, and this says so
 * rather than picking a width. It used to fall back to two decimals, which was
 * the behaviour the app had always had - but two decimals is BTC's habit, not a
 * neutral default: it renders a real ARB price of 0.4231 as "$0.42", a
 * different price level, quietly. Drawing a wrong price is precisely what
 * decision D3 forbids, and the fallback made the "no fallback precision" rule
 * true of the order path only. There is now no fallback anywhere.
 *
 * The two unknowns are told apart, because they are different facts and the
 * call sites read differently: `NO_PRICE` means no price has arrived,
 * `NO_PRECISION` means one has but Kraken's rules for the pair have not.
 * `MarketSelector` shows `metadataError` beside the readout, so the second is
 * explained where there is room to explain it.
 */

/** No price to draw yet. */
export const NO_PRICE = "—";

/** A price, but no per-pair rule to draw it by. Never a number. */
export const NO_PRECISION = "n/a";

export const formatMarketPrice = (
  price: number | null,
  market?: ActiveMarket | null,
): string => {
  if (price === null || !Number.isFinite(price)) return NO_PRICE;

  const precision = market?.precision ?? null;
  if (!precision) return NO_PRECISION;

  const prefix = market?.market.quotePrefix ?? "$";
  const shown = roundToTick(price, precision.tickSize);

  return `${prefix}${shown.toLocaleString("en-US", {
    minimumFractionDigits: precision.priceDecimals,
    maximumFractionDigits: precision.priceDecimals,
  })}`;
};
