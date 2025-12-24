/**
 * Kraken REST API utilities
 * Handles public API calls like ticker data
 */

import { getKrakenConfig, DEFAULT_SYMBOL } from './config';
import type { TickerResponse, ParsedTickerData, AssetTickerInfo } from './types';

/**
 * Fetch ticker data for a trading pair
 * This is a public endpoint and does not require authentication
 */
export const fetchTicker = async (symbol: string = DEFAULT_SYMBOL): Promise<TickerResponse> => {
  const config = getKrakenConfig();
  // Convert symbol format: "BTC/USD" -> "XBTUSD" for Kraken API
  const krakenPair = convertToKrakenPair(symbol);

  const url = `${config.restUrl}/0/public/Ticker?pair=${krakenPair}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ticker: ${response.status} ${response.statusText}`);
  }

  const data: TickerResponse = await response.json();

  if (data.error && data.error.length > 0) {
    throw new Error(`Kraken API error: ${data.error.join(', ')}`);
  }

  return data;
};

/**
 * Convert standard symbol format to Kraken pair format
 * e.g., "BTC/USD" -> "XBTUSD", "ETH/USD" -> "ETHUSD"
 */
export const convertToKrakenPair = (symbol: string): string => {
  // Remove slash and handle special cases
  const normalized = symbol.replace('/', '');

  // Kraken uses XBT instead of BTC
  return normalized.replace('BTC', 'XBT');
};

/**
 * Convert Kraken pair format back to standard symbol
 * e.g., "XXBTZUSD" -> "BTC/USD", "XETHZUSD" -> "ETH/USD"
 */
export const convertFromKrakenPair = (krakenPair: string): string => {
  // Handle Kraken's extended format (e.g., XXBTZUSD, XETHZUSD)
  let pair = krakenPair;

  // Remove leading X and Z prefixes if present
  if (pair.startsWith('X') && pair.length > 6) {
    pair = pair.substring(1);
  }
  if (pair.includes('Z') && pair.length > 6) {
    pair = pair.replace('Z', '');
  }

  // Convert XBT back to BTC
  pair = pair.replace('XBT', 'BTC');

  // Insert slash before the quote currency (USD, EUR, etc.)
  const quoteCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
  for (const quote of quoteCurrencies) {
    if (pair.endsWith(quote)) {
      const base = pair.slice(0, -quote.length);
      return `${base}/${quote}`;
    }
  }

  return pair;
};

/**
 * Parse raw ticker data into a more usable format
 */
export const parseTickerData = (
  symbol: string,
  tickerInfo: AssetTickerInfo
): ParsedTickerData => {
  const ask = parseFloat(tickerInfo.a[0]);
  const bid = parseFloat(tickerInfo.b[0]);
  const last = parseFloat(tickerInfo.c[0]);
  const open = parseFloat(tickerInfo.o);
  const high24h = parseFloat(tickerInfo.h[1]);
  const low24h = parseFloat(tickerInfo.l[1]);
  const volume24h = parseFloat(tickerInfo.v[1]);
  const vwap24h = parseFloat(tickerInfo.p[1]);
  const trades24h = tickerInfo.t[1];

  const change24h = last - open;
  const changePercent24h = open > 0 ? ((last - open) / open) * 100 : 0;

  return {
    symbol,
    ask,
    bid,
    last,
    volume24h,
    vwap24h,
    high24h,
    low24h,
    open,
    trades24h,
    change24h,
    changePercent24h,
  };
};

/**
 * Fetch and parse ticker data for a trading pair
 * Returns parsed data ready for UI consumption
 */
export const getTickerData = async (symbol: string = DEFAULT_SYMBOL): Promise<ParsedTickerData> => {
  const response = await fetchTicker(symbol);

  // Get the first (and usually only) result
  const pairs = Object.keys(response.result);
  if (pairs.length === 0) {
    throw new Error(`No ticker data found for ${symbol}`);
  }

  const krakenPair = pairs[0];
  const tickerInfo = response.result[krakenPair];

  return parseTickerData(symbol, tickerInfo);
};

/**
 * Get the current market price (last traded price) for a symbol
 */
export const getCurrentPrice = async (symbol: string = DEFAULT_SYMBOL): Promise<number> => {
  const tickerData = await getTickerData(symbol);
  return tickerData.last;
};

/**
 * Get bid/ask spread for a symbol
 */
export const getSpread = async (symbol: string = DEFAULT_SYMBOL): Promise<{ bid: number; ask: number; spread: number; spreadPercent: number }> => {
  const tickerData = await getTickerData(symbol);
  const spread = tickerData.ask - tickerData.bid;
  const spreadPercent = (spread / tickerData.ask) * 100;

  return {
    bid: tickerData.bid,
    ask: tickerData.ask,
    spread,
    spreadPercent,
  };
};

/**
 * Format price for display with appropriate decimal places
 */
export const formatPrice = (price: number, symbol: string = DEFAULT_SYMBOL): string => {
  // Determine decimal places based on the asset
  const decimals = symbol.includes('BTC') || symbol.includes('XBT') ? 2 :
                   symbol.includes('ETH') ? 2 :
                   price < 1 ? 6 : 2;

  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Format percentage change for display
 */
export const formatPercentChange = (percent: number): string => {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
};
