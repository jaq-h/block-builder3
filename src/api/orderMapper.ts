/**
 * Order Mapper
 * Maps UI block data from the Strategy Assembly grid to Kraken order parameters
 */

import type { BlockData, BlockDirection, GridData } from "../types/grid";
import type {
  OrderParams,
  OrderType,
  OrderSide,
  ConditionalOrder,
  ConditionalOrderType,
  OrderTrigger,
  PriceType,
  TriggerReference,
  UIBlockData,
  OrderBuildContext,
} from "./types";
import {
  cellDirection,
  legOfBlock,
  offsetForOrder,
  priceForOrderOffset,
} from "../utils/blockMapping";
import {
  formatPriceForAPI,
  formatQuantityForAPI,
} from "../utils/marketFormat";
import type { MarketPrecision } from "../types/markets";

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

// The order types Kraken accepts as a conditional close. One list, because both
// the link guard and the conditional builder need this same fact and a second
// copy is how two lists drift apart - the failure already documented for the
// order-type table and the ORDER_TYPES palette. Built as a Set of
// ConditionalOrderType so the compiler checks every member against the union the
// predicate below narrows to, and read as a ReadonlySet<string> so `.has` still
// takes any OrderType.
const CONDITIONAL_ORDER_TYPES: ReadonlySet<string> = new Set<ConditionalOrderType>([
  "limit",
  "stop-loss",
  "stop-loss-limit",
  "take-profit",
  "take-profit-limit",
  "trailing-stop",
  "trailing-stop-limit",
]);

const isConditionalOrderType = (
  type: OrderType,
): type is ConditionalOrderType => CONDITIONAL_ORDER_TYPES.has(type);

// The order types that must carry a limit price, and those that must carry a
// trigger. One list each, shared by the primary order and by its conditional
// close, so the two halves of a payload cannot be held to different rules.
const LIMIT_PRICE_ORDER_TYPES: ReadonlySet<string> = new Set<OrderType>([
  "limit",
  "iceberg",
  "stop-loss-limit",
  "take-profit-limit",
  "trailing-stop-limit",
]);

const TRIGGER_ORDER_TYPES: ReadonlySet<string> = new Set<OrderType>([
  "stop-loss",
  "stop-loss-limit",
  "take-profit",
  "take-profit-limit",
  "trailing-stop",
  "trailing-stop-limit",
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
 * all say. `priceForOrderOffset` is the mapping owner's derivation of that for
 * a payload - the same formula and the same direction reading `GridCell` uses
 * for the chip and `orderPriceLines` for the chart - so there is no scale
 * factor and no second opinion here about which side of the market the block is
 * on or how far along the axis it sits. It parts company with the display call
 * on one input only: a non-finite position stays non-finite, so it is refused
 * downstream rather than drawn at the market price.
 *
 * `direction` is the cell's, stamped on by `extractBlocksFromGrid`, which is
 * the whole of decision D8 as this module sees it. Reading the block's own was
 * what let a bulk cell draw `-25.00% $37,500` while this built a payload at
 * 62,500 from the identical block.
 */
export const calculateBlockPrice = (
  block: UIBlockData,
  currentPrice: number,
): number =>
  priceForOrderOffset(currentPrice, block.position.yPosition, block.direction);

// Price and quantity formatting live in `src/utils/marketFormat.ts`, which is
// handed Kraken's own `MarketPrecision` for the pair. They used to be here, and
// they chose a precision from the base asset plus the *magnitude* of the number
// - 6 decimals below 1, 4 below 100, 2 above. Magnitude is not precision:
// ETH/USD takes 2 decimals at every price, so a $12.34 ETH limit price was
// formatted to 4 and rejected by the exchange. Every price in a payload now
// goes through the same record, so no two fields can come out at different
// precisions.

/**
 * Convert a single BlockData to UIBlockData for easier processing
 */
export const blockDataToUIBlock = (
  block: BlockData,
  col: number,
  row: number,
  /**
   * The scale the cell this block sits in draws, from `cellDirection`. It is
   * passed in rather than read off the block because only the caller can see
   * the cell, and the cell is what owns the direction (decision D8).
   */
  direction: BlockDirection,
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
      // Clamped by the mapping owner, so a position no axis could have drawn
      // cannot reach a payload. The 0-100 reading that made a 100% offset - a
      // price of exactly zero - reachable is gone from the drag layer, and this
      // is what stops a saved strategy from carrying one back in.
      //
      // `offsetForOrder` rather than `clampOffset` because this is the payload:
      // a non-finite position stays non-finite so `validateOrder` refuses it,
      // where the display answer of zero would price it at the market and pass.
      yPosition: offsetForOrder(block.yPosition),
      axis: block.axis,
    },
    direction,
    axes: block.axes,
    linkedBlockId: block.linkedBlockId,
  };
};

