import { describe, it, expect } from "vitest";

import {
  priceFormatReadiness,
  precisionOf,
  pendingPriceFormat,
} from "./priceFormatReadiness";
import { MarketContext } from "@store/MarketContext";
import { findMarket } from "@data/markets";
import { ARB_USD } from "@/test/marketFixtures";

// =============================================================================
// PRICE FORMAT READINESS HAS ONE OWNER
// =============================================================================
//
// Two things are pinned here, and the second is the point of the file.
//
// The first is the fold itself: three states, told apart, from the two facts
// the market store holds.
//
// The second is that **nothing else in the app performs that fold**. This
// defect class was found on four consecutive review rounds of the multi-pair
// work - candle `setData`, then the order price lines, then the chart series'
// `priceFormat`, then the window before the metadata settles - and every one of
// those fixes was correct about the surface it touched. There was always
// another one because each surface decided for itself whether it could format a
// price, so a fix taught the next surface nothing. A test naming today's
// surfaces would have passed after each of those four rounds and caught none of
// the next; what has to fail is a *new* surface deriving readiness of its own.
//
// **Most of that guard is not in this file, and deliberately so.** Readiness is
// a function of exactly two ingredients - the precision-or-absent and whether
// the AssetPairs request has answered - so putting those out of reach
// repository-wide is what stops a second opinion forming. Three of the four
// reach rules live in `eslint.config.js`, as `no-restricted-syntax` and
// `no-restricted-imports` over the TypeScript AST, each with the allowlist and
// the reason each allowed file legitimately handles an ingredient:
//
//   1. The settled flag - "has the AssetPairs request answered" - is named
//      nowhere but the provider that holds it.
//   2. A `MarketPrecision` that may be absent is declared nowhere but the four
//      places that legitimately handle one.
//   3. The metadata is fetched by the provider and by nothing else, so no
//      surface can go and get its own rules.
//
// The fourth stays here, because it is the one a linter cannot state: that the
// **context value itself** carries the tri-state and neither of the two facts
// it is folded from, read off the real default value rather than off a type.
// That is also the most likely regression route, since re-adding a raw
// ingredient to the context puts it within reach of every surface at once.
//
// Together those are the whole surface area: a module that can reach neither
// ingredient cannot form a second opinion. The type system carries the rest -
// `precisionOf` and `formatMarketPrice` take a `PriceFormatReadiness`, which
// only this module makes.
//
// **What the guards do not cover**, stated so the next reader knows the holes:
// a module that reaches an ingredient under a name none of the rules spell - a
// re-export renamed on its way out, a value pulled from a loosely typed `Map` -
// passes. And they say nothing about a surface *rendering* the wrong thing for
// a state it read correctly; that is each surface's own test.

const market = findMarket("ARB/USD")!;

describe("the three states", () => {
  it("is pending while the request has not answered", () => {
    const readiness = priceFormatReadiness(market, null, false);

    expect(readiness.status).toBe("pending");
    expect(precisionOf(readiness)).toBeNull();
  });

  // The state that is not the one above, and the whole reason there are three.
  // Collapsed together, a surface either refuses on every page load or draws a
  // confident number at a width the app does not have for the pair.
  it("is unavailable once the request has answered without the pair", () => {
    const readiness = priceFormatReadiness(market, null, true);

    expect(readiness.status).toBe("unavailable");
    expect(precisionOf(readiness)).toBeNull();
  });

  it("is ready, and carries the rules, once Kraken has described the pair", () => {
    const readiness = priceFormatReadiness(market, ARB_USD, true);

    expect(readiness.status).toBe("ready");
    expect(precisionOf(readiness)).toBe(ARB_USD);
  });

  // Rules in hand before the batch is marked settled is not a state the
  // provider produces today, but it is one an ordering change could produce,
  // and the answer must be "ready": there is a precision, so there is a width
  // to draw at, and refusing would be refusing over a fact we have.
  it("is ready on rules alone, whatever the request has done since", () => {
    expect(priceFormatReadiness(market, ARB_USD, false).status).toBe("ready");
  });

  it("carries the market in every state, so no caller needs a second value", () => {
    expect(priceFormatReadiness(market, null, false).market).toBe(market);
    expect(priceFormatReadiness(market, null, true).market).toBe(market);
    expect(priceFormatReadiness(market, ARB_USD, true).market).toBe(market);
  });

  it("opens pending, which is what a consumer outside a provider sees", () => {
    expect(pendingPriceFormat(market)).toEqual({ status: "pending", market });
  });
});

// =============================================================================
// NOTHING ELSE DERIVES IT
// =============================================================================

describe("no module outside the owner derives readiness", () => {
  // The regression the reach rules in `eslint.config.js` cannot state: re-adding
  // a raw fact to the context, which puts it within reach of every surface at
  // once. Read off the real default value rather than the type, because a type
  // assertion is not something a running consumer can destructure, and a key
  // added to the value without the type would slip past a type-level check.
  it("carries the tri-state on the context and neither ingredient", () => {
    // A `createContext` default is the value a consumer outside a provider
    // gets, and it is the same shape the provider supplies.
    const contextDefault = (
      MarketContext as unknown as { _currentValue: Record<string, unknown> }
    )._currentValue;

    expect(Object.keys(contextDefault).sort()).toEqual([
      "market",
      "markets",
      "metadataError",
      "priceFormat",
      "selectMarket",
    ]);
    expect(contextDefault.priceFormat).toEqual(
      pendingPriceFormat(contextDefault.market as never),
    );
  });
});
