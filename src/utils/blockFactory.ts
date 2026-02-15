// =============================================================================
// BLOCK FACTORY - Utilities for creating BlockData from OrderTypeDefinition
// =============================================================================

import type { BlockData } from "../types/grid";
import type { OrderTypeDefinition, SvgIcon } from "../data/orderTypes";
import { getDefaultPosition, ORDER_TYPES } from "../data/orderTypes";
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
      yPosition: getDefaultPosition(orderType, "limit"),
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
      yPosition: getDefaultPosition(orderType, "trigger"),
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
      yPosition: getDefaultPosition(orderType, "trigger"),
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
      yPosition: getDefaultPosition(orderType, "limit"),
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

/** Check if a block is vertically draggable */
export const isBlockVerticallyDraggable = (block: BlockData): boolean =>
  block.axes.length > 0;

/** Build order config entry for a block */
export const buildOrderConfigEntry = (
  block: BlockData,
  col: number,
  row: number,
  type: string,
): {
  col: number;
  row: number;
  type: string;
  axis?: 1 | 2;
  yPosition?: number;
} => {
  if (block.axes.length === 0) {
    return { col, row, type };
  }
  return { col, row, axis: block.axis, yPosition: block.yPosition, type };
};
