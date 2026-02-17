import React, { useCallback } from "react";
import {
  isCellValidForPlacement,
  getAlignment,
  isCellDisabled,
  findBlockInGrid,
  findCellAndPositionData,
  shouldBeDescending,
  hasConditionalWithoutPrimary,
  createBlocksFromOrderType,
  buildOrderConfigEntry,
} from "../../../../utils";
import { COLUMN_HEADERS } from "../../../../data/orderTypes";
import { PATTERN_CONFIGS } from "../../../../types/grid";
import { SCALE_CONFIG } from "../../../../styles/grid";
import ProviderColumn from "../../../common/grid/ProviderColumn";
import GridCell from "../../../common/grid/GridCell";
import { useGridData } from "../contexts/GridDataContext";
import { useDrag } from "../contexts/DragContext";
import { useHover } from "../contexts/HoverContext";
import { useStatic } from "../contexts/StaticContext";
import {
  contentWrapper,
  columnsWrapper,
  column,
  getColumnHeaderProps,
  columnHeaderText,
} from "../strategyAssembly.styles";

interface GridAreaProps {
  currentPrice: number | null;
  tickerError?: string | null;
}

/**
 * GridArea — encapsulates all drag/drop interaction logic and renders the
 * ProviderColumn + grid columns.
 *
 * This component subscribes to all four contexts because it orchestrates
 * the interaction between grid data, drag state, hover state, and static
 * block definitions. The optimization win comes from isolating this complex
 * interaction area away from simpler siblings (PatternSelector, UtilityButtons,
 * DebugPanel) that only need GridDataContext.
 */