/**
 * Refuse a block that claims both a trigger and a limit axis.
 *
 * A block carries one `yPosition`, so it can express exactly one price. Giving
 * both prices that same number is the mapper guessing, and guessing inside an
 * order payload is the failure this module exists to prevent - the collapse
 * passes `validateOrder` cleanly, so nothing downstream catches it.
 *
 * A dual-axis order type is placed as two blocks, one per axis, and every
 * construction path gives each leg only its own axis. So this is unreachable
 * today, and that is the point: should a hydration path ever go back to handing
 * a leg the order type's whole axes list, it fails loudly here instead of
 * quietly emitting a trigger price equal to the limit price.
 */
const assertSingleAxis = (block: UIBlockData): void => {
  if (block.axes.includes("trigger") && block.axes.includes("limit")) {
    throw new Error(
      `Block "${block.id}" claims both a trigger and a limit axis, but a single ` +
        "slider position cannot express both a trigger price and a limit price.",
    );
  }
};

/**
 * Build trigger configuration from UI block data
 */
const buildTrigger = (
  block: UIBlockData,
  currentPrice: number,
  market: MarketPrecision,
  triggerRef: TriggerReference = "last",
): OrderTrigger | undefined => {
  // `legOfBlock`, the same owner the cell asks before it draws a trigger
  // column. A payload leg the grid never drew is a price the user was never
  // shown, which is the whole of the defect this join exists to prevent.
  if (legOfBlock(block) !== "trigger") {
    return undefined;
  }

  return {
    reference: triggerRef,
    // The pair's precision has to be passed in. This used to take a symbol with
    // a default, so it was called without one and formatted every trigger price
    // for BTC - the trigger price and the limit price in the same payload then
    // came out at different precisions on any non-BTC pair.
    price: formatPriceForAPI(calculateBlockPrice(block, currentPrice), market),
    price_type: "static",
  };
};

/**
 * Build conditional order configuration for linked blocks
 */
const buildConditional = (
  linkedBlock: UIBlockData | undefined,
  currentPrice: number,
  market: MarketPrecision,
): ConditionalOrder | undefined => {
  if (!linkedBlock) {
    return undefined;
  }

  assertSingleAxis(linkedBlock);

  const orderType = mapOrderType(linkedBlock.orderType);

  // Returning undefined here dropped the block from the order set entirely: it
  // has already been skipped at the top level for being somebody's conditional,
  // so the user drew two things and one vanished with nothing to explain it.
  // That is the same silent-order-loss the link guard refuses, and the rule is
  // not applied inconsistently on its fourth appearance. Emitting the block as
  // a standalone order was the alternative and it invents an intent the user
  // never expressed - they linked it as a conditional.
  if (!isConditionalOrderType(orderType)) {
    throw new Error(
      `Block "${linkedBlock.id}" is linked as a conditional close, but Kraken ` +
        `cannot use a ${orderType} order as one, so this strategy cannot be submitted.`,
    );
  }

  const conditional: ConditionalOrder = {
    order_type: orderType,
  };

  const price = formatPriceForAPI(
    calculateBlockPrice(linkedBlock, currentPrice),
    market,
  );

  const leg = legOfBlock(linkedBlock);

  // Add limit price if the order type uses it
  if (leg === "limit") {
    conditional.limit_price = price;
    conditional.limit_price_type = "static";
  }

  // Add trigger price if the order type uses it
  if (leg === "trigger") {
    conditional.trigger_price = price;
    conditional.trigger_price_type = "static";
  }

  return conditional;
};

