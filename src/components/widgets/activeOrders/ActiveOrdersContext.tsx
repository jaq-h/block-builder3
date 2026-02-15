import React, { useState, useCallback, useEffect, useMemo } from "react";
import type {
  ActiveOrdersContextType,
  ActiveOrdersProviderProps,
  ActiveOrdersConfig,
} from "../../../types/activeOrders";
import type { GridData, CellPosition } from "../../../types/grid";
import { GRID_CONFIG } from "../../../data/orderTypes";
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

export const ActiveOrdersProvider: React.FC<ActiveOrdersProviderProps> = ({
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
  const refreshOrders = useCallback(() => {
    // TODO: Implement API call to fetch active orders
    // For now, this is a placeholder that could be connected to an API
    console.log("Refreshing active orders...");
  }, []);

  // Derive grid from active orders
  const grid = useMemo<GridData>(() => {
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
          axes: order.axis
            ? ((order.axis === 1 ? ["trigger"] : ["limit"]) as (
                | "trigger"
                | "limit"
              )[])
            : [],
        };
        newGrid[order.col][order.row].push(block);
      }
    });

    return newGrid;
  }, [activeOrders]);

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
