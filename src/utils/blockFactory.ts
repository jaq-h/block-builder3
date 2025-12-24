// Block factory utilities for creating BlockData from OrderTypeDefinition
import type { BlockData } from "./cardAssemblyUtils";
import type { OrderTypeDefinition } from "../data/orderTypes";
import { getDefaultPosition, ORDER_TYPES } from "../data/orderTypes";

export interface BlockCreationContext {
  baseId: string;
  counter: number;
}

export interface CreatedBlocks {
  blocks: BlockData[];
  nextCounter: number;
}

// Icon paths
const LIMIT_ICON = "/src/assets/icons/limit.svg";

/**
 * Get the base (non-limit) version icon for a limit order type
 * e.g., "stop-loss-limit" -> stop-loss icon
 *       "take-profit-limit" -> take-profit icon
 *       "trailing-stop-limit" -> trailing-stop icon
 */
const getBaseOrderIcon = (orderType: string): string | undefined => {
  // If it's a limit variant, find the base order type
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
  providerIcon?: string;
  triggerIcon?: string;
  limitIcon?: string;
} => {
  const { type, icon, axes } = orderType;

  const result: {
    providerIcon?: string;
    triggerIcon?: string;
    limitIcon?: string;
  } = {
    providerIcon: icon,
  };

  // Determine trigger icon
  if (axes.includes("trigger")) {
    // For limit variants (e.g., stop-loss-limit), use the base order icon
    const baseIcon = getBaseOrderIcon(type);
    result.triggerIcon = baseIcon || icon;
  }

  // Determine limit icon
  if (axes.includes("limit")) {
    result.limitIcon = LIMIT_ICON;
  }

  return result;
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

/** Cell display mode based on blocks' axes configurations */
export type CellDisplayMode = "empty" | "no-axis" | "limit-only" | "dual-axis";

export const getCellDisplayMode = (blocks: BlockData[]): CellDisplayMode => {
  if (blocks.length === 0) return "empty";
  if (blocks.every((b) => b.axes.length === 0)) return "no-axis";
  if (blocks.every((b) => b.axes.length === 1 && b.axes[0] === "limit"))
    return "limit-only";
  return "dual-axis";
};

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