/**
 * Convert a UI block to Kraken OrderParams.
 *
 * **Which price legs the payload carries is the same question the cell answers
 * before it draws one, and `legOfBlock` is the one owner of it.** Reading
 * `axes` here instead is what let a Limit sharing a bulk cell with a Market
 * order be sent at `limit_price: 58257.5` while the cell drew no price at all -
 * the display rule of the day flattened the whole cell and this module never
 * asked it. The rule has changed since (a cell draws its axis for whatever
 * needs one and its axis-less orders in an at-market strip), so the two agree
 * by construction rather than by coincidence; they agree because they ask the
 * same function, and a second reading of `axes` anywhere on this path is how
 * they would stop.
 */
export const mapBlockToOrderParams = (
  block: UIBlockData,
  context: OrderBuildContext,
  linkedBlock?: UIBlockData,
): OrderParams => {
  assertSingleAxis(block);

  const orderType = mapOrderType(block.orderType);
  const side = context.side || determineSide(block.position.col);

  const params: OrderParams = {
    order_type: orderType,
    side,
    // `lot_decimals` differs per pair too - 8 for BTC, 5 for ARB - and a
    // quantity carrying more decimals than the pair accepts is rejected exactly
    // as silently as a bad price. The quantity used to be copied through
    // unformatted, which is a single-market assumption that happened to hold
    // only because BTC's 8 decimals are the most permissive of the set.
    order_qty: formatQuantityForAPI(context.quantity, context.market),
    symbol: context.market.symbol,
  };

  // Add limit price for limit-based orders
  if (legOfBlock(block) === "limit") {
    params.limit_price = formatPriceForAPI(
      calculateBlockPrice(block, context.currentPrice),
      context.market,
    );
    params.limit_price_type = "static";
  }

  // Add trigger for trigger-based orders. `buildTrigger` asks the same owner
  // and answers `undefined` for a block that carries no trigger, so the key is
  // absent rather than present-and-undefined - which is a second spelling of
  // "no trigger" for every serialiser downstream to disagree about.
  const triggers = buildTrigger(block, context.currentPrice, context.market);
  if (triggers) {
    params.triggers = triggers;
  }

  // Add conditional order if there's a linked block
  if (linkedBlock) {
    params.conditional = buildConditional(
      linkedBlock,
      context.currentPrice,
      context.market,
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
      // One direction per cell, read once, applied to every block in it. This
      // is where the payload joins the price chip and the chart line: all three
      // now ask `cellDirection` rather than each reading a block's own field.
      const direction = cellDirection(cell);
      cell.forEach((block) => {
        blocks.push(blockDataToUIBlock(block, colIndex, rowIndex, direction));
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
 * Refuse a link graph that is not a flat, one-level set of primary-to-conditional
 * relationships.
 *
 * A Kraken conditional close hangs off exactly one primary order and carries no
 * conditional of its own, so the only shape the mapper can submit is: each
 * primary carries at most one conditional, a conditional is not shared between
 * primaries, and a conditional does not link onward.
 *
 * Every other shape is refused rather than guessed at, which is the same ruling
 * already made for the cycle: the mapper must never quietly invent an answer
 * when the input is ambiguous. Each of them otherwise produces a wrong order set
 * with nothing to explain it. A cycle drops every block in it, because each is
 * somebody's conditional, and Execute sends nothing at all. A chain a -> b -> c
 * emits one order and drops c, because b is skipped as somebody's conditional so
 * its own link is never followed while c is skipped for being named as one. A
 * diamond a -> c, b -> c emits two orders that both carry c, so c's close is
 * submitted twice.
 *
 * A link whose target is not on the grid is refused first, because it cannot be
 * seen further down: `findLinkedBlocks` resolves ids to blocks and drops the
 * dangling entry, so the walk below only ever sees links that resolved. Left
 * alone, the primary is emitted on its own with its protective close silently
 * gone - the same silent loss as the rest, and the shape that deleting a linked
 * block would produce. The error names the block carrying the link and the id it
 * points at, because repairing it means knowing exactly which link to clear.
 *
 * Nothing in the app writes `linkedBlockId` today, so none of this is reachable
 * from the UI. That is the same caveat the cycle guard carries, and it is the
 * point of both: the construction paths fail loudly here rather than shipping a
 * silently wrong order set if one of them ever starts writing links.
 */
const assertLinksAreFlat = (
  blocks: UIBlockData[],
  linkedBlocks: Map<string, UIBlockData>,
): void => {
  const blockIds = new Set(blocks.map((block) => block.id));
  blocks.forEach((block) => {
    if (block.linkedBlockId && !blockIds.has(block.linkedBlockId)) {
      throw new Error(
        `Block "${block.id}" names "${block.linkedBlockId}" as its conditional ` +
          "close, but no such block is on the grid. Clear that link or restore " +
          "the block, because this strategy cannot be submitted as it stands.",
      );
    }
  });

  const cycle = findLinkCycle(blocks, linkedBlocks);
  if (cycle) {
    throw new Error(
      `Conditional order links form a cycle: ${[...cycle, cycle[0]].join(" -> ")}. ` +
        "A conditional close attaches to exactly one primary order, so this strategy cannot be submitted.",
    );
  }

  const primariesByConditional = new Map<
    string,
    { block: UIBlockData; primaries: string[] }
  >();
  linkedBlocks.forEach((conditional, primaryId) => {
    const entry = primariesByConditional.get(conditional.id) ?? {
      block: conditional,
      primaries: [],
    };
    entry.primaries.push(primaryId);
    primariesByConditional.set(conditional.id, entry);
  });

  primariesByConditional.forEach(({ block, primaries }, conditionalId) => {
    if (primaries.length > 1) {
      throw new Error(
        `Block "${conditionalId}" is named as the conditional of more than one ` +
          `primary order (${primaries.join(", ")}). A conditional close attaches ` +
          "to exactly one primary order, so this strategy cannot be submitted.",
      );
    }

    const onward = linkedBlocks.get(conditionalId);
    if (onward) {
      throw new Error(
        `Block "${conditionalId}" is the conditional of "${primaries[0]}" and ` +
          `itself links to "${onward.id}". A conditional close carries no ` +
          "conditional of its own, so this strategy cannot be submitted.",
      );
    }

    const orderType = mapOrderType(block.orderType);
    if (!isConditionalOrderType(orderType)) {
      throw new Error(
        `Block "${conditionalId}" is linked as the conditional of ` +
          `"${primaries[0]}", but Kraken cannot use a ${orderType} order as a ` +
          "conditional close, so this strategy cannot be submitted.",
      );
    }
  });
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

  // The skip below drops every block that is somebody's conditional, which is
  // correct only for a flat one-level link graph. Breaking a bad shape by
  // electing one block the primary was the alternative, and it was rejected: it
  // would send a real set of orders that the user never asked for, which is the
  // same silent substitution the rest of this module exists to prevent.
  assertLinksAreFlat(blocks, linkedBlocks);

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
 *
 * `market` is optional because this is an exported entry point and a caller may
 * legitimately hold a payload without the pair's metadata. When it is supplied
 * the per-pair rules are checked too, and a caller building an order for real
 * always has it - `mapGridToOrders` cannot run without one.
 */
export const validateOrder = (
  params: OrderParams,
  market?: MarketPrecision,
): string[] => {
  const errors: string[] = [];

  if (!params.symbol) {
    errors.push("Symbol is required");
  }

  // A record describing a different pair is worse than none: it would apply
  // ARB's 60-token minimum to a BTC order. Say so rather than check the wrong
  // rules or quietly skip the check.
  if (market && market.symbol !== params.symbol) {
    errors.push(
      `Order is for ${params.symbol} but was checked against ${market.symbol} rules`,
    );
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
  if (LIMIT_PRICE_ORDER_TYPES.has(params.order_type) && !params.limit_price) {
    errors.push(`Limit price is required for ${params.order_type} orders`);
  }

  // Validate trigger for trigger-based orders
  if (TRIGGER_ORDER_TYPES.has(params.order_type) && !params.triggers) {
    errors.push(
      `Trigger configuration is required for ${params.order_type} orders`,
    );
  }

  // The conditional close is a whole order too, and the same required-price
  // rules apply to it. Without this an incomplete conditional validated clean
  // while the identical shape as a primary was rejected, so the guarantee that a
  // split dual-axis leg fails validation rather than shipping as a wrong order
  // held on one half of the payload only. The messages name the conditional so a
  // reader can tell which half is incomplete.
  const conditional = params.conditional;
  if (conditional) {
    if (
      LIMIT_PRICE_ORDER_TYPES.has(conditional.order_type) &&
      !conditional.limit_price
    ) {
      errors.push(
        `Conditional limit price is required for ${conditional.order_type} conditional closes`,
      );
    }

    if (
      TRIGGER_ORDER_TYPES.has(conditional.order_type) &&
      !conditional.trigger_price
    ) {
      errors.push(
        `Conditional trigger price is required for ${conditional.order_type} conditional closes`,
      );
    }
  }

  // Every price the payload carries has to be a finite number, and a static one
  // has to be positive. A presence check is not enough: prices are strings here,
  // so "0.0" is truthy and an order priced at zero validated cleanly. That
  // became reachable when decision D3 removed the mapper's 0.1 damping - a
  // yPosition of 100 on a downside block is a 100% offset, which is a price of
  // 0, where the damped maths used to land on 45,000.
  //
  // Positivity is checked only for a static price because under a `pct` or
  // `quote` price type the value is a signed offset, so a relative limit price
  // of "-1.5" is legitimate. The mapper emits nothing but static prices today,
  // which is not a reason to guard more broadly: `validateOrder` is this
  // module's exported validation entry point, so a wrong guard is a trap for
  // the next caller rather than a harmless dead branch.
  //
  // This is the last line of defence, and it is now genuinely the last one
  // rather than the only one. The upstream bug it was written for is fixed: the
  // drop handler used to write a raw 0-100 reading into the block while the
  // slider and the axis labels ran to 50, so a block dragged to the bottom of
  // its cell was a 100% offset and a price of zero. Positions now flow through
  // `offsetForOrder` in `utils/blockMapping.ts` on every path into a payload,
  // so a zero static price is unreachable rather than merely unlikely. That
  // helper deliberately does not absorb a non-finite position the way the
  // display clamp does, and nothing upstream of it absorbs one either - the
  // hydration path used to, which is what made this check unreachable while a
  // comment here claimed it was the last line of defence. This stays, because a
  // validator that trusts its callers is not a validator.
  const requirePrice = (
    label: string,
    value?: string,
    priceType?: PriceType,
  ): void => {
    if (value === undefined) {
      return;
    }

    const price = Number(value);
    if (!Number.isFinite(price)) {
      errors.push(`${label} must be a finite number`);
      return;
    }

    if ((priceType ?? "static") === "static" && price <= 0) {
      errors.push(`${label} must be a positive number`);
    }
  };

  requirePrice("Limit price", params.limit_price, params.limit_price_type);
  requirePrice(
    "Trigger price",
    params.triggers?.price,
    params.triggers?.price_type,
  );
  requirePrice(
    "Top-level trigger price",
    params.trigger_price,
    params.trigger_price_type,
  );
  requirePrice(
    "Conditional limit price",
    params.conditional?.limit_price,
    params.conditional?.limit_price_type,
  );
  requirePrice(
    "Conditional trigger price",
    params.conditional?.trigger_price,
    params.conditional?.trigger_price_type,
  );

  // The smallest order Kraken accepts differs by three orders of magnitude
  // across the pairs this app offers - 0.00005 BTC against 60 ARB - so a
  // quantity that is a perfectly good BTC order is refused outright on ARB.
  // Kraken refuses it after submission, which reaches the user as an order that
  // simply never appeared, so it is caught here instead.
  //
  // `costMin` is recorded on the record but deliberately not checked: cost is
  // quantity x price and a market order carries no price, so enforcing it would
  // reject some order types and wave the others through within one strategy.
  if (
    market &&
    market.symbol === params.symbol &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    quantity < market.orderMin
  ) {
    errors.push(
      `Order quantity ${params.order_qty} is below the ${params.symbol} minimum of ${market.orderMin}`,
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
