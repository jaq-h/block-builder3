// =============================================================================
// BLOCK FACTORY - Utilities for creating BlockData from OrderTypeDefinition
// =============================================================================

import type { BlockData } from "../types/grid";
import type { AxisType, OrderTypeDefinition, SvgIcon } from "../data/orderTypes";
import { getDefaultPosition, ORDER_TYPES } from "../data/orderTypes";
import { clampOffset } from "./blockMapping";
import LimitIcon from "../assets/icons/limit.svg?react";

// =============================================================================
// TYPES
// =============================================================================

export interface BlockCreationContext {
  baseId: string;
  counter: number;
}

export interface CreatedBlocks {
  blocks: BlockData[];
  nextCounter: number;
}

// Limit icon for limit axis (imported for proper Vite bundling)
const LIMIT_ICON = LimitIcon;

// =============================================================================
// ICON HELPERS
// =============================================================================

/**
 * Get the base (non-limit) version icon for a limit order type
 * e.g., "stop-loss-limit" -> stop-loss icon
 *       "take-profit-limit" -> take-profit icon
 *       "trailing-stop-limit" -> trailing-stop icon
 */
const getBaseOrderIcon = (orderType: string): SvgIcon | undefined => {
  if (orderType.endsWith("-limit")) {
    const baseType = orderType.replace("-limit", "");
    const baseOrderDef = ORDER_TYPES.find((ot) => ot.type === baseType);
    return baseOrderDef?.icon;
  }
  return undefined;
};

/**
 * Determine the icons for a block based on its order type and axes
 * - providerIcon: The full order type icon (shown in provider column)
 * - triggerIcon: Icon for trigger axis (base order type icon for limit variants)
 * - limitIcon: Icon for limit axis (always the limit icon)
 */
const getBlockIcons = (
  orderType: OrderTypeDefinition,
): {
  providerIcon?: SvgIcon;
  triggerIcon?: SvgIcon;
  limitIcon?: SvgIcon;
} => {
  const { type, icon, axes } = orderType;

  const result: {
    providerIcon?: SvgIcon;
    triggerIcon?: SvgIcon;
    limitIcon?: SvgIcon;
  } = {
    providerIcon: icon,
  };

  // Determine trigger icon
  if (axes.includes("trigger")) {
    const baseIcon = getBaseOrderIcon(type);
    result.triggerIcon = baseIcon || icon;
  }

  // Determine limit icon
  if (axes.includes("limit")) {
    result.limitIcon = LIMIT_ICON;
  }

  return result;
};

// =============================================================================
// BLOCK CREATION
// =============================================================================

/**
 * The axes a single placed block owns, given its order type's full axes list
 * and the axis it sits on (axis 1 = trigger, axis 2 = limit).
 *
 * A dual-axis order type is placed as one block per axis, and each leg carries
 * only its own. Give a leg the order type's whole list and it claims both, so
 * the mapper reads one slider twice and sends a payload whose trigger price and
 * limit price are the same number.
 */
export const axesForBlockAxis = (
  typeAxes: AxisType[],
  axis: 1 | 2,
): AxisType[] => {
  if (typeAxes.length <= 1) {
    return [...typeAxes];
  }

  return axis === 1 ? ["trigger"] : ["limit"];
};

/**
 * Creates BlockData instances from an OrderTypeDefinition
 * Handles all cases: no-axis, limit-only, trigger-only, and dual-axis
 */
export const createBlocksFromOrderType = (
  orderType: OrderTypeDefinition,
  context: BlockCreationContext,
): CreatedBlocks => {
  const { baseId, counter } = context;
  const blocks: BlockData[] = [];
  let currentCounter = counter;
  const { type, label, icon, abrv, allowedRows, axes } = orderType;

  // Get icons for this order type
  const { providerIcon, triggerIcon, limitIcon } = getBlockIcons(orderType);

  // Case 1: No axes (Market order) - no price data
  if (axes.length === 0) {
    currentCounter += 1;
    blocks.push({
      id: `${baseId}-${type}-${currentCounter}`,
      orderType: type,
      label,
      icon,
      providerIcon,
      triggerIcon,
      limitIcon,
      abrv,
      allowedRows,
      axis: 1,
      yPosition: -1,
      // Placeholder. `addBlocksToCell` stamps the cell's own direction over it
      // the moment these blocks land, because the scale belongs to the cell.
      direction: "upside",
      axes: [],
    });
  }
  // Case 2: Limit-only
  else if (axes.length === 1 && axes[0] === "limit") {
    currentCounter += 1;
    blocks.push({
      id: `${baseId}-${type}-${currentCounter}`,
      orderType: type,
      label,
      icon,
      providerIcon,
      triggerIcon,
      limitIcon,
      abrv,
      allowedRows,
      axis: 2,
      yPosition: clampOffset(getDefaultPosition(orderType, "limit")),
      direction: "upside",
      axes: ["limit"],
    });
  }
  // Case 3: Trigger-only
  else if (axes.length === 1 && axes[0] === "trigger") {
    currentCounter += 1;
    blocks.push({
      id: `${baseId}-${type}-${currentCounter}`,
      orderType: type,
      label,
      icon,
      providerIcon,
      triggerIcon,
      limitIcon,
      abrv,
      allowedRows,
      axis: 1,
      yPosition: clampOffset(getDefaultPosition(orderType, "trigger")),
      direction: "upside",
      axes: ["trigger"],
    });
  }
  // Case 4: Dual-axis (trigger + limit)
  else if (axes.includes("trigger") && axes.includes("limit")) {
    currentCounter += 1;
    blocks.push({
      id: `${baseId}-${type}-${currentCounter}`,
      orderType: type,
      label,
      icon,
      providerIcon,
      triggerIcon,
      limitIcon,
      abrv,
      allowedRows,
      axis: 1,
      yPosition: clampOffset(getDefaultPosition(orderType, "trigger")),
      direction: "upside",
      axes: ["trigger"],
    });

    currentCounter += 1;
    blocks.push({
      id: `${baseId}-${type}-limit-${currentCounter}`,
      orderType: type,
      label,
      icon,
      providerIcon,
      triggerIcon,
      limitIcon,
      abrv: `${abrv}-L`,
      allowedRows,
      axis: 2,
      yPosition: clampOffset(getDefaultPosition(orderType, "limit")),
      direction: "upside",
      axes: ["limit"],
    });
  }

  return { blocks, nextCounter: currentCounter };
};

// =============================================================================
// BLOCK HELPERS
// =============================================================================

/** Check if a block should show percentage */
export const shouldShowPercentage = (block: BlockData): boolean =>
  block.axes.length > 0 && block.yPosition >= 0;

// Whether a block sits on a price axis, and the saved form of a whole grid,
// both belong to `utils/blockMapping.ts` - `legOfBlock` and
// `orderConfigFromGrid` respectively. They used to live here as
// `isBlockVerticallyDraggable` and `buildOrderConfigEntry`, and the grid's
// saved form cannot be built from a block alone: it carries the cell's scale.
