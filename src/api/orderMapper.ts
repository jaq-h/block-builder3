/**
 * Order Mapper
 * Maps UI block data from the Strategy Assembly grid to Kraken order parameters
 */

import type { BlockData, GridData } from "../utils/cardAssemblyUtils";
import type {
  OrderParams,
  OrderType,
  OrderSide,
  ConditionalOrder,
  OrderTrigger,
  TriggerReference,
  UIBlockData,
  OrderBuildContext,
} from "./types";
import { DEFAULT_SYMBOL } from "./config";

/**
 * Map UI order type string to Kraken OrderType
 */
const mapOrderType = (type: string): OrderType => {
  const typeMap: Record<string, OrderType> = {
    limit: "limit",
    market: "market",
    iceberg: "iceberg",
    "stop-loss": "stop-loss",
    "stop-loss-limit": "stop-loss-limit",
    "take-profit": "take-profit",
    "take-profit-limit": "take-profit-limit",
    "trailing-stop": "trailing-stop",
    "trailing-stop-limit": "trailing-stop-limit",
    "settle-position": "settle-position",
  };

  return typeMap[type] || "limit";
};

/**
 * Determine order side based on grid position
 * Entry column (col 0) = buy, Exit column (col 1) = sell
 */
const determineSide = (col: number): OrderSide => {
  return col === 0 ? "buy" : "sell";
};

/**
 * Calculate actual price from percentage position and current market price
 *
 * @param yPosition - Percentage position (0-100)
 * @param currentPrice - Current market price
 * @param row - Grid row (0 = top/profit, 1 = middle/primary, 2 = bottom/stop-loss)
 * @param col - Grid column (0 = entry, 1 = exit)
 * @returns Calculated price
 */
export const calculatePriceFromPosition = (
  yPosition: number,
  currentPrice: number,
  row: number,
  col: number,
): number => {
  // The percentage represents distance from market price
  // Row 0 (Top): Above market price (for take-profit on exit, limit on entry)
  // Row 1 (Middle): At or near market price
  // Row 2 (Bottom): Below market price (for stop-loss)

  // Calculate the price offset
  // We'll use a configurable scale factor (e.g., 1% position = 0.1% price change)
  const scaleFactor = 0.1; // 1% UI position = 0.1% price change
  const percentChange = (yPosition / 100) * scaleFactor * 100;

  // Determine direction based on row and column
  let priceMultiplier: number;

  if (row === 0) {
    // Top row: Above market (positive offset)
    priceMultiplier = 1 + percentChange / 100;
  } else if (row === 2) {
    // Bottom row: Below market (negative offset)
    priceMultiplier = 1 - percentChange / 100;
  } else {
    // Middle row: Based on column
    // Entry (buy) typically at or below market
    // Exit (sell) typically at or above market
    if (col === 0) {
      priceMultiplier = 1 - percentChange / 100;
    } else {
      priceMultiplier = 1 + percentChange / 100;
    }
  }

  return currentPrice * priceMultiplier;
};

/**
 * Format price for Kraken API (string with appropriate precision)
 */
export const formatPriceForAPI = (
  price: number,
  symbol: string = DEFAULT_SYMBOL,
): string => {
  // Determine precision based on asset
  let precision = 2;
  if (symbol.includes("BTC") || symbol.includes("XBT")) {
    precision = 1; // BTC pairs typically use 1 decimal place for prices
  } else if (price < 1) {
    precision = 6;
  } else if (price < 100) {
    precision = 4;
  }

  return price.toFixed(precision);
};

/**
 * Extract order type from block ID
 * Block IDs follow the format: baseId-type-counter
 */
export const extractOrderTypeFromId = (blockId: string): string => {
  const orderTypes = [
    "limit",
    "market",
    "iceberg",
    "stop-loss",
    "stop-loss-limit",
    "take-profit",
    "take-profit-limit",
    "trailing-stop",
    "trailing-stop-limit",
  ];

  for (const type of orderTypes) {
    if (blockId.includes(`-${type}-`)) {
      return type;
    }
  }

  // Fallback: try to extract from ID parts
  const parts = blockId.split("-");
  for (const part of parts) {
    if (orderTypes.includes(part)) {
      return part;
    }
  }

  return "limit"; // Default fallback
};

