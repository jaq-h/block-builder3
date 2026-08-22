/**
 * Kraken asset-pair metadata.
 *
 * `/0/public/AssetPairs` is Kraken's own statement of the rules for a pair:
 * how many decimals a price may carry (`pair_decimals`), the increment it must
 * land on (`tick_size`), how many decimals a quantity may carry
 * (`lot_decimals`) and the smallest order it accepts (`ordermin`). Every one of
 * those differs between pairs, and none of them is derivable from the symbol or
 * from the magnitude of a price.
 *
 * This is a public, unauthenticated endpoint on the host the CSP already allows
 * (`connect-src https://api.kraken.com`), so no new `connect-src` entry is
 * needed - see the README's **Security headers**.
 *
 * Nothing here invents a value. A pair Kraken does not describe simply has no
 * `MarketPrecision`, and the order path refuses to price it rather than
 * substituting another pair's rules.
 */

import { getKrakenConfig } from "./config";
import { convertToKrakenPair } from "./krakenRest";
import type { Market, MarketPrecision } from "../types/markets";

/** The subset of an AssetPairs entry this app reads. */
interface KrakenAssetPair {
  wsname?: string;
  altname?: string;
  pair_decimals?: number;
  lot_decimals?: number;
  tick_size?: string;
  ordermin?: string;
  costmin?: string;
}

interface AssetPairsResponse {
  error?: string[];
  result?: Record<string, KrakenAssetPair>;
}

/** A number Kraken sent as a string, or `undefined` if it is not usable. */
const numeric = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

/**
 * Which of our markets an AssetPairs entry describes.
 *
 * Kraken keys the result by its own legacy name (`XXBTZUSD`, `SOLUSD`) and
 * spells BTC as XBT in `wsname`, so neither the key nor `wsname` matches our
 * symbol directly for every pair. Matching on the request spelling we sent -
 * `convertToKrakenPair(symbol)`, checked against both the key and `altname` -
 * is the one comparison that holds for all of them, and it never has to guess
 * how a base asset is abbreviated.
 */
const marketForEntry = (
  key: string,
  entry: KrakenAssetPair,
  markets: readonly Market[],
): Market | undefined =>
  markets.find((market) => {
    const requested = convertToKrakenPair(market.symbol);
    return key === requested || entry.altname === requested;
  });

/**
 * Read an AssetPairs payload into one `MarketPrecision` per market it describes.
 *
 * An entry missing any field this app needs is skipped rather than filled in:
 * a half-known pair would price orders from whatever the defaults happened to
 * be, which is the failure this module exists to remove. A market that is
 * skipped simply stays unpriceable and says so.
 */
export const parseAssetPairs = (
  payload: unknown,
  markets: readonly Market[],
): Map<string, MarketPrecision> => {
  const precisions = new Map<string, MarketPrecision>();

  const result = (payload as AssetPairsResponse | null)?.result;
  if (!result || typeof result !== "object") return precisions;

  for (const [key, entry] of Object.entries(result)) {
    if (!entry || typeof entry !== "object") continue;

    const market = marketForEntry(key, entry, markets);
    if (!market) continue;

    const priceDecimals = numeric(entry.pair_decimals);
    const quantityDecimals = numeric(entry.lot_decimals);
    const tickSize = numeric(entry.tick_size);
    const orderMin = numeric(entry.ordermin);
    const costMin = numeric(entry.costmin);

    if (
      priceDecimals === undefined ||
      quantityDecimals === undefined ||
      tickSize === undefined ||
      tickSize <= 0 ||
      orderMin === undefined ||
      costMin === undefined
    ) {
      continue;
    }

    precisions.set(market.symbol, {
      symbol: market.symbol,
      priceDecimals,
      quantityDecimals,
      tickSize,
      orderMin,
      costMin,
    });
  }

  return precisions;
};

/**
 * Fetch the rules for every market in one request.
 *
 * One request for the whole catalogue rather than one per market: the metadata
 * changes about as often as Kraken lists a pair, and switching market must not
 * wait on a round trip before the grid can be priced.
 */
export const fetchMarketPrecisions = async (
  markets: readonly Market[],
): Promise<Map<string, MarketPrecision>> => {
  const { restUrl } = getKrakenConfig();
  const pairs = markets.map((market) => convertToKrakenPair(market.symbol));
  const url = `${restUrl}/0/public/AssetPairs?pair=${pairs.join(",")}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch asset metadata: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as AssetPairsResponse;
  if (payload.error && payload.error.length > 0) {
    throw new Error(`Kraken API error: ${payload.error.join(", ")}`);
  }

  return parseAssetPairs(payload, markets);
};
