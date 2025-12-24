import React, { useState, useRef, useId, useCallback } from "react";
import type { GridData, CellPosition } from "../../../utils/cardAssemblyUtils";
import { clearGrid } from "../../../utils/cardAssemblyUtils";
import { ORDER_TYPES } from "../../../data/orderTypes";
import type {
  OrderConfig,
  StrategyPattern,
  StrategyAssemblyContextType,
  StrategyAssemblyProviderProps,
} from "./StrategyAssemblyTypes";
import { StrategyAssemblyContext } from "./useStrategyAssembly";

// Provider component
export function StrategyAssemblyProvider({
  children,
  onConfigChange,
  initialConfig = {},
  initialPattern = "conditional",
}: StrategyAssemblyProviderProps): React.ReactElement {
  const baseId = useId();
  const blockCounterRef = useRef(0);

  // Business state
  const [grid, setGrid] = useState<GridData>(() => clearGrid(2, 3));
  const [orderConfig, setOrderConfigInternal] =
    useState<OrderConfig>(initialConfig);
  const [strategyPattern, setStrategyPattern] =
    useState<StrategyPattern>(initialPattern);

  // UI state (internal only)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingFromProvider, setDraggingFromProvider] = useState<
    string | null
  >(null);
  const [hoveredProviderId, setHoveredProviderId] = useState<string | null>(
    null,
  );
  const [hoverCell, setHoverCell] = useState<CellPosition | null>(null);
  const [hoveredGridCell, setHoveredGridCell] = useState<CellPosition | null>(
    null,
  );

  // Wrap setOrderConfig to notify parent
  const setOrderConfig: React.Dispatch<React.SetStateAction<OrderConfig>> =
    useCallback(
      (action) => {
        setOrderConfigInternal((prev) => {
          const newConfig =
            typeof action === "function" ? action(prev) : action;
          onConfigChange?.(newConfig);
          return newConfig;
        });
      },
      [onConfigChange],
    );

  const clearAll = useCallback(() => {
    setGrid(clearGrid(2, 3));
    setOrderConfig({});
  }, [setOrderConfig]);

  const reverseBlocks = useCallback(() => {
    setGrid((prev) => [
      [...prev[1].map((row) => [...row])],
      [...prev[0].map((row) => [...row])],
    ]);
    setOrderConfig((prev) => {
      const updated: OrderConfig = {};
      Object.entries(prev).forEach(([blockId, config]) => {
        updated[blockId] = { ...config, col: config.col === 0 ? 1 : 0 };
      });
      return updated;
    });
  }, [setOrderConfig]);

  const value: StrategyAssemblyContextType = {
    grid,
    orderConfig,
    strategyPattern,
    draggingId,
    draggingFromProvider,
    hoveredProviderId,
    hoverCell,
    hoveredGridCell,
    providerBlocks: ORDER_TYPES,
    baseId,
    blockCounterRef,
    setGrid,
    setOrderConfig,
    setStrategyPattern,
    setDraggingId,
    setDraggingFromProvider,
    setHoveredProviderId,
    setHoverCell,
    setHoveredGridCell,
    clearAll,
    reverseBlocks,
  };

  return (
    <StrategyAssemblyContext.Provider value={value}>
      {children}
    </StrategyAssemblyContext.Provider>
  );
}