/**
 * Convert a single BlockData to UIBlockData for easier processing
 */
export const blockDataToUIBlock = (
  block: BlockData,
  col: number,
  row: number,
): UIBlockData => {
  return {
    id: block.id,
    orderType: extractOrderTypeFromId(block.id),
    abrv: block.abrv,
    position: {
      col,
      row,
      yPosition: block.yPosition,
      axis: block.axis,
    },
    axes: block.axes,
    linkedBlockId: block.linkedBlockId,
  };
};

/**
 * Build trigger configuration from UI block data
 */
const buildTrigger = (
  block: UIBlockData,
  currentPrice: number,
  triggerRef: TriggerReference = "last",
): OrderTrigger | undefined => {
  if (!block.axes.includes("trigger")) {
    return undefined;
  }

  const triggerPrice = calculatePriceFromPosition(
    block.position.yPosition,
    currentPrice,
    block.position.row,
    block.position.col,
  );

  return {
    reference: triggerRef,
    price: formatPriceForAPI(triggerPrice),
    price_type: "static",
  };
};

/**
 * Build conditional order configuration for linked blocks
 */
const buildConditional = (
  linkedBlock: UIBlockData | undefined,
  currentPrice: number,
): ConditionalOrder | undefined => {
  if (!linkedBlock) {
    return undefined;
  }

  const orderType = mapOrderType(linkedBlock.orderType);

  // Only certain order types can be conditionals
  const validConditionalTypes = [
    "limit",
    "stop-loss",
    "stop-loss-limit",
    "take-profit",
    "take-profit-limit",
    "trailing-stop",
    "trailing-stop-limit",
  ];

  if (!validConditionalTypes.includes(orderType)) {
    return undefined;
  }

  const conditional: ConditionalOrder = {
    order_type: orderType as ConditionalOrder["order_type"],
  };

  // Add limit price if the order type uses it
  if (linkedBlock.axes.includes("limit")) {
    conditional.limit_price = formatPriceForAPI(
      calculatePriceFromPosition(
        linkedBlock.position.yPosition,
        currentPrice,
        linkedBlock.position.row,
        linkedBlock.position.col,
      ),
    );
    conditional.limit_price_type = "static";
  }

  // Add trigger price if the order type uses it
  if (linkedBlock.axes.includes("trigger")) {
    conditional.trigger_price = formatPriceForAPI(
      calculatePriceFromPosition(
        linkedBlock.position.yPosition,
        currentPrice,
        linkedBlock.position.row,
        linkedBlock.position.col,
      ),
    );
    conditional.trigger_price_type = "static";
  }

  return conditional;
};

/**
 * Convert a UI block to Kraken OrderParams
 */
export const mapBlockToOrderParams = (
  block: UIBlockData,
  context: OrderBuildContext,
  linkedBlock?: UIBlockData,
): OrderParams => {
  const orderType = mapOrderType(block.orderType);
  const side = context.side || determineSide(block.position.col);

  const params: OrderParams = {
    order_type: orderType,
    side,
    order_qty: context.quantity,
    symbol: context.symbol,
  };

  // Add limit price for limit-based orders
  if (block.axes.includes("limit")) {
    params.limit_price = formatPriceForAPI(
      calculatePriceFromPosition(
        block.position.yPosition,
        context.currentPrice,
        block.position.row,
        block.position.col,
      ),
      context.symbol,
    );
    params.limit_price_type = "static";
  }

  // Add trigger for trigger-based orders
  if (block.axes.includes("trigger")) {
    params.triggers = buildTrigger(block, context.currentPrice);
  }

  // Add conditional order if there's a linked block
  if (linkedBlock) {
    params.conditional = buildConditional(linkedBlock, context.currentPrice);
  }

  // Add optional parameters from context
  if (context.timeInForce) {
    params.time_in_force = context.timeInForce;
  }

  if (context.margin !== undefined) {
    params.margin = context.margin;
  }

  if (context.postOnly !== undefined) {
    params.post_only = context.postOnly;
  }

  if (context.reduceOnly !== undefined) {
    params.reduce_only = context.reduceOnly;
  }

  return params;
};

/**
 * Extract all blocks from the grid and convert to UIBlockData
 */
