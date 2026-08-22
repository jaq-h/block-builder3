// =============================================================================
// MARKETS - what the app knows about a tradeable pair
// =============================================================================
//
// The app used to be BTC/USD and nothing else, so every rule that differs per
// pair - price precision, tick size, lot precision, the minimum order - was
// either hardcoded or inferred from the magnitude of a number. Those two types
// are what replace that: `Market` is the pair the user picked, and
// `MarketPrecision` is what *Kraken* says the rules for it are.
//
// The split is deliberate. A `Market` is static and shipped in the bundle,
// because the selector has to render before any network call resolves. A
// `MarketPrecision` is fetched, because guessing one sends an order Kraken
// rejects for bad precision - which reaches the user as an order that silently
// never appeared.

/**
 * A pair the app can trade.
 *
 * `symbol` is the Kraken **WebSocket v2** name (`BTC/USD`, not `XBTUSD`), and
 * it is this app's canonical id for a market: the ticker channel, the OHLC
 * channel and `OrderParams.symbol` all take it verbatim. The REST endpoints
 * want the legacy spelling instead, which `convertToKrakenPair` produces.
 */
export interface Market {
  symbol: string;
  /** Base asset, in the WebSocket v2 spelling. */
  base: string;
  /** Quote asset, in the WebSocket v2 spelling. */
  quote: string;
  /** What the selector calls it. */
  name: string;
  /**
   * What a price in this market is written in. Every market shipped today is
   * USD-quoted, so this is always `"$"` - it exists so that a market quoted in
   * anything else is a data change rather than a hunt through the formatters.
   */
  quotePrefix: string;
}

/**
 * The per-pair rules, taken from Kraken's own `/0/public/AssetPairs` metadata.
 *
 * Every field here differs between pairs, and every one of them was previously
 * a constant or a guess somewhere in this codebase:
 *
 * | | BTC/USD | ETH/USD | SOL/USD | ARB/USD |
 * |---|---|---|---|---|
 * | `priceDecimals` | 1 | 2 | 2 | 4 |
 * | `tickSize` | 0.1 | 0.01 | 0.01 | 0.0001 |
 * | `quantityDecimals` | 8 | 8 | 8 | 5 |
 * | `orderMin` | 0.00005 | 0.001 | 0.06 | 60 |
 *
 * There is deliberately no default and no fallback value for any of them. A
 * missing `MarketPrecision` is a state the callers handle - the order path
 * refuses to build a payload, the display formatter says the price is still
 * loading - rather than a reason to substitute BTC's numbers.
 */
export interface MarketPrecision {
  /** The WebSocket v2 symbol this describes, so a record cannot be misapplied. */
  symbol: string;
  /** Kraken's `pair_decimals`: how many decimals a price may carry. */
  priceDecimals: number;
  /** Kraken's `lot_decimals`: how many decimals a quantity may carry. */
  quantityDecimals: number;
  /** Kraken's `tick_size`: the price increment orders must land on. */
  tickSize: number;
  /** Kraken's `ordermin`: the smallest quantity the pair accepts. */
  orderMin: number;
  /**
   * Kraken's `costmin`: the smallest quantity x price the pair accepts.
   *
   * Recorded but not enforced. Cost needs a price, and a market order carries
   * none, so checking it would reject some order types and wave the others
   * through on the same strategy. Enforcing it means deciding what a market
   * order's cost is, which is a product question rather than a formatting one.
   *
   * Optional for the same reason it is unenforced: nothing reads it, so an
   * entry Kraken describes without it is still a fully priceable pair. It was
   * briefly required, which made a missing `costmin` discard the whole record -
   * no precision, no priceable grid, no orders - over the one field no code
   * path consults. Absent still means absent: no value is substituted.
   */
  costMin?: number;
}

/**
 * A market together with whatever Kraken has told us about it.
 *
 * `precision` is `null` until `/0/public/AssetPairs` answers. Callers must
 * treat that as "not known yet", never as "use the default", which is the whole
 * reason this is one value rather than two independent ones that can disagree.
 */
export interface ActiveMarket {
  market: Market;
  precision: MarketPrecision | null;
}
