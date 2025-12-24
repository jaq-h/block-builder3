/**
 * Kraken API Module
 * Barrel export for all API utilities
 */

// Configuration
export {
  getKrakenConfig,
  hasValidCredentials,
  validateConfig,
  DEFAULT_SYMBOL,
  type KrakenConfig,
} from './config';

// Authentication
export {
  generateNonce,
  generateSignature,
  createAuthHeaders,
  getWebSocketToken,
  formatPostData,
} from './krakenAuth';

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
} from './krakenWebSocket';

// Order Mapper
export {
  mapBlockToOrderParams,
  mapGridToOrders,
  extractBlocksFromGrid,
  findLinkedBlocks,
  blockDataToUIBlock,
  extractOrderTypeFromId,
  calculatePriceFromPosition,
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
  KrakenCredentials,
  AuthToken,

  // UI mapping types
  UIBlockPosition,
  UIBlockData,
  OrderBuildContext,

  // Error types
  KrakenAPIError,
} from './types';
