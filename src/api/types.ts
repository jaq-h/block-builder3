// Kraken API Types

// ============================================================================
// Order Types (for WebSocket API v2)
// ============================================================================

export type OrderMethod = "add_order" | "amend_order" | "edit_order" | "cancel_order";

export type OrderSide = "buy" | "sell";

export type OrderType =
  | "limit"
  | "market"
  | "iceberg"
  | "stop-loss"
  | "stop-loss-limit"
  | "take-profit"
  | "take-profit-limit"
  | "trailing-stop"
  | "trailing-stop-limit"
  | "settle-position";

export type TimeInForce = "gtc" | "gtd" | "ioc";

export type TriggerReference = "index" | "last";

export type PriceType = "static" | "pct" | "quote";

export type ConditionalOrderType =
  | "limit"
  | "stop-loss"
  | "stop-loss-limit"
  | "take-profit"
  | "take-profit-limit"
  | "trailing-stop"
  | "trailing-stop-limit";

export type SelfTradePreventionType = "cancel-newest" | "cancel-oldest" | "cancel-both";

// Order trigger configuration
export interface OrderTrigger {
  reference: TriggerReference;
  price: string;
  price_type?: PriceType;
}

// Conditional close order configuration
export interface ConditionalOrder {
  order_type: ConditionalOrderType;
  limit_price?: string;
  limit_price_type?: PriceType;
  trigger_price?: string;
  trigger_price_type?: PriceType;
}

// Order parameters for WebSocket add_order
export interface OrderParams {
  order_type: OrderType;
  side: OrderSide;
  order_qty: string; // Volume as string for precision
  symbol: string; // Trading pair (e.g., "BTC/USD")
  limit_price?: string;
  limit_price_type?: PriceType;
  trigger_price?: string;
  trigger_price_type?: PriceType;
  triggers?: OrderTrigger;
  conditional?: ConditionalOrder;
  time_in_force?: TimeInForce;
  margin?: boolean;
  post_only?: boolean;
  reduce_only?: boolean;
  effective_time?: string; // RFC3339 format
  expire_time?: string; // RFC3339 format
  deadline?: string; // RFC3339 format
  cl_ord_id?: string;
  order_userref?: number;
  display_qty?: string; // For iceberg orders
  stp_type?: SelfTradePreventionType;
  oflags?: string; // Comma-delimited flags: post, fcib, fciq, viqc
}

// WebSocket order request
export interface KrakenOrderRequest {
  method: OrderMethod;
  params: OrderParams;
  req_id?: number;
}

// WebSocket order response
export interface KrakenOrderResponse {
  method: string;
  req_id?: number;
  result?: {
    order_id?: string;
    cl_ord_id?: string;
    order_userref?: number;
  };
  error?: string;
  success: boolean;
}

// ============================================================================
// REST API Types (for Ticker data)
// ============================================================================

// Ticker info from REST API
export interface AssetTickerInfo {
  a: [string, string, string]; // Ask [price, whole lot volume, lot volume]
  b: [string, string, string]; // Bid [price, whole lot volume, lot volume]
  c: [string, string]; // Last trade closed [price, lot volume]
  v: [string, string]; // Volume [today, last 24 hours]
  p: [string, string]; // Volume weighted average price [today, last 24 hours]
  t: [number, number]; // Number of trades [today, last 24 hours]
  l: [string, string]; // Low [today, last 24 hours]
  h: [string, string]; // High [today, last 24 hours]
  o: string; // Today's opening price
}

export interface TickerResponse {
  error: string[];
  result: {
    [pair: string]: AssetTickerInfo;
  };
}

// Parsed ticker data for UI consumption
export interface ParsedTickerData {
  symbol: string;
  ask: number;
  bid: number;
  last: number;
  volume24h: number;
  vwap24h: number;
  high24h: number;
  low24h: number;
  open: number;
  trades24h: number;
  change24h: number;
  changePercent24h: number;
}

// ============================================================================
// WebSocket Connection Types
// ============================================================================

export type WebSocketStatus = "disconnected" | "connecting" | "connected" | "authenticated" | "error";

export interface WebSocketMessage {
  method?: string;
  params?: Record<string, unknown>;
  req_id?: number;
  result?: unknown;
  error?: string;
  success?: boolean;
}

export interface WebSocketSubscription {
  channel: string;
  symbol?: string[];
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface KrakenCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface AuthToken {
  token: string;
  expires: number; // Unix timestamp
}

// ============================================================================
// UI Block to Order Mapping Types
// ============================================================================

export interface UIBlockPosition {
  col: number; // 0 = Entry, 1 = Exit
  row: number; // 0 = Top (Profit), 1 = Middle (Primary), 2 = Bottom (Stop-loss)
  yPosition: number; // 0-100 percentage
  axis: 1 | 2; // Axis within the cell
}

export interface UIBlockData {
  id: string;
  orderType: string;
  abrv: string;
  position: UIBlockPosition;
  axes: ("trigger" | "limit")[];
  linkedBlockId?: string;
}

export interface OrderBuildContext {
  symbol: string;
  currentPrice: number;
  side: OrderSide;
  quantity: string;
  leverage?: number;
  timeInForce?: TimeInForce;
  margin?: boolean;
  postOnly?: boolean;
  reduceOnly?: boolean;
}

// Error types
export interface KrakenAPIError {
  code: string;
  message: string;
}
