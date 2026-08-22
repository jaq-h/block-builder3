/**
 * Client-side Kraken configuration.
 *
 * There are no credentials here, and there must never be any again. The API key
 * and private key live in the server-side environment that `api/` reads; this
 * bundle ships to every visitor, so anything it holds is public. Whether live
 * trading is available is not a client-side fact at all - ask `tradingMode.ts`,
 * which reports what the server said.
 */

export interface KrakenConfig {
  restUrl: string;
}

// The WebSocket URLs live in `krakenWebSocket.ts`, which is the only module that
// opens a socket; a second copy here was dead the moment it was written.
const KRAKEN_REST_URL = "https://api.kraken.com";

const config: KrakenConfig = {
  restUrl: KRAKEN_REST_URL,
};

/**
 * Endpoints the browser talks to directly. Only public, unauthenticated calls
 * go to `restUrl` from here; everything authenticated goes through this app's
 * own `/api/kraken/*` endpoints instead.
 */
export const getKrakenConfig = (): KrakenConfig => config;

/**
 * Default trading pair
 */
export const DEFAULT_SYMBOL = "BTC/USD";
