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
// So the guards below are structural and repository-wide. They are stated as
// what a module may not do rather than as a list of the modules doing it right,
// and each names the ingredient it protects:
//
//   1. The settled flag - "has the AssetPairs request answered" - is named
//      nowhere but the provider that holds it.
//   2. A `MarketPrecision` that may be absent is declared nowhere but the four
//      places that legitimately handle one, each named with its reason.
//   3. The metadata is fetched by the provider and by nothing else, so no
//      surface can go and get its own rules.
//   4. The context carries the tri-state and neither of the two facts it is
//      folded from, so there is nothing on it to recombine.
//
// Together those are the whole surface area: readiness is a function of exactly
// those two ingredients, and a module that can reach neither cannot form a
// second opinion about it. The type system carries the rest - `precisionOf` and
// `formatMarketPrice` take a `PriceFormatReadiness`, which only this module
// makes.
//
// **What these guards do not cover**, stated so the next reader knows the
// holes: they read source text, so a module that reaches an ingredient by a
// name none of these patterns spell - a re-export under a different name, a
// value pulled out of a `Map` typed loosely - passes. And they say nothing
// about a surface *rendering* the wrong thing for a state it read correctly;
// that is each surface's own test.

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

/**
 * Every module the app ships, as source text.
 *
 * `import.meta.glob` rather than `node:fs` because `src` is typechecked without
 * node types - the same constraint that put `vite/buttonResetLayer.test.ts` in
 * `vite/`. Vite's own raw import has no such problem, so this guard can sit
 * with the module that owns the fact, which is where this repository keeps a
 * repository-wide test.
 */
const sources = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Test files and test helpers build these facts on purpose; they are not surfaces. */
const isProductCode = (path: string): boolean =>
  !/\.test\.tsx?$/.test(path) && !path.startsWith("/src/test/");

/**
 * The code, without the prose about it.
 *
 * These guards are about what a module *does*, and this repository explains
 * defects where they were fixed - so the retired shape is named in a comment in
 * more than one file, and a scan that read those would fail for the very
 * paragraphs that record why the rule exists. Pressuring the next author to stop
 * writing them down would be a worse outcome than the hole this leaves, which is
 * a derivation hidden inside a string literal that happens to look like a type
 * annotation.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const productModules = Object.entries(sources)
  .filter(([path]) => isProductCode(path))
  .map(([path, source]) => [path, withoutComments(source)] as const);

/** Which modules mention a pattern, minus the ones allowed to. */
const offenders = (pattern: RegExp, allowed: readonly string[]): string[] =>
  productModules
    .filter(([path]) => !allowed.includes(path))
    .filter(([, source]) => pattern.test(source))
    .map(([path]) => path)
    .sort();

describe("no module outside the owner derives readiness", () => {
  it("has product modules to scan at all", () => {
    // A glob that silently matched nothing would make every check below pass
    // for the wrong reason, which is the failure mode an absence check has.
    expect(productModules.length).toBeGreaterThan(50);
    expect(productModules.map(([path]) => path)).toContain(
      "/src/utils/priceFormatReadiness.ts",
    );
  });

  // Ingredient one. "Has the AssetPairs request answered, either way" is the
  // fact that separates "not known yet" from "known to be absent", and it is
  // held as state by the provider, passed straight into the fold, and never
  // exposed. A module naming it has either put it back on the context or grown
  // a second copy of it, and both end in a surface judging readiness itself.
  it("names the settled flag nowhere but the provider that holds it", () => {
    expect(
      offenders(/metadataSettled/, ["/src/store/MarketProvider.tsx"]),
    ).toEqual([]);
  });

  // Ingredient two. A precision that may be absent is half the readiness; the
  // other half is why it is absent. Four modules handle one legitimately:
  //
  //   - the owner, which takes it as the fold's input and hands it back out of
  //     the `ready` state through `precisionOf`;
  //   - the provider, whose `Map` is missing an entry for a pair Kraken did not
  //     describe - that map IS the raw fact, and it does not leave the file;
  //   - the metadata parser, which produces the records and skips an entry it
  //     cannot read;
  //   - `orderMapper.validateOrder`, whose precision is an optional argument to
  //     a pure validator rather than held state. It is the last line of defence
  //     and runs after `useKrakenAPI` has already refused a grid it has no
  //     rules for, so it has no readiness to decide: absent means "check what
  //     can be checked without per-pair rules", the same in both unready
  //     states.
  //
  // A fifth is a second owner of the question and fails here.
  it("declares an absent-able precision nowhere but the four that handle one", () => {
    const nullablePrecision =
      /(MarketPrecision\s*\|\s*(null|undefined))|((null|undefined)\s*\|\s*MarketPrecision)|(precision\?\s*:)|(market\?\s*:\s*MarketPrecision)/;

    expect(
      offenders(nullablePrecision, [
        "/src/utils/priceFormatReadiness.ts",
        "/src/store/MarketProvider.tsx",
        "/src/api/assetMetadata.ts",
        "/src/api/orderMapper.ts",
      ]),
    ).toEqual([]);
  });

  // A surface that fetched its own rules would hold both ingredients at once
  // and answer the whole question privately, with nothing above catching it.
  // The catalogue is fetched once, by the provider, for exactly that reason.
  it("lets the provider alone fetch the metadata", () => {
    expect(
      offenders(/fetchMarketPrecisions/, [
        "/src/store/MarketProvider.tsx",
        "/src/api/assetMetadata.ts",
        "/src/api/index.ts",
      ]),
    ).toEqual([]);
  });

  // The batch's load error is the readiness proxy that was tried and was wrong
  // in both directions: a batch answering without one pair sets no error while
  // that pair has no rules, and a later failure sets one over pairs whose rules
  // are in hand. It stays on the context as a message, and a surface reaching
  // for it to decide whether a price can be drawn fails here.
  it("keeps the batch's load error out of every surface", () => {
    expect(
      offenders(/metadataError/, [
        "/src/store/MarketProvider.tsx",
        "/src/store/MarketContext.ts",
      ]),
    ).toEqual([]);
  });

  // Ingredient four, and the most likely regression: re-adding a raw fact to
  // the context, which puts it within reach of every surface at once. Read off
  // the real default value rather than the type, because a type assertion is
  // not something a running consumer can destructure.
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
