/**
 * Kraken API Module
 * Barrel export for all API utilities
 */

// Configuration
export { getKrakenConfig, DEFAULT_SYMBOL, type KrakenConfig } from './config';

// Trading mode - the server's answer to "may this deployment trade for real?"
export {
  getTradingModeStatus,
  isLiveTradingAvailable,
  loadTradingMode,
  subscribeTradingMode,
  resetTradingMode,
  STATUS_ENDPOINT,
  type TradingMode,
  type TradingModeStatus,
} from './tradingMode';

// Server-side Kraken calls (signed by `api/`, never by the browser)
export { getWebSocketToken, WS_TOKEN_ENDPOINT, type Balances } from './krakenServer';

// REST API
export {
  fetchTicker,
  getTickerData,
  getCurrentPrice,
  getSpread,
  parseTickerData,
  convertToKrakenPair,
  convertFromKrakenPair,
  formatPrice,
  formatPercentChange,
} from './krakenRest';

// WebSocket
export {
  KrakenWebSocketManager,
  getWebSocketManager,
  resetWebSocketManager,
  type WebSocketEventType,
  type WebSocketEventHandler,
  type WebSocketErrorEvent,
  type SocketKind,
} from './krakenWebSocket';

// Ticker WebSocket updates
export {
  parseTickerUpdate,
  applyTickerUpdate,
  type TickerUpdate,
} from './tickerUpdate';

// Order Mapper
export {
  mapBlockToOrderParams,
  mapGridToOrders,
  extractBlocksFromGrid,
  findLinkedBlocks,
  blockDataToUIBlock,
  calculateBlockPrice,
  formatPriceForAPI,
  validateOrder,
  createOrderPreview,
} from './orderMapper';

// Types
export type {
  // Order types
  OrderMethod,
  OrderSide,
  OrderType,
  TimeInForce,
  TriggerReference,
  PriceType,
  ConditionalOrderType,
  SelfTradePreventionType,
  OrderTrigger,
  ConditionalOrder,
  OrderParams,
  KrakenOrderRequest,
  KrakenOrderResponse,

  // Ticker types
  AssetTickerInfo,
  TickerResponse,
  ParsedTickerData,

  // WebSocket types
  WebSocketStatus,
  WebSocketMessage,
  WebSocketSubscription,

  // Authentication types
  AuthToken,

  // UI mapping types
  UIBlockPosition,
  UIBlockData,
  OrderBuildContext,

  // OHLC types
  KrakenOHLCData,
  KrakenOHLCMessage,
  OHLCInterval,

  // Error types
  KrakenAPIError,
} from './types';