const GridArea: React.FC<GridAreaProps> = ({ currentPrice, tickerError }) => {
  // ─── Context subscriptions ───────────────────────────────────────
  const { grid, strategyPattern, setGrid, setOrderConfig } = useGridData();

  const {
    draggingId,
    draggingFromProvider,
    hoverCell,
    setDraggingId,
    setDraggingFromProvider,
    setHoverCell,
  } = useDrag();

  const {
    hoveredProviderId,
    hoveredGridCell,
    setHoveredProviderId,
    setHoveredGridCell,
  } = useHover();

  const { providerBlocks, baseId, blockCounterRef } = useStatic();

  // ─── Derived values ──────────────────────────────────────────────
  const patternConfig = PATTERN_CONFIGS[strategyPattern];
  const showPrimaryWarning =
    strategyPattern === "conditional" && hasConditionalWithoutPrimary(grid);
  const isDragging = draggingId !== null || draggingFromProvider !== null;

  // ─── Hover handlers ──────────────────────────────────────────────

  const handleGridCellMouseEnter = useCallback(
    (colIndex: number, rowIndex: number) => {
      if (draggingId === null && draggingFromProvider === null) {
        setHoveredGridCell({ col: colIndex, row: rowIndex });
      }
    },
    [draggingId, draggingFromProvider, setHoveredGridCell],
  );

  const handleGridCellMouseLeave = useCallback(() => {
    setHoveredGridCell(null);
  }, [setHoveredGridCell]);

  // ─── Allowed-row computation ─────────────────────────────────────

  const getActiveAllowedRows = (): number[] => {
    if (draggingFromProvider) {
      const provider = providerBlocks.find(
        (b) => b.type === draggingFromProvider,
      );
      return provider?.allowedRows || [];
    }
    if (hoveredProviderId) {
      const provider = providerBlocks.find((b) => b.type === hoveredProviderId);
      return provider?.allowedRows || [];
    }
    if (draggingId) {
      for (const column of grid) {
        for (const row of column) {
          const block = row.find((b) => b.id === draggingId);
          if (block) {
            return block.allowedRows;
          }
        }
      }
    }
    return [];
  };

  // ─── Drag handlers ───────────────────────────────────────────────

  const handleDragStart = useCallback(
    (id: string) => {
      setDraggingId(id);
    },
    [setDraggingId],
  );

  const handleProviderDragStart = useCallback(
    (type: string) => {
      setDraggingFromProvider(type);
      setHoveredProviderId(null);
    },
    [setDraggingFromProvider, setHoveredProviderId],
  );

  const handleProviderMouseEnter = useCallback(
    (type: string) => {
      if (!draggingFromProvider && !draggingId) {
        setHoveredProviderId(type);
      }
    },
    [draggingFromProvider, draggingId, setHoveredProviderId],
  );

  const handleProviderMouseLeave = useCallback(() => {
    setHoveredProviderId(null);
  }, [setHoveredProviderId]);

  const handleProviderDragEnd = useCallback(
    (type: string, x: number, y: number) => {
      const positionData = findCellAndPositionData(x, y);
      if (!positionData) {
        setDraggingFromProvider(null);
        setHoverCell(null);
        return;
      }

      const { col: targetCol, row: targetRow } = positionData;
      const providerBlock = providerBlocks.find((b) => b.type === type);

      if (
        !providerBlock ||
        !isCellValidForPlacement(
          targetCol,
          targetRow,
          providerBlock.allowedRows,
          grid,
          strategyPattern,
        )
      ) {
        setDraggingFromProvider(null);
        setHoverCell(null);
        return;
      }

      // Use factory to create blocks
      const { blocks, nextCounter } = createBlocksFromOrderType(providerBlock, {
        baseId,
        counter: blockCounterRef.current,
      });
      blockCounterRef.current = nextCounter;

      // Update grid
      setGrid((prev) => {
        const newGrid = prev.map((col) => col.map((row) => [...row]));
        blocks.forEach((block) => newGrid[targetCol][targetRow].push(block));
        return newGrid;
      });

      // Update order config
      setOrderConfig((prev) => {
        const updated = { ...prev };
        blocks.forEach((block) => {
          updated[block.id] = buildOrderConfigEntry(
            block,
            targetCol,
            targetRow,
            type,
          );
        });
        return updated;
      });

      setDraggingFromProvider(null);
      setHoverCell(null);
    },
    [
      providerBlocks,
      grid,
      strategyPattern,
      baseId,
      blockCounterRef,
      setGrid,
      setOrderConfig,
      setDraggingFromProvider,
      setHoverCell,
    ],
  );

  // ─── Vertical drag (slider) ──────────────────────────────────────

  const handleBlockVerticalDrag = useCallback(
    (id: string, mouseY: number) => {
      const blockInfo = findBlockInGrid(grid, id);
      if (!blockInfo) return;

      const { col, row } = blockInfo;

      // Find the cell element to get its bounds
      const cellElement = document.querySelector(
        `[data-col="${col}"][data-row="${row}"]`,
      );
      if (!cellElement) return;

      const rect = cellElement.getBoundingClientRect();
      // Layout constants matching GridCell.tsx
      const HEADER_HEIGHT = 36;
      const BOTTOM_PADDING = 20;
      const BLOCK_HEIGHT = 40;

      // The draggable area starts after header and ends before bottom padding
      const trackTop = rect.top + HEADER_HEIGHT + BLOCK_HEIGHT / 2;
      const trackBottom = rect.bottom - BOTTOM_PADDING - BLOCK_HEIGHT / 2;
      const availableHeight = trackBottom - trackTop;

      // Calculate relative Y position within the draggable area
      const relativeY = mouseY - trackTop;
      const clampedRelativeY = Math.max(
        0,
        Math.min(availableHeight, relativeY),
      );

      // Determine if this cell uses descending scale
      const isDescending = shouldBeDescending(row, col);

      // Convert to percentage based on scale direction
      const { MAX_PERCENT } = SCALE_CONFIG;
      let percentage: number;
      if (isDescending) {
        percentage = (clampedRelativeY / availableHeight) * MAX_PERCENT;
      } else {
        percentage =
          MAX_PERCENT - (clampedRelativeY / availableHeight) * MAX_PERCENT;
      }

      // Round to 2 decimal places for precision display
      const roundedPercentage = Math.round(percentage * 100) / 100;

      // Update only this block's position in the grid
      setGrid((prev) => {
        const newGrid = prev.map((gridCol) =>
          gridCol.map((rowArray) =>
            rowArray.map((b) => {
              if (b.id === id) {
                return { ...b, yPosition: roundedPercentage };
              }
              return b;
            }),
          ),
        );
        return newGrid;
      });

      // Update order config for this block only
      setOrderConfig((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          yPosition: roundedPercentage,
        },
      }));
    },
    [grid, setGrid, setOrderConfig],
  );

  // ─── Drop handler ────────────────────────────────────────────────

  const handleDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      const positionData = findCellAndPositionData(x, y);
      const blockInfo = findBlockInGrid(grid, id);

      if (!blockInfo) {
        setDraggingId(null);
        setHoverCell(null);
        return;
      }

      const { col: sourceCol, row: sourceRow, block: blockData } = blockInfo;

      if (positionData) {
        const {
          col: targetCol,
          row: targetRow,
          axis,
          yPosition,
        } = positionData;

        // Check if target cell is valid for this block
        if (
          !isCellValidForPlacement(
            targetCol,
            targetRow,
            blockData.allowedRows,
            grid,
            strategyPattern,
          )
        ) {
          setDraggingId(null);
          setHoverCell(null);
          return;
        }

        // Update block with new position data
        const updatedBlock = {
          ...blockData,
          axis,
          yPosition,
        };

        setGrid((prev) => {
          const newGrid = prev.map((col) => col.map((row) => [...row]));

          // Remove only this block from source
          newGrid[sourceCol][sourceRow] = newGrid[sourceCol][sourceRow].filter(
            (b) => b.id !== id,
          );

          // Add to target with updated position
          newGrid[targetCol][targetRow].push(updatedBlock);

          return newGrid;
        });

        // Update order config for this block only
        setOrderConfig((prev) => {
          const updated = { ...prev };
          if (updated[id]) {
            updated[id] = {
              ...updated[id],
              col: targetCol,
              row: targetRow,
              axis,
              yPosition,
            };
          }
          return updated;
        });
      } else {
        // Dropped outside - remove only this block
        setGrid((prev) => {
          const newGrid = prev.map((col) => col.map((row) => [...row]));
          newGrid[sourceCol][sourceRow] = newGrid[sourceCol][sourceRow].filter(
            (b) => b.id !== id,
          );
          return newGrid;
        });

        // Remove from order config
        setOrderConfig((prev) => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
      }

      setDraggingId(null);
      setHoverCell(null);
    },
    [
      grid,
      strategyPattern,
      setGrid,
      setOrderConfig,
      setDraggingId,
      setHoverCell,
    ],
  );

  // ─── Mouse move (drag tracking) ─────────────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingId !== null || draggingFromProvider !== null) {
        const target = e.target as HTMLElement;
        const rowElement = target.closest("[data-col][data-row]");
        if (rowElement) {
          const col = parseInt(rowElement.getAttribute("data-col") || "-1", 10);
          const row = parseInt(rowElement.getAttribute("data-row") || "-1", 10);
          if (col !== -1 && row !== -1) {
            setHoverCell({ col, row });
          }
        } else {
          setHoverCell(null);
        }
      }
    },
    [draggingId, draggingFromProvider, setHoverCell],
  );

  // ─── Computed values for rendering ───────────────────────────────

  const activeAllowedRows = getActiveAllowedRows();
  const showValidTargets =
    isDragging || hoveredProviderId !== null || hoveredGridCell !== null;

  const isValidTarget = (colIndex: number, rowIndex: number): boolean => {
    if (!showValidTargets) return false;
    return isCellValidForPlacement(
      colIndex,
      rowIndex,
      activeAllowedRows,
      grid,
      strategyPattern,
    );
  };

  const getRowLabel = (rowIndex: number): string => {
    if (strategyPattern === "conditional") {
      return patternConfig.rowLabels[
        rowIndex === 0 ? "top" : rowIndex === 1 ? "middle" : "bottom"
      ];
    }
    return "";
  };

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className={contentWrapper} onMouseMove={handleMouseMove}>
      {/* Provider Column */}
      <ProviderColumn
        providerBlocks={providerBlocks}
        hoveredGridCell={hoveredGridCell}
        isDragging={isDragging}
        grid={grid}
        strategyPattern={strategyPattern}
        onProviderDragStart={handleProviderDragStart}
        onProviderDragEnd={handleProviderDragEnd}
        onProviderMouseEnter={handleProviderMouseEnter}
        onProviderMouseLeave={handleProviderMouseLeave}
      />

      {/* Grid Columns */}
      <div className={columnsWrapper}>
        {grid.map((gridColumn, colIndex) => {
          const headerTint =
            colIndex === 0
              ? "rgba(100, 200, 100, 0.15)"
              : "rgba(200, 100, 100, 0.15)";
          const cellTint =
            colIndex === 0
              ? "rgba(100, 200, 100, 0.08)"
              : "rgba(200, 100, 100, 0.08)";

          const colHeaderProps = getColumnHeaderProps(headerTint);

          return (
            <div key={colIndex} className={column}>
              <div
                className={colHeaderProps.className}
                style={colHeaderProps.style}
              >
                <span className={columnHeaderText}>
                  {COLUMN_HEADERS[colIndex]}
                </span>
              </div>
              {gridColumn.map((row, rowIndex) => (
                <GridCell
                  key={rowIndex}
                  colIndex={colIndex}
                  rowIndex={rowIndex}
                  blocks={row}
                  isOver={
                    hoverCell?.col === colIndex &&
                    hoverCell?.row === rowIndex &&
                    isDragging &&
                    isValidTarget(colIndex, rowIndex)
                  }
                  isValidTarget={isValidTarget(colIndex, rowIndex)}
                  isDisabled={isCellDisabled(
                    colIndex,
                    rowIndex,
                    grid,
                    strategyPattern,
                  )}
                  align={getAlignment(colIndex)}
                  strategyPattern={strategyPattern}
                  rowLabel={getRowLabel(rowIndex)}
                  showPrimaryWarning={showPrimaryWarning && rowIndex === 1}
                  tint={cellTint}
                  currentPrice={currentPrice}
                  priceError={tickerError}
                  onMouseEnter={() =>
                    handleGridCellMouseEnter(colIndex, rowIndex)
                  }
                  onMouseLeave={handleGridCellMouseLeave}
                  onBlockDragStart={handleDragStart}
                  onBlockDragEnd={handleDragEnd}
                  onBlockVerticalDrag={handleBlockVerticalDrag}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GridArea;
