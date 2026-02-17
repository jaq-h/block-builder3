import React, { useState, useRef, useId, useCallback, useMemo } from "react";
import type {
  GridData,
  CellPosition,
  OrderConfig,
  StrategyPattern,
} from "../../../types/grid";
import { clearGrid } from "../../../utils";
import { ORDER_TYPES } from "../../../data/orderTypes";
import type { StrategyAssemblyProviderProps } from "../../../types/strategyAssembly";
import {
  GridDataContext,
  DragContext,
  HoverContext,
  StaticContext,
} from "./contexts";

// Provider component — nests 4 contexts from most stable (outer) to most volatile (inner)
export function StrategyAssemblyProvider({
  children,
  onConfigChange,
  initialConfig = {},
  initialPattern = "conditional",
}: StrategyAssemblyProviderProps): React.ReactElement {
  const baseId = useId();
  const blockCounterRef = useRef(0);

  // ─── Business state ────────────────────────────────────────────────
  const [grid, setGrid] = useState<GridData>(() => clearGrid(2, 3));
  const [orderConfig, setOrderConfigInternal] =
    useState<OrderConfig>(initialConfig);
  const [strategyPattern, setStrategyPattern] =
    useState<StrategyPattern>(initialPattern);

  // ─── Drag UI state ─────────────────────────────────────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingFromProvider, setDraggingFromProvider] = useState<
    string | null
  >(null);
  const [hoverCell, setHoverCell] = useState<CellPosition | null>(null);

  // ─── Hover UI state ────────────────────────────────────────────────
  const [hoveredProviderId, setHoveredProviderId] = useState<string | null>(
    null,
  );
  const [hoveredGridCell, setHoveredGridCell] = useState<CellPosition | null>(
    null,
  );

  // ─── Derived actions ───────────────────────────────────────────────

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

  // ─── Memoized context values ───────────────────────────────────────

  // Static: never changes after mount
  const staticValue = useMemo(
    () => ({
      providerBlocks: ORDER_TYPES,
      baseId,
      blockCounterRef,
    }),
    [baseId],
  );

  // Grid data: changes only on block placement/move/delete/pattern switch
  const gridDataValue = useMemo(
    () => ({
      grid,
      orderConfig,
      strategyPattern,
      setGrid,
      setOrderConfig,
      setStrategyPattern,
      clearAll,
      reverseBlocks,
    }),
    [
      grid,
      orderConfig,
      strategyPattern,
      setOrderConfig,
      clearAll,
      reverseBlocks,
    ],
  );

  // Drag: changes on drag start/end and during drag (hoverCell tracking)
  const dragValue = useMemo(
    () => ({
      draggingId,
      draggingFromProvider,
      hoverCell,
      setDraggingId,
      setDraggingFromProvider,
      setHoverCell,
    }),
    [draggingId, draggingFromProvider, hoverCell],
  );

  // Hover: changes on every mouse enter/leave — most volatile
  const hoverValue = useMemo(
    () => ({
      hoveredProviderId,
      hoveredGridCell,
      setHoveredProviderId,
      setHoveredGridCell,
    }),
    [hoveredProviderId, hoveredGridCell],
  );

  // ─── Nested providers: outermost = most stable, innermost = most volatile
  return (
    <StaticContext.Provider value={staticValue}>
      <GridDataContext.Provider value={gridDataValue}>
        <DragContext.Provider value={dragValue}>
          <HoverContext.Provider value={hoverValue}>
            {children}
          </HoverContext.Provider>
        </DragContext.Provider>
      </GridDataContext.Provider>
    </StaticContext.Provider>
  );
}
