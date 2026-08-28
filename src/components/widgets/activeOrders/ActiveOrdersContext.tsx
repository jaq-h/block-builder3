import { useState, useEffect, type FC } from "react";
import type {
  ActiveOrdersContextType,
  ActiveOrdersProviderProps,
  ActiveOrdersConfig,
} from "../../../types/activeOrders";
import type { GridData, CellPosition } from "../../../types/grid";
import { GRID_CONFIG } from "../../../data/orderTypes";
import { directionForNewCell, normaliseCellDirections } from "../../../utils";
import { axesForOrder } from "./orderAxes";
import { ActiveOrdersContext } from "./ActiveOrdersContextDef";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Create an empty grid */
const createEmptyGrid = (): GridData =>
  Array.from({ length: GRID_CONFIG.numColumns }, () =>
    Array.from({ length: GRID_CONFIG.numRows }, () => []),
  );

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
          direction:
            order.direction ??
            directionForNewCell(order.row, order.col, undefined, order.type),
          axes: axesForOrder(order.type, order.axis),
        };
        newGrid[order.col][order.row].push(block);
      }
    });

    // A cell draws one scale, and every block in it is priced on it (decision
    // D8). This panel builds its grid entry by entry from records written
    // before that rule existed, so it goes through the same normaliser the
    // builder's own hydration does - otherwise an order card could show a price
    // the cell it was built in never drew.
    return normaliseCellDirections(newGrid);
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
