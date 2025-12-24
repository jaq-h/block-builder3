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

/**
 * Get Kraken API configuration from environment variables
 * In Vite, environment variables must be prefixed with VITE_
 */
export const getKrakenConfig = (): KrakenConfig => {
  const apiKey = import.meta.env.KRAKEN_API_KEY || "";
  const apiSecret = import.meta.env.KRAKEN_API_PRIVATE_KEY || "";

  if (!apiKey || !apiSecret) {
    console.warn(
      "Kraken API credentials not found. Please create a local.env file with:\n" +
        "KRAKEN_API_KEY=your_api_key\n" +
        "KRAKEN_API_PRIVATE_KEY=your_api_private_key",
    );
  }

  return {
    apiKey,
    apiSecret,
    wsUrl: KRAKEN_WS_URL,
    restUrl: KRAKEN_REST_URL,
  };
};

/**
 * Check if API credentials are configured
 */
export const hasValidCredentials = (): boolean => {
  const config = getKrakenConfig();
  return Boolean(config.apiKey && config.apiSecret);
};

/**
 * Default trading pair
 */
export const DEFAULT_SYMBOL = "BTC/USD";

/**
 * Validate that required configuration is present
 */
export const validateConfig = (): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const config = getKrakenConfig();

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
