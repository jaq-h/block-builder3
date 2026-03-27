import { useState, useRef, useId } from "react";
import type {
  GridData,
  BlockData,
  BlockDirection,
  CellPosition,
  OrderConfig,
  StrategyPattern,
} from "../../../types/grid";
import { clearGrid, shouldBeDescending } from "../../../utils";
import { ORDER_TYPES } from "../../../data/orderTypes";

/** Reconstruct a GridData visual state from a saved OrderConfig */
function gridFromConfig(config: OrderConfig): GridData {
  const g = clearGrid(2, 3);
  Object.entries(config).forEach(([id, entry]) => {
    const typeDef = ORDER_TYPES.find((ot) => ot.type === entry.type);
    if (!typeDef) return;
    if (entry.col < 0 || entry.col >= 2 || entry.row < 0 || entry.row >= 3)
      return;
    const direction: BlockDirection =
      entry.direction ??
      (shouldBeDescending(entry.row, entry.col, "conditional", entry.type)
        ? "downside"
        : "upside");
    const block: BlockData = {
      id,
      orderType: entry.type,
      label: typeDef.label,
      icon: typeDef.icon,
      abrv: typeDef.abrv,
      allowedRows: typeDef.allowedRows,
      axis: entry.axis ?? 2,
      yPosition: entry.yPosition ?? 0,
      direction,
      axes: typeDef.axes,
    };
    g[entry.col][entry.row].push(block);
  });
  return g;
}
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
  const [grid, setGrid] = useState<GridData>(() =>
    Object.keys(initialConfig).length > 0
      ? gridFromConfig(initialConfig)
      : clearGrid(2, 3),
  );
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
  const setOrderConfig: React.Dispatch<React.SetStateAction<OrderConfig>> = (
    action,
  ) => {
    setOrderConfigInternal((prev) => {
      const newConfig = typeof action === "function" ? action(prev) : action;
      onConfigChange?.(newConfig);
      return newConfig;
    });
  };

  const clearAll = () => {
    setGrid(clearGrid(2, 3));
    setOrderConfig({});
  };

  const reverseBlocks = () => {
    const flipDirection = (d: BlockDirection): BlockDirection =>
      d === "downside" ? "upside" : "downside";
    setGrid((prev) => [
      [...prev[1].map((row) => row.map((b) => ({ ...b, direction: flipDirection(b.direction) })))],
      [...prev[0].map((row) => row.map((b) => ({ ...b, direction: flipDirection(b.direction) })))],
    ]);
    setOrderConfig((prev) => {
      const updated: OrderConfig = {};
      Object.entries(prev).forEach(([blockId, config]) => {
        updated[blockId] = {
          ...config,
          col: config.col === 0 ? 1 : 0,
          direction: config.direction === "downside" ? "upside" : "downside",
        };
      });
      return updated;
    });
  };

  // ─── Context values ────────────────────────────────────────────────

  // Static: never changes after mount
  const staticValue = {
    providerBlocks: ORDER_TYPES,
    baseId,
    blockCounterRef,
  };

  // Grid data: changes only on block placement/move/delete/pattern switch
  const gridDataValue = {
    grid,
    orderConfig,
    strategyPattern,
    setGrid,
    setOrderConfig,
    setStrategyPattern,
    clearAll,
    reverseBlocks,
  };

  // Drag: changes on drag start/end and during drag (hoverCell tracking)
  const dragValue = {
    draggingId,
    draggingFromProvider,
    hoverCell,
    setDraggingId,
    setDraggingFromProvider,
    setHoverCell,
  };

  // Hover: changes on every mouse enter/leave — most volatile
  const hoverValue = {
    hoveredProviderId,
    hoveredGridCell,
    setHoveredProviderId,
    setHoveredGridCell,
  };

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
