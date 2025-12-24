/**
 * Order Types for Kraken WebSocket API v2
 * These types define the structure of orders in the UI and for API communication
 */

// ============================================================================
// Order Method Types
// ============================================================================

export type OrderMethod =
  | "add_order"
  | "amend_order"
  | "edit_order"
  | "cancel_order";

// ============================================================================
// Order Side and Type
// ============================================================================

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

export type ConditionalOrderType =
  | "limit"
  | "stop-loss"
  | "stop-loss-limit"
  | "take-profit"
  | "take-profit-limit"
  | "trailing-stop"
  | "trailing-stop-limit";

// ============================================================================
// Price and Trigger Types
// ============================================================================

export type OrderPriceType = "static" | "pct" | "quote";

export type OrderTriggerReference = "index" | "last";

export interface OrderTriggers {
  reference: OrderTriggerReference;
  price: string;
  price_type?: OrderPriceType;
}

// ============================================================================
// Time In Force
// ============================================================================

/**
 * Time-in-force specifies how long an order remains in effect before being expired.
 * - gtc: Good Till Canceled - until user has cancelled.
 * - gtd: Good Till Date - until expire_time parameter.
 * - ioc: Immediate Or Cancel - immediately cancels back any quantity that cannot be filled on arrival.
 */
export type TimeInForce = "gtc" | "gtd" | "ioc";

// ============================================================================
// Conditional Order Configuration
// ============================================================================

export interface OrderConditional {
  order_type: ConditionalOrderType;
  limit_price?: string;
  limit_price_type?: OrderPriceType;
  trigger_price?: string;
  trigger_price_type?: OrderPriceType;
}

// ============================================================================
// Order Parameters
// ============================================================================

export interface OrderParams {
  // Required fields
  order_type: OrderType;
  side: OrderSide;
  order_qty: string; // Volume as string for precision
  symbol: string; // Trading pair (e.g., "BTC/USD")

  // Price fields
  limit_price?: string;
  limit_price_type?: OrderPriceType;

  // Trigger configuration
  triggers?: OrderTriggers;

  // Conditional close order
  conditional?: OrderConditional;

  /**
   * Time-in-force specifies how long an order remains in effect before being expired.
   * Default: "gtc" (Good Till Canceled)
   */
  time_in_force?: TimeInForce;

  /**
   * Funds the order on margin using the maximum leverage for the pair (maximum is leverage of 5).
   * Default: false
   */
  margin?: boolean;

  /**
   * Cancels the order if it will take liquidity on arrival.
   * Post only orders will always be posted passively in the book.
   * Only applicable for orders with limit price.
   * Default: false
   */
  post_only?: boolean;

  /**
   * Reduces an existing margin position without opening an opposite long or short position
   * worth more than the current value of your leveraged assets.
   * Default: false
   */
  reduce_only?: boolean;

  /**
   * Scheduled start time (precision to seconds).
   * Format: RFC3339 (e.g., "2022-12-25T09:30:59Z")
   */
  effective_time?: string;

  /**
   * Expiration time of the order (precision to seconds).
   * GTD orders can have an expiry time up to one month in future.
   * Format: RFC3339 (e.g., "2022-12-25T09:30:59Z")
   * Condition: GTD orders only.
   */
  expire_time?: string;

  /**
   * Range of valid offsets (from current time) is 500 milliseconds to 60 seconds, default is 5 seconds.
   * The precision of this parameter is to the millisecond.
   * The engine will prevent this order from matching after this time,
   * it provides protection against latency on time sensitive orders.
   * Format: RFC3339 (e.g., "2022-12-25T09:30:59.123Z")
   */
  deadline?: string;

  /**
   * Adds an alphanumeric client order identifier which uniquely identifies an open order for each client.
   * This field is mutually exclusive with order_userref parameter.
   *
   * The cl_ord_id parameter can be one of the following formats:
   * - Long UUID: 6d1b345e-2821-40e2-ad83-4ecb18a06876 (32 hex characters separated with 4 dashes)
   * - Short UUID: da8e4ad59b78481c93e589746b0cf91f (32 hex characters with no dashes)
   * - Free text: arb-20240509-00010 (Free format ascii text up to 18 characters)
   */
  cl_ord_id?: string;

  /**
   * This is an optional non-unique, numeric identifier which can be associated with a number of orders by the client.
   * This field is mutually exclusive with cl_ord_id parameter.
   *
   * Many clients choose a unique integer value generated by their systems (i.e. a timestamp).
   * However, because we don't enforce uniqueness on our side, it can also be used to easily
   * tag a group of orders for querying or cancelling.
   */
  order_userref?: number;

  /**
   * For iceberg orders only, it defines the quantity to show in the book
   * while the rest of order quantity remains hidden.
   * Minimum value is 1/15 of volume.
   */
  display_qty?: string;
}

// ============================================================================
// Order Request and Response
// ============================================================================

export interface Order {
  method: OrderMethod;
  params: OrderParams;
  req_id?: number;
}

export interface OrderResponse {
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
// Helper Functions
// ============================================================================

/**
 * Create a new Order request with default values
 */
export const createOrder = (
  params: Partial<OrderParams> &
    Pick<OrderParams, "order_type" | "side" | "order_qty" | "symbol">,
): Order => {
  return {
    method: "add_order",
    params: {
      time_in_force: "gtc",
      margin: false,
      post_only: false,
      reduce_only: false,
      ...params,
    },
  };
};

/**
 * Validate that mutually exclusive fields are not both set
 */
export const validateOrderParams = (params: OrderParams): string[] => {
  const errors: string[] = [];

  // cl_ord_id and order_userref are mutually exclusive
  if (params.cl_ord_id && params.order_userref !== undefined) {
    errors.push("cl_ord_id and order_userref are mutually exclusive");
  }

  // expire_time requires time_in_force to be 'gtd'
  if (params.expire_time && params.time_in_force !== "gtd") {
    errors.push('expire_time requires time_in_force to be "gtd"');
  }

  // post_only is only valid for limit orders
  if (params.post_only && !params.limit_price) {
    errors.push("post_only is only valid for orders with a limit price");
  }

  // display_qty is only valid for iceberg orders
  if (params.display_qty && params.order_type !== "iceberg") {
    errors.push("display_qty is only valid for iceberg orders");
  }

  return errors;
};
