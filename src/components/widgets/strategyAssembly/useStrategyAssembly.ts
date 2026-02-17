import type { StrategyAssemblyContextType } from "../../../types/strategyAssembly";
import { useGridData } from "./contexts/GridDataContext";
import { useDrag } from "./contexts/DragContext";
import { useHover } from "./contexts/HoverContext";
import { useStatic } from "./contexts/StaticContext";

/**
 * Backward-compatible hook that merges all 4 split contexts into the original
 * combined StrategyAssemblyContextType shape.
 *
 * Prefer using the individual hooks (useGridData, useDrag, useHover, useStatic)
 * in new code — each subscribes only to its own context, so components re-render
 * only when the slice they care about changes.
 *
 * This combined hook will re-render whenever ANY of the 4 contexts change,
 * which is the same behavior as the original monolithic context.
 */
export function useStrategyAssembly(): StrategyAssemblyContextType {
  const gridData = useGridData();
  const drag = useDrag();
  const hover = useHover();
  const staticCtx = useStatic();

  return {
    // GridDataContext
    grid: gridData.grid,
    orderConfig: gridData.orderConfig,
    strategyPattern: gridData.strategyPattern,
    setGrid: gridData.setGrid,
    setOrderConfig: gridData.setOrderConfig,
    setStrategyPattern: gridData.setStrategyPattern,
    clearAll: gridData.clearAll,
    reverseBlocks: gridData.reverseBlocks,

    // DragContext
    draggingId: drag.draggingId,
    draggingFromProvider: drag.draggingFromProvider,
    hoverCell: drag.hoverCell,
    setDraggingId: drag.setDraggingId,
    setDraggingFromProvider: drag.setDraggingFromProvider,
    setHoverCell: drag.setHoverCell,

    // HoverContext
    hoveredProviderId: hover.hoveredProviderId,
    hoveredGridCell: hover.hoveredGridCell,
    setHoveredProviderId: hover.setHoveredProviderId,
    setHoveredGridCell: hover.setHoveredGridCell,

    // StaticContext
    providerBlocks: staticCtx.providerBlocks,
    baseId: staticCtx.baseId,
    blockCounterRef: staticCtx.blockCounterRef,
  };
}
