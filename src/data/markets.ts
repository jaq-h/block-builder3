// =============================================================================
// MARKET CATALOGUE - the pairs this app offers
// =============================================================================
//
// The one list of tradeable markets, in the order the selector shows them.
//
// Everything here is static and shipped in the bundle, because the selector has
// to render before any network call resolves. Nothing here is a trading *rule*:
// price precision, tick size and the minimum order are per-pair facts that come
// from Kraken's own metadata (`src/api/assetMetadata.ts`), never from this file
// and never from the shape of a symbol string.
//
// Adding a market is this list plus nothing else, provided the pair exists on
// Kraken with the same WebSocket v2 spelling. `assetMetadata.test.ts` pins the
// symbols against Kraken's own naming so a typo fails in CI rather than
// becoming an empty ticker in the browser.

import type { Market } from "../types/markets";

export const MARKETS: readonly Market[] = [
  {
    symbol: "BTC/USD",
    base: "BTC",
    quote: "USD",
    name: "Bitcoin",
    quotePrefix: "$",
  },
  {
    symbol: "ETH/USD",
    base: "ETH",
    quote: "USD",
    name: "Ethereum",
    quotePrefix: "$",
  },
  {
    symbol: "SOL/USD",
    base: "SOL",
    quote: "USD",
    name: "Solana",
    quotePrefix: "$",
  },
  {
    symbol: "ARB/USD",
    base: "ARB",
    quote: "USD",
    name: "Arbitrum",
    quotePrefix: "$",
  },
  {
    symbol: "OP/USD",
    base: "OP",
    quote: "USD",
    name: "Optimism",
    quotePrefix: "$",
  },
] as const;

/**
 * The market the app opens on.
 *
 * This is the *only* place a symbol is chosen without the user choosing it.
 * Every other module takes the market it was handed: there is no
 * `symbol = DEFAULT` parameter default left anywhere, because that is precisely
 * how a trigger price came to be formatted for BTC inside an ETH payload.
 */
export const DEFAULT_MARKET: Market = MARKETS[0];

/** The market with this WebSocket v2 symbol, or `undefined` if we ship none. */
export const findMarket = (symbol: string): Market | undefined =>
  MARKETS.find((market) => market.symbol === symbol);
