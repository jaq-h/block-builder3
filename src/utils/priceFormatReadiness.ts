// =============================================================================
// PRICE FORMAT READINESS - the single owner of whether a price can be written
// =============================================================================
//
// Every surface that puts a price on screen has to answer one question first:
// do we know how to write a number for the selected pair? The answer has three
// values, not two, and six surfaces used to work it out for themselves - the
// selector readout and its warning, the grid chips, the read-only cards, the
// chart's axis and crosshair, the order price lines, and the order path's
// refusal.
//
// That split produced the same defect four review rounds running. Each fix was
// right about its own surface and taught the next one nothing: candle
// `setData`, then the order price lines, then `useLightweightChart`'s
// `priceFormat`, then the window before the metadata request settles. There was
// always another surface because readiness was re-derived per surface rather
// than owned once. So it is owned here, and every surface consumes it.
//
// **The three states are distinct, and collapsing any two is the defect.**
//
//   - `pending`     - the AssetPairs request has not answered. Nothing is known
//                     yet, so nothing may be presented as known.
//   - `ready`       - Kraken's rules for this pair are in hand. This is the one
//                     state carrying a `MarketPrecision`, so a caller that has
//                     one has been through here.
//   - `unavailable` - the request settled without rules for this pair: it
//                     answered and described none, or it failed outright. A
//                     surface has the same thing to do in either, which is why
//                     they are one state. It does not mean rules can never
//                     arrive: a failed request still has the provider's retry
//                     chain and its focus and `online` listeners behind it.
//
// `pending` and `unavailable` are the pair that keeps being collapsed, and the
// collapse is what draws a confident wrong value during loading: before this
// existed the chart series carried lightweight-charts' own `precision: 2,
// minMove: 0.01`, so selecting ARB/USD while the request was in flight drew an
// axis, a crosshair and every order label reading "0.42" for a 0.4231 price.
//
// **The two ingredients are not exported and must not be reconstructed.** The
// readiness is a function of the precision-or-null and whether the request has
// answered; a module holding either of those separately is a second owner of
// this question. That is put out of reach repository-wide rather than checked
// per surface, and it is the guard that matters here - a test naming today's
// surfaces only catches today's surfaces, and the whole history of this defect
// is a surface nobody had thought of yet. Four reach rules in
// `eslint.config.js` hold the ingredients out of `src/`, each with its own
// allowlist and reason - the settled flag, an absent-able `MarketPrecision`,
// the catalogue fetch, and the batch's load error, which is the readiness proxy
// that was tried and was wrong in both directions. One runtime assertion in
// `priceFormatReadiness.test.ts` carries what a linter cannot read: that the
// context value itself holds the tri-state and neither ingredient.
//
// The *formatting* itself stays with `marketFormat.ts`, which owns how many
// decimals a pair takes. This module owns whether that question has an answer.

import type { Market, MarketPrecision } from "../types/markets";

/**
 * Whether the selected pair's prices can be written, and at what precision.
 *
 * The market travels with it in every state so a consumer needs no second
 * value: the quote prefix is needed to draw a price and the symbol is needed to
 * name the pair in a refusal, and a consumer holding the readiness beside a
 * separately-sourced market is a consumer that can pair one pair's rules with
 * another pair's name during a switch.
 */
export type PriceFormatReadiness =
  | {
      /** Kraken has not answered yet. Not the same as having no rules. */
      readonly status: "pending";
      readonly market: Market;
    }
  | {
      /** Kraken's rules for this pair, in hand. */
      readonly status: "ready";
      readonly market: Market;
      readonly precision: MarketPrecision;
    }
  | {
      /**
       * The request settled without rules for this pair, by either route: it
       * answered and described none, or it failed outright. There is nothing to
       * draw with now; a failed request may still recover through the
       * provider's retries.
       */
      readonly status: "unavailable";
      readonly market: Market;
    };

/**
 * The one derivation, from the two facts the market store holds.
 *
 * `settled` is "has the AssetPairs request answered at all, either way". It is
 * a parameter rather than something read here because the request belongs to
 * `MarketProvider`; it is passed straight in and never leaves that file, which
 * is what stops a second module keeping its own copy of it.
 */
export const priceFormatReadiness = (
  market: Market,
  precision: MarketPrecision | null,
  settled: boolean,
): PriceFormatReadiness => {
  if (precision) return { status: "ready", market, precision };
  return settled
    ? { status: "unavailable", market }
    : { status: "pending", market };
};

/**
 * The pair's rules, or `null` where there are none to be had *yet or ever*.
 *
 * For a caller that must refuse in both unready states and has nothing
 * different to do in either - the order path is the example, because a payload
 * cannot be built without rules whatever the reason. A caller that draws
 * something has to tell them apart and reads `status` instead.
 */
export const precisionOf = (
  readiness: PriceFormatReadiness,
): MarketPrecision | null =>
  readiness.status === "ready" ? readiness.precision : null;

/** The readiness a consumer mounted outside a `MarketProvider` sees. */
export const pendingPriceFormat = (market: Market): PriceFormatReadiness => ({
  status: "pending",
  market,
});
