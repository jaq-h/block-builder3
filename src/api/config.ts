/**
 * API Configuration
 * Loads Kraken API credentials from environment variables
 *
 * For local development, create a `local.env` file in the project root:
 * KRAKEN_API_KEY=your_api_key_here
 * KRAKEN_API_PRIVATE_KEY=your_api_private_key_here
 */

export interface KrakenConfig {
  apiKey: string;
  apiSecret: string;
  wsUrl: string;
  restUrl: string;
}

// Kraken API endpoints
const KRAKEN_WS_URL = "wss://ws-auth.kraken.com/v2";
const KRAKEN_REST_URL = "https://api.kraken.com";

// The credentials are baked into the bundle by `vite.config.ts` at build time,
// so they cannot change while the app is running. Resolving them once at module
// scope keeps `getKrakenConfig()` free to be called from render without either
// re-reading the environment or re-emitting the warning below on every call.
const config: KrakenConfig = {
  apiKey: import.meta.env.KRAKEN_API_KEY || "",
  apiSecret: import.meta.env.KRAKEN_API_PRIVATE_KEY || "",
  wsUrl: KRAKEN_WS_URL,
  restUrl: KRAKEN_REST_URL,
};

// Warn once, at import time, rather than once per call. Production intentionally
// runs without keys, so the warning would be pure noise there.
if (import.meta.env.DEV && (!config.apiKey || !config.apiSecret)) {
  console.warn(
    "Kraken API credentials not found. To enable API mode, create a local.env file with:\n" +
      "KRAKEN_API_KEY=your_api_key\n" +
      "KRAKEN_API_PRIVATE_KEY=your_api_private_key",
  );
}

/**
 * Get Kraken API configuration from environment variables
 */
export const getKrakenConfig = (): KrakenConfig => config;

/**
 * Check if API credentials are configured
 */
export const hasValidCredentials = (): boolean =>
  Boolean(config.apiKey && config.apiSecret);

/**
 * Default trading pair
 */
export const DEFAULT_SYMBOL = "BTC/USD";

/**
 * Validate that required configuration is present
 */
export const validateConfig = (): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!config.apiKey) {
    errors.push("KRAKEN_API_KEY is not set");
  }

  if (!config.apiSecret) {
    errors.push("KRAKEN_API_PRIVATE_KEY is not set");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
