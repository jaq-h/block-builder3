/**
 * Order Mapper
 * Maps UI block data from the Strategy Assembly grid to Kraken order parameters
 */

import type { BlockData, GridData } from "../types/grid";
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
import { priceAtOffset } from "../utils/price";

// A Map, not an object literal: an object literal also resolves inherited
// Object.prototype members, so a type of "toString" or "constructor" would look
// up to a truthy function and flow into order_type as a garbage value that
// validateOrder's presence check waves through.
const ORDER_TYPES_BY_UI_TYPE = new Map<string, OrderType>([
  ["limit", "limit"],
  ["market", "market"],
  ["iceberg", "iceberg"],
  ["stop-loss", "stop-loss"],
  ["stop-loss-limit", "stop-loss-limit"],
  ["take-profit", "take-profit"],
  ["take-profit-limit", "take-profit-limit"],
  ["trailing-stop", "trailing-stop"],
  ["trailing-stop-limit", "trailing-stop-limit"],
  ["settle-position", "settle-position"],
]);

/**
 * Map UI order type string to Kraken OrderType.
 *
 * Throws rather than falling back to "limit": quietly relabelling an order the
 * user built as a different one is the failure this module exists to prevent,
 * and a plain limit order is precisely the wrong guess - it is the one type
 * that carries no protective trigger.
 */
const mapOrderType = (type: string): OrderType => {
  const orderType = ORDER_TYPES_BY_UI_TYPE.get(type);

  if (!orderType) {
    throw new Error(
      `Unknown order type "${type}" - refusing to guess a Kraken order type for it.`,
    );
  }

  return orderType;
};

/**
 * Determine order side based on grid position
 * Entry column (col 0) = buy, Exit column (col 1) = sell
 */
const determineSide = (col: number): OrderSide => {
  return col === 0 ? "buy" : "sell";
};

/**
 * The price a block represents, from its slider position and the market price.
 *
 * Decision D3: the interface is the source of truth. A block at yPosition 25 is
 * 25% away from market, exactly as its label, its price chip and the chart line
 * all say, so this calls the same `priceAtOffset` the grid cell renders from
 * and reads the same `direction` the cell renders from. There is no scale
 * factor and no second opinion about which side of the market the block is on.
 */
export const calculateBlockPrice = (
  block: UIBlockData,
  currentPrice: number,
): number =>
  priceAtOffset(
    currentPrice,
    block.position.yPosition,
    block.direction === "downside",
  );

/**
 * Format price for Kraken API (string with appropriate precision)
 */
export const formatPriceForAPI = (
  price: number,
  symbol: string = DEFAULT_SYMBOL,
): string => {
  // Precision follows the BASE asset, not any appearance of "BTC" in the pair.
  // `symbol.includes("BTC")` also matches a BTC-QUOTED pair such as ETH/BTC,
  // whose prices are fractions - formatting 0.034512 to one decimal sends the
  // order at "0.0".
  const [base] = symbol.split("/");
  if (base === "BTC" || base === "XBT") {
    return price.toFixed(1); // BTC pairs quote to one decimal place
  }

  let precision = 2;
  if (price < 1) {
    precision = 6;
  } else if (price < 100) {
    precision = 4;
  }

  return price.toFixed(precision);
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
    // Read the block's own order type. It used to be re-derived by scanning the
    // id string for "-<type>-", which matched "limit" inside every "-limit"
    // variant and turned a stop-loss-limit into a plain limit order.
    orderType: block.orderType,
    abrv: block.abrv,
    position: {
      col,
      row,
      yPosition: block.yPosition,
      axis: block.axis,
    },
    direction: block.direction,
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
  symbol: string,
  triggerRef: TriggerReference = "last",
): OrderTrigger | undefined => {
  if (!block.axes.includes("trigger")) {
    return undefined;
  }

  return {
    reference: triggerRef,
    // The symbol has to be passed in. Left to the DEFAULT_SYMBOL default, the
    // trigger price and the limit price in the same payload come out at
    // different precisions on any non-BTC pair.
    price: formatPriceForAPI(calculateBlockPrice(block, currentPrice), symbol),
    price_type: "static",
  };
};

/**
 * Build conditional order configuration for linked blocks
 */
const buildConditional = (
  linkedBlock: UIBlockData | undefined,
  currentPrice: number,
  symbol: string,
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

  const price = formatPriceForAPI(
    calculateBlockPrice(linkedBlock, currentPrice),
    symbol,
  );

  // Add limit price if the order type uses it
  if (linkedBlock.axes.includes("limit")) {
    conditional.limit_price = price;
    conditional.limit_price_type = "static";
  }

  // Add trigger price if the order type uses it
  if (linkedBlock.axes.includes("trigger")) {
    conditional.trigger_price = price;
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
      calculateBlockPrice(block, context.currentPrice),
      context.symbol,
    );
    params.limit_price_type = "static";
  }

  // Add trigger for trigger-based orders
  if (block.axes.includes("trigger")) {
    params.triggers = buildTrigger(block, context.currentPrice, context.symbol);
  }

  // Add conditional order if there's a linked block
  if (linkedBlock) {
    params.conditional = buildConditional(
      linkedBlock,
      context.currentPrice,
      context.symbol,
    );
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
 * Find a cycle in the "this block's conditional is that block" graph.
 *
 * Every block links to at most one other, so the links form a functional graph:
 * following them from any block either runs out or repeats. Returns the ids of
 * the first cycle found, in order, or null when the links are a valid forest.
 */
const findLinkCycle = (
  blocks: UIBlockData[],
  linkedBlocks: Map<string, UIBlockData>,
): string[] | null => {
  const settled = new Set<string>();

  for (const start of blocks) {
    const path: string[] = [];
    const indexOnPath = new Map<string, number>();
    let current: UIBlockData | undefined = start;

    while (current && !settled.has(current.id)) {
      const seenAt = indexOnPath.get(current.id);
      if (seenAt !== undefined) {
        return path.slice(seenAt);
      }

      indexOnPath.set(current.id, path.length);
      path.push(current.id);
      current = linkedBlocks.get(current.id);
    }

    path.forEach((id) => settled.add(id));
  }

  return null;
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

  // A Kraken conditional close hangs off exactly one primary order, so a cycle
  // of links describes a strategy that cannot be built. Every block in the
  // cycle is somebody's conditional, so the skip below would drop all of them
  // and return an empty array - the user presses Execute and nothing is sent,
  // with nothing to explain it. Refuse the grid instead. Breaking the cycle by
  // electing one block the primary was the alternative, and it was rejected:
  // it would send a real pair of orders that the user never asked for, which is
  // the same silent substitution the rest of this module exists to prevent.
  const cycle = findLinkCycle(blocks, linkedBlocks);
  if (cycle) {
    throw new Error(
      `Conditional order links form a cycle: ${[...cycle, cycle[0]].join(" -> ")}. ` +
        "A conditional close attaches to exactly one primary order, so this strategy cannot be submitted.",
    );
  }

  // Process blocks that aren't linked as conditionals to other blocks
  const processedIds = new Set<string>();
  const conditionalIds = new Set([...linkedBlocks.values()].map((b) => b.id));

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

  // `parseFloat` used to do this, which let "abc" through: it parses to NaN,
  // and every NaN comparison is false, so `NaN <= 0` was false and garbage went
  // out as the order quantity. `Number` rejects trailing junk ("0.5 BTC") too.
  const quantity = Number(params.order_qty);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push("Order quantity must be a positive number");
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
