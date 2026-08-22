// =============================================================================
// MARKET FIXTURES - real Kraken precision records, for tests
// =============================================================================
//
// These are Kraken's own published numbers for these pairs, taken verbatim from
// `GET https://api.kraken.com/0/public/AssetPairs`. They are fixtures rather
// than a live call because CI must not depend on the exchange being reachable,
// and `assetMetadata.test.ts` covers the parse that turns a real response into
// one of these.
//
// They are here rather than inline in one test file because the point of them
// is the *spread*: BTC prices to one decimal and ARB to four, BTC's minimum
// order is 0.00005 and ARB's is 60. A test that only ever sees one of these
// cannot catch a formatter that has quietly defaulted to another pair's rules,
// which is the whole class of defect this app just made reachable.

import type { MarketPrecision } from "../types/markets";

/** pair_decimals 1, tick 0.1 - the coarsest price precision of the set. */
export const BTC_USD: MarketPrecision = {
  symbol: "BTC/USD",
  priceDecimals: 1,
  quantityDecimals: 8,
  tickSize: 0.1,
  orderMin: 0.00005,
  costMin: 0.5,
};

/** pair_decimals 2 - the precision the old magnitude heuristic got wrong. */
export const ETH_USD: MarketPrecision = {
  symbol: "ETH/USD",
  priceDecimals: 2,
  quantityDecimals: 8,
  tickSize: 0.01,
  orderMin: 0.001,
  costMin: 0.5,
};

/** pair_decimals 2 at a two-figure price, where magnitude would have said 4. */
export const SOL_USD: MarketPrecision = {
  symbol: "SOL/USD",
  priceDecimals: 2,
  quantityDecimals: 8,
  tickSize: 0.01,
  orderMin: 0.06,
  costMin: 0.5,
};

/** pair_decimals 4, lot_decimals 5, ordermin 60 - every field unlike BTC's. */
export const ARB_USD: MarketPrecision = {
  symbol: "ARB/USD",
  priceDecimals: 4,
  quantityDecimals: 5,
  tickSize: 0.0001,
  orderMin: 60,
  costMin: 0.5,
};

/** Same shape as ARB, and the second of the two layer twos on offer. */
export const OP_USD: MarketPrecision = {
  symbol: "OP/USD",
  priceDecimals: 4,
  quantityDecimals: 5,
  tickSize: 0.0001,
  orderMin: 60,
  costMin: 0.5,
};

export const ALL_MARKET_PRECISIONS: readonly MarketPrecision[] = [
  BTC_USD,
  ETH_USD,
  SOL_USD,
  ARB_USD,
  OP_USD,
];

// =============================================================================
// THE RESPONSE THOSE RECORDS ARE READ FROM
// =============================================================================
//
// A verbatim excerpt of
// `GET https://api.kraken.com/0/public/AssetPairs?pair=XBTUSD,ETHUSD,SOLUSD,ARBUSD,OPUSD`,
// trimmed to the fields this app reads. It lives beside the parsed records
// above so there is exactly one set of Kraken numbers in the suite: the parser
// test reads it directly, and `src/test/setup.ts` serves it to anything that
// mounts `MarketProvider`, so no test has to guess what Kraken would answer and
// none of them has to reach the exchange to find out.
//
// Note the spellings, which are the whole reason the parse is worth testing:
// Kraken keys BTC as `XXBTZUSD` and calls it `XBT/USD`, while SOL is plain
// `SOLUSD`. Neither is the `BTC/USD` this app uses.

export const KRAKEN_ASSET_PAIRS_RESPONSE = {
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
