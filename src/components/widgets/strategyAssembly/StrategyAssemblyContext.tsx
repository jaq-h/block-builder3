import { useEffect, useMemo, useState, useRef, useId } from "react";
import type {
  GridData,
  BlockData,
  BlockDirection,
  CellPosition,
  OrderConfig,
  StrategyPattern,
} from "../../../types/grid";
import {
  axesForBlockAxis,
  clearGrid,
  directionForNewCell,
  normaliseCellDirections,
  orderConfigFromGrid,
} from "../../../utils";
import { ORDER_TYPES } from "../../../data/orderTypes";

/**
 * Reconstruct a GridData visual state from a saved OrderConfig.
 *
 * Two things keep a reloaded grid identical to the live one it came from:
 *
 * - `axesForBlockAxis` derives `axes` from the saved `axis`, and it is the only
 *   thing in the app that derives one from the other. Nothing rewrites `axis`
 *   after a block is built any more - the drop handler used to, from the
 *   pointer's x-half, without touching `axes` - so a Stop Loss Limit's trigger
 *   leg comes back as the trigger leg it was.
 * - `normaliseCellDirections` puts the whole grid on the cell-owned scale
 *   (decision D8), so a strategy saved before that rule existed is drawn and
 *   priced the same way a freshly built one is.
 *
 * The saved position is copied across as it stands, deliberately. Clamping it
 * here answered a non-finite value with zero, and zero is the market price - a
 * finite, positive number `validateOrder` accepts - so a corrupt saved position
 * came back as a plausible at-market order rather than a refused one. Note that
 * `?? 0` does not catch it either: `NaN` is not nullish. Consumers clamp what
 * they read instead: the cells for display, `offsetForOrder` for a payload.
 */
function gridFromConfig(config: OrderConfig): GridData {
  const g = clearGrid(2, 3);
  Object.entries(config).forEach(([id, entry]) => {
    const typeDef = ORDER_TYPES.find((ot) => ot.type === entry.type);
    if (!typeDef) return;
    if (entry.col < 0 || entry.col >= 2 || entry.row < 0 || entry.row >= 3)
      return;
    const direction: BlockDirection =
      entry.direction ??
      directionForNewCell(entry.row, entry.col, "conditional", entry.type);
    const axis = entry.axis ?? 2;
    const block: BlockData = {
      id,
      orderType: entry.type,
      label: typeDef.label,
      icon: typeDef.icon,
      abrv: typeDef.abrv,
      allowedRows: typeDef.allowedRows,
      axis,
      yPosition: entry.yPosition ?? 0,
      direction,
      axes: axesForBlockAxis(typeDef.axes, axis),
    };
    g[entry.col][entry.row].push(block);
  });
  return normaliseCellDirections(g);
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
  // The grid is the store; the saved config is a projection of it.
  //
  // These used to be two states written side by side at every call site that
  // touched a block, which is how the chart came to draw a direction the cell
  // had already changed its mind about. `orderConfigFromGrid` is the mapping
  // owner's, so the chart, the Active Orders cards and a saved strategy read
  // exactly what the grid holds.
  const orderConfig = useMemo(() => orderConfigFromGrid(grid), [grid]);
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

  // The parent is told what the config became, and it is told AFTER the fact.
  // Notifying from inside the updater is a `setState` on another component
  // while React is rendering this one: it logged "Cannot update a component
  // while rendering a different component" on every single block placement, and
  // under StrictMode - which runs every updater twice to surface exactly this -
  // the parent was handed each change twice. This effect is the only thing that
  // talks upwards, and the `useMemo` above is what keeps it from firing on
  // renders that did not touch the grid.
  const notifiedRef = useRef(orderConfig);
  useEffect(() => {
    if (notifiedRef.current === orderConfig) return;
    notifiedRef.current = orderConfig;
    onConfigChange?.(orderConfig);
  }, [orderConfig, onConfigChange]);

  const clearAll = () => {
    setGrid(clearGrid(2, 3));
  };

  /**
   * Swap the entry and exit columns, and flip which side of the market every
   * cell reads from.
   *
   * The flip is applied to every block in a cell, so the cell keeps one scale
   * either way - the invariant `cellDirection` rests on. The saved config
   * follows on its own, because it is derived from this grid.
   */
  const reverseBlocks = () => {
    const flipDirection = (d: BlockDirection): BlockDirection =>
      d === "downside" ? "upside" : "downside";
    const flipCell = (cell: BlockData[]) =>
      cell.map((b) => ({ ...b, direction: flipDirection(b.direction) }));
    setGrid((prev) => [
      prev[1].map(flipCell),
      prev[0].map(flipCell),
    ]);
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