export const extractBlocksFromGrid = (grid: GridData): UIBlockData[] => {
  const blocks: UIBlockData[] = [];

  grid.forEach((column, colIndex) => {
    column.forEach((cell, rowIndex) => {
      cell.forEach((block) => {
        blocks.push(blockDataToUIBlock(block, colIndex, rowIndex));
      });
    });
  });

  return blocks;
};

/**
 * Find linked blocks (for conditional orders)
 * In the conditional pattern, blocks placed diagonally are conditionals
 */
export const findLinkedBlocks = (
  blocks: UIBlockData[],
): Map<string, UIBlockData> => {
  const linkedMap = new Map<string, UIBlockData>();

  // Find blocks with explicit linkedBlockId
  blocks.forEach((block) => {
    if (block.linkedBlockId) {
      const linkedBlock = blocks.find((b) => b.id === block.linkedBlockId);
      if (linkedBlock) {
        linkedMap.set(block.id, linkedBlock);
      }
    }
  });

  return linkedMap;
};

/**
 * Map the entire grid to an array of Kraken OrderParams
 * This is the main function to convert UI state to API-ready orders
 */
export const mapGridToOrders = (
  grid: GridData,
  context: Omit<OrderBuildContext, "side">,
): OrderParams[] => {
  const blocks = extractBlocksFromGrid(grid);
  const linkedBlocks = findLinkedBlocks(blocks);
  const orders: OrderParams[] = [];

  // Process blocks that aren't linked as conditionals to other blocks
  const processedIds = new Set<string>();
  const conditionalIds =
    new Set(linkedBlocks.values()).size > 0
      ? new Set([...linkedBlocks.values()].map((b) => b.id))
      : new Set<string>();

  blocks.forEach((block) => {
    // Skip if this block is a conditional for another block
    if (conditionalIds.has(block.id)) {
      return;
    }

    // Skip if already processed
    if (processedIds.has(block.id)) {
      return;
    }

    const linkedBlock = linkedBlocks.get(block.id);
    const orderContext: OrderBuildContext = {
      ...context,
      side: determineSide(block.position.col),
    };

    const orderParams = mapBlockToOrderParams(block, orderContext, linkedBlock);
    orders.push(orderParams);
    processedIds.add(block.id);

    if (linkedBlock) {
      processedIds.add(linkedBlock.id);
    }
  });

  return orders;
};

/**
 * Validate an order before submission
 * Returns an array of validation errors (empty if valid)
 */
export const validateOrder = (params: OrderParams): string[] => {
  const errors: string[] = [];

  if (!params.symbol) {
    errors.push("Symbol is required");
  }

  if (!params.order_qty || parseFloat(params.order_qty) <= 0) {
    errors.push("Order quantity must be greater than 0");
  }

  if (!params.side) {
    errors.push("Order side (buy/sell) is required");
  }

  if (!params.order_type) {
    errors.push("Order type is required");
  }

  // Validate limit price for limit orders
  const limitOrderTypes: OrderType[] = [
    "limit",
    "iceberg",
    "stop-loss-limit",
    "take-profit-limit",
    "trailing-stop-limit",
  ];
  if (limitOrderTypes.includes(params.order_type) && !params.limit_price) {
    errors.push(`Limit price is required for ${params.order_type} orders`);
  }

  // Validate trigger for trigger-based orders
  const triggerOrderTypes: OrderType[] = [
    "stop-loss",
    "stop-loss-limit",
    "take-profit",
    "take-profit-limit",
    "trailing-stop",
    "trailing-stop-limit",
  ];
  if (triggerOrderTypes.includes(params.order_type) && !params.triggers) {
    errors.push(
      `Trigger configuration is required for ${params.order_type} orders`,
    );
  }

  return errors;
};

/**
 * Create a preview string for an order (for UI display)
 */
export const createOrderPreview = (params: OrderParams): string => {
  const parts = [
    params.side.toUpperCase(),
    params.order_qty,
    params.symbol,
    `(${params.order_type})`,
  ];

  if (params.limit_price) {
    parts.push(`@ ${params.limit_price}`);
  }

  if (params.triggers?.price) {
    parts.push(`trigger: ${params.triggers.price}`);
  }

  return parts.join(" ");
};
