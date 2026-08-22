import { useState, useEffect, type FC } from "react";
import type {
  ActiveOrdersContextType,
  ActiveOrdersProviderProps,
  ActiveOrdersConfig,
} from "../../../types/activeOrders";
import type { GridData, CellPosition } from "../../../types/grid";
import type { AxisType } from "../../../data/orderTypes";
import { GRID_CONFIG, ORDER_TYPES } from "../../../data/orderTypes";
import { axesForBlockAxis, shouldBeDescending } from "../../../utils";
import { ActiveOrdersContext } from "./ActiveOrdersContextDef";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Create an empty grid */
const createEmptyGrid = (): GridData =>
  Array.from({ length: GRID_CONFIG.numColumns }, () =>
    Array.from({ length: GRID_CONFIG.numRows }, () => []),
  );

/**
 * The axes a submitted order's block owns, through the one owner of the
 * axis-to-axes rule.
 *
 * This panel used to derive the rule itself, as `axis === 1 ? trigger : limit`,
 * which has no notion of a single-axis order type: a Stop Loss released in the
 * right half of its cell is saved with `axis: 2` and came back here labelled a
 * limit leg, while the assembly grid reloaded the same order as a trigger one.
 * Routing this last consumer through `axesForBlockAxis` leaves one derivation
 * of the fact rather than two that can disagree.
 */
const axesForOrder = (type: string, axis?: 1 | 2): AxisType[] => {
  if (!axis) {
    return [];
  }

  const typeDef = ORDER_TYPES.find((ot) => ot.type === type);

  // An order whose type is not in the catalogue keeps the raw rule rather than
  // being dropped. `gridFromConfig` skips such an entry because a missing block
  // in the builder is harmless, but an order that was actually submitted has to
  // stay visible in the list.
  if (!typeDef) {
    return axis === 1 ? ["trigger"] : ["limit"];
  }

  return axesForBlockAxis(typeDef.axes, axis);
};

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

export const ActiveOrdersProvider: FC<ActiveOrdersProviderProps> = ({
  children,
  initialOrders = {},
  onOrderSelect,
}) => {
  // Business state
  const [activeOrders, setActiveOrders] =
    useState<ActiveOrdersConfig>(initialOrders);

  // UI state
  const [hoveredCell, setHoveredCell] = useState<CellPosition | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Notify parent when order selection changes
  useEffect(() => {
    onOrderSelect?.(selectedOrderId);
  }, [selectedOrderId, onOrderSelect]);

  // Refresh orders - placeholder for API integration
  const refreshOrders = () => {
    // TODO: Implement API call to fetch active orders
    // For now, this is a placeholder that could be connected to an API
    console.log("Refreshing active orders...");
  };

  // Derive grid from active orders
  const grid: GridData = (() => {
    const newGrid = createEmptyGrid();

    // Populate grid from active orders
    Object.entries(activeOrders).forEach(([id, order]) => {
      if (
        order.col >= 0 &&
        order.col < GRID_CONFIG.numColumns &&
        order.row >= 0 &&
        order.row < GRID_CONFIG.numRows
      ) {
        // Create a block from the order
        const block = {
          id,
          orderType: order.type,
          label: order.type,
          abrv: order.type.substring(0, 3).toUpperCase(),
          allowedRows: [order.row],
          axis: order.axis || 1,
          yPosition: order.yPosition || 0,
          direction: order.direction ??
            (shouldBeDescending(order.row, order.col, undefined, order.type) ? "downside" as const : "upside" as const),
          axes: axesForOrder(order.type, order.axis),
        };
        newGrid[order.col][order.row].push(block);
      }
    });

    return newGrid;
  })();

  // Combine state and actions
  const contextValue: ActiveOrdersContextType = {
    // State
    grid,
    activeOrders,
    hoveredCell,
    selectedOrderId,

    // Actions
    setActiveOrders,
    setHoveredCell,
    setSelectedOrderId,
    refreshOrders,
  };

  return (
    <ActiveOrdersContext.Provider value={contextValue}>
      {children}
    </ActiveOrdersContext.Provider>
  );
};
