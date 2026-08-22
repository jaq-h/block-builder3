import { describe, it, expect } from "vitest";

import { parseAssetPairs } from "@api/assetMetadata";
import { convertToKrakenPair } from "@api/krakenRest";
import { MARKETS } from "@data/markets";

// =============================================================================
// ASSET METADATA
// =============================================================================
//
// Precision, tick size and the minimum order are Kraken's facts, not ours, and
// the whole point of fetching them is that they cannot be guessed from a symbol
// string. What can go wrong is the *reading*: Kraken keys its result by its own
// legacy names, spells BTC as XBT in some fields and not others, and sends
// every number as a string.
//
// The payload below is a verbatim excerpt of
// `GET https://api.kraken.com/0/public/AssetPairs?pair=XBTUSD,ETHUSD,SOLUSD,ARBUSD,OPUSD`,
// trimmed to the fields this app reads. It is a fixture rather than a live call
// because CI must not depend on the exchange being reachable.

const KRAKEN_RESPONSE = {
  error: [],
  result: {
    XXBTZUSD: {
      altname: "XBTUSD",
      wsname: "XBT/USD",
      pair_decimals: 1,
      lot_decimals: 8,
      tick_size: "0.1",
      ordermin: "0.00005",
      costmin: "0.5",
    },
    XETHZUSD: {
      altname: "ETHUSD",
      wsname: "ETH/USD",
      pair_decimals: 2,
      lot_decimals: 8,
      tick_size: "0.01",
      ordermin: "0.001",
      costmin: "0.5",
    },
    SOLUSD: {
      altname: "SOLUSD",
      wsname: "SOL/USD",
      pair_decimals: 2,
      lot_decimals: 8,
      tick_size: "0.01",
      ordermin: "0.06",
      costmin: "0.5",
    },
    ARBUSD: {
      altname: "ARBUSD",
      wsname: "ARB/USD",
      pair_decimals: 4,
      lot_decimals: 5,
      tick_size: "0.0001",
      ordermin: "60",
      costmin: "0.5",
    },
    OPUSD: {
      altname: "OPUSD",
      wsname: "OP/USD",
      pair_decimals: 4,
      lot_decimals: 5,
      tick_size: "0.0001",
      ordermin: "60",
      costmin: "0.5",
    },
  },
};

describe("parseAssetPairs", () => {
  it("reads a record for every market the app offers", () => {
    const precisions = parseAssetPairs(KRAKEN_RESPONSE, MARKETS);

    expect([...precisions.keys()].sort()).toEqual(
      MARKETS.map((market) => market.symbol).sort(),
    );
  });

  // Kraken's own numbers, and the reason the app cannot infer any of them: no
  // two of these pairs agree on all four, and the spread of `ordermin` alone is
  // six orders of magnitude.
  it("carries Kraken's own per-pair rules through unchanged", () => {
    const precisions = parseAssetPairs(KRAKEN_RESPONSE, MARKETS);

    expect(precisions.get("BTC/USD")).toEqual({
      symbol: "BTC/USD",
      priceDecimals: 1,
      quantityDecimals: 8,
      tickSize: 0.1,
      orderMin: 0.00005,
      costMin: 0.5,
    });
    expect(precisions.get("ARB/USD")).toEqual({
      symbol: "ARB/USD",
      priceDecimals: 4,
      quantityDecimals: 5,
      tickSize: 0.0001,
      orderMin: 60,
      costMin: 0.5,
    });
  });

  // The one that has to be right for BTC. Kraken keys this pair `XXBTZUSD` and
  // its `wsname` is `XBT/USD`, neither of which is the `BTC/USD` this app uses.
  // Matching on the spelling we *requested* is what holds for every pair
  // without knowing how any base asset is abbreviated.
  it("matches a pair whose Kraken spelling is not the app's", () => {
    const precisions = parseAssetPairs(KRAKEN_RESPONSE, MARKETS);
    const btc = precisions.get("BTC/USD");

    expect(btc?.symbol).toBe("BTC/USD");
    expect(convertToKrakenPair("BTC/USD")).toBe("XBTUSD");
  });

  it("takes numbers Kraken sends as strings", () => {
    const precisions = parseAssetPairs(KRAKEN_RESPONSE, MARKETS);

    expect(typeof precisions.get("SOL/USD")?.tickSize).toBe("number");
    expect(typeof precisions.get("SOL/USD")?.orderMin).toBe("number");
  });

  // A half-known pair would price orders from whatever the missing field
  // defaulted to, which is the guess this whole module exists to remove. Better
  // to have no record and refuse: the pair is simply not priceable.
  it("skips a pair that is missing any rule it needs, rather than filling it in", () => {
    const partial = {
      result: {
        ARBUSD: {
          altname: "ARBUSD",
          wsname: "ARB/USD",
          pair_decimals: 4,
          lot_decimals: 5,
          // no tick_size
          ordermin: "60",
          costmin: "0.5",
        },
        SOLUSD: KRAKEN_RESPONSE.result.SOLUSD,
      },
    };

    const precisions = parseAssetPairs(partial, MARKETS);

    expect(precisions.has("ARB/USD")).toBe(false);
    expect(precisions.has("SOL/USD")).toBe(true);
  });

  it("skips a tick size of zero, which cannot snap anything", () => {
    const zeroTick = {
      result: {
        SOLUSD: { ...KRAKEN_RESPONSE.result.SOLUSD, tick_size: "0" },
      },
    };

    expect(parseAssetPairs(zeroTick, MARKETS).has("SOL/USD")).toBe(false);
  });

  it("ignores a pair the app does not offer", () => {
    const extra = {
      result: {
        ...KRAKEN_RESPONSE.result,
        DOGEUSD: {
          altname: "XDGUSD",
          wsname: "DOGE/USD",
          pair_decimals: 7,
          lot_decimals: 8,
          tick_size: "0.0000001",
          ordermin: "20",
          costmin: "0.5",
        },
      },
    };

    expect(parseAssetPairs(extra, MARKETS).has("DOGE/USD")).toBe(false);
  });

  it("survives a payload that is not the shape it expected", () => {
    expect(parseAssetPairs(null, MARKETS).size).toBe(0);
    expect(parseAssetPairs({}, MARKETS).size).toBe(0);
    expect(parseAssetPairs({ result: "nope" }, MARKETS).size).toBe(0);
    expect(parseAssetPairs({ result: { SOLUSD: null } }, MARKETS).size).toBe(0);
  });
});

// =============================================================================
// THE CATALOGUE ITSELF
// =============================================================================

describe("the market catalogue", () => {
  // Every symbol here is sent verbatim as a Kraken WebSocket v2 channel name
  // and as `OrderParams.symbol`, so a typo is an empty ticker in the browser
  // rather than an error anywhere.
  it("spells every symbol as base/quote", () => {
    MARKETS.forEach((market) => {
      expect(market.symbol).toBe(`${market.base}/${market.quote}`);
      expect(market.symbol).toMatch(/^[A-Z0-9]+\/[A-Z]+$/);
    });
  });

  it("offers no market twice", () => {
    const symbols = MARKETS.map((market) => market.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  // Every one of them is described by the fixture above, which is a real Kraken
  // response - so adding a market without checking Kraken lists it fails here.
  it("offers only pairs Kraken describes", () => {
    const precisions = parseAssetPairs(KRAKEN_RESPONSE, MARKETS);
    MARKETS.forEach((market) => {
      expect(precisions.has(market.symbol)).toBe(true);
    });
  });
});
