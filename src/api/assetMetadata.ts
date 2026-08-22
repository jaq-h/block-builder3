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
 *
 * `costmin` is not one of those fields. Nothing enforces it - see
 * `MarketPrecision.costMin` - so an entry without it still prices every order
 * this app can build, and discarding the pair over it would disable a market
 * Kraken has fully described.
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
      orderMin === undefined
    ) {
      continue;
    }

    precisions.set(market.symbol, {
      symbol: market.symbol,
      priceDecimals,
      quantityDecimals,
      tickSize,
      orderMin,
      ...(costMin !== undefined && { costMin }),
    });
  }

  return precisions;
};

/**
 * How long a request is given before it is treated as having failed.
 *
 * `fetch` has no timeout of its own, so a black-holed request - a captive
 * portal, a dropped TCP connection - hangs for as long as the browser is
 * willing to wait. That matters more here than the usual amount: until this
 * request answers, "this pair has no rules yet" and "this pair has no rules"
 * are indistinguishable, and every surface that draws a price has to choose
 * between waiting and inventing a width. An unbounded wait is what turns that
 * transient window into a permanent one.
 *
 * Generous rather than tight, because the point is to bound the pathological
 * case and not to fail a slow-but-working connection.
 */
export const METADATA_TIMEOUT_MS = 20_000;

/**
 * Fetch the rules for every market in one request.
 *
 * One request for the whole catalogue rather than one per market: the metadata
 * changes about as often as Kraken lists a pair, and switching market must not
 * wait on a round trip before the grid can be priced.
 *
 * A hung request resolves into the ordinary failure path - the caller's retry,
 * its backoff and its recovery on focus and on `online` - rather than leaving
 * the app waiting. `signal` lets the caller abandon one it no longer wants, so
 * an unmounted provider does not leave a request on the wire.
 */
export const fetchMarketPrecisions = async (
  markets: readonly Market[],
  signal?: AbortSignal,
): Promise<Map<string, MarketPrecision>> => {
  const { restUrl } = getKrakenConfig();
  const pairs = markets.map((market) => convertToKrakenPair(market.symbol));
  const url = `${restUrl}/0/public/AssetPairs?pair=${pairs.join(",")}`;

  // One controller for both reasons a request can be abandoned - the timeout
  // below and the caller's own signal - because `fetch` takes exactly one.
  const controller = new AbortController();
  const abortForCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortForCaller);

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, METADATA_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
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
  } catch (error) {
    // The abort itself says only "aborted", which reads as a bug rather than
    // as the network never answering. Once the timer has fired the request was
    // already abandoned, so this is the honest headline for anything that
    // comes back afterwards.
    if (timedOut) {
      throw new Error(
        `Timed out fetching asset metadata after ${METADATA_TIMEOUT_MS / 1000}s`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortForCaller);
  }
};
