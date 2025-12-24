import React from "react";
import styled from "styled-components";
import {
  isCellValidForPlacement,
  getAlignment,
  isCellDisabled,
  findBlockInGrid,
  findCellAndPositionData,
} from "../../../utils/cardAssemblyUtils";
import { COLUMN_HEADERS, ROW_LABELS } from "../../../data/orderTypes";
import {
  createBlocksFromOrderType,
  buildOrderConfigEntry,
} from "../../../utils/blockFactory";
import { StrategyAssemblyProvider } from "./StrategyAssemblyContext";
import { useStrategyAssembly } from "./useStrategyAssembly";
import type { OrderConfig } from "./StrategyAssemblyTypes";
import ProviderColumn from "./ProviderColumn";
import GridCell from "./GridCell";

// Styled Components
const Container = styled.div`
  max-width: 380px;
  height: 100%;
  margin: auto;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  padding: 16px;
  text-align: center;
  border-bottom: 1px solid #444;
`;

const HeaderText = styled.h2`
  margin: 0;
  font-size: 18px;
  color: #fff;
`;

const ContentWrapper = styled.div`
  display: flex;
  flex: 1;
  overflow: scroll;
`;

const ColumnsWrapper = styled.div`
  display: flex;
  flex: 1;
  height: 100%;
`;

const Column = styled.div<{ $tint?: string }>`
  display: flex;
  flex-direction: column;
  min-width: 100px;
  width: 100%;
  background-color: ${({ $tint }) => $tint || "transparent"};
`;

const ColumnHeader = styled.div<{ $tint?: string }>`
  padding: 8px;
  text-align: center;
  border-bottom: 1px solid #444;
  background-color: ${({ $tint }) => $tint || "rgba(50, 50, 50, 0.2)"};
`;

const ColumnHeaderText = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #ccc;
`;

const UtilityRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid #444;
`;

const UtilityButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  border: 1px solid #666;
  border-radius: 4px;
  background-color: rgba(80, 80, 80, 0.5);
  color: #ccc;
  font-size: 14px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    border-color 0.2s;

  &:hover {
    background-color: rgba(100, 100, 100, 0.7);
    border-color: #888;
    color: #fff;
  }
`;

const DebugPanel = styled.div`
  padding: 8px;
  font-size: 10px;
  color: #888;
`;

// Props for the main component
interface StrategyAssemblyProps {
  onConfigChange?: (config: OrderConfig) => void;
  initialConfig?: OrderConfig;
}

// Main export - wraps with provider
const StrategyAssembly: React.FC<StrategyAssemblyProps> = ({
  onConfigChange,
  initialConfig,
}) => {
  return (
    <StrategyAssemblyProvider
      onConfigChange={onConfigChange}
      initialConfig={initialConfig}
    >
      <StrategyAssemblyInner />
    </StrategyAssemblyProvider>
  );
};

// Inner component that consumes the context
const StrategyAssemblyInner: React.FC = () => {
  const {
    grid,
    orderConfig,
    draggingId,
    draggingFromProvider,
    hoveredProviderId,
    hoverCell,
    hoveredGridCell,
    providerBlocks,
    baseId,
    blockCounterRef,
    setGrid,
    setOrderConfig,
    setDraggingId,
    setDraggingFromProvider,
    setHoveredProviderId,
    setHoverCell,
    setHoveredGridCell,
    clearAll,
    reverseBlocks,
  } = useStrategyAssembly();

  // Computed values
  const isDragging = draggingId !== null || draggingFromProvider !== null;

  const handleGridCellMouseEnter = (colIndex: number, rowIndex: number) => {
    if (!isDragging) {
      setHoveredGridCell({ col: colIndex, row: rowIndex });
    }
  };

  const handleGridCellMouseLeave = () => {
    setHoveredGridCell(null);
  };

  // Get allowed rows for the currently active block (dragging or hovering)
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

  const handleDragStart = (id: string) => {
    setDraggingId(id);
  };

  const handleProviderDragStart = (type: string) => {
    setDraggingFromProvider(type);
    setHoveredProviderId(null);
  };

  const handleProviderMouseEnter = (type: string) => {
    if (!draggingFromProvider && !draggingId) {
      setHoveredProviderId(type);
    }
  };

  const handleProviderMouseLeave = () => {
    setHoveredProviderId(null);
  };

  const handleProviderDragEnd = (type: string, x: number, y: number) => {
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
  };

  // Handle vertical dragging within a cell
  const handleBlockVerticalDrag = (id: string, mouseY: number) => {
    const blockInfo = findBlockInGrid(grid, id);
    if (!blockInfo) return;

    const { col, row } = blockInfo;

    // Find the cell element to get its bounds
    const cellElement = document.querySelector(
      `[data-col="${col}"][data-row="${row}"]`,
    );
    if (!cellElement) return;

    const rect = cellElement.getBoundingClientRect();
    const headerOffset = 20;
    const bottomMargin = 8;
    const availableHeight = rect.height - headerOffset - bottomMargin;

    // Calculate relative Y position within the draggable area
    const relativeY = mouseY - rect.top - headerOffset;

    // Convert to percentage (0 = bottom, 100 = top)
    const clampedRelativeY = Math.max(0, Math.min(availableHeight, relativeY));
    const percentage = 100 - (clampedRelativeY / availableHeight) * 100;

    // Round to 1 decimal place
    const roundedPercentage = Math.round(percentage * 10) / 10;

    // Update only this block's position in the grid
    setGrid((prev) => {
      const newGrid = prev.map((column) =>
        column.map((rowArray) =>
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
  };

  const handleDragEnd = (id: string, x: number, y: number) => {
    const positionData = findCellAndPositionData(x, y);
    const blockInfo = findBlockInGrid(grid, id);

    if (!blockInfo) {
      setDraggingId(null);
      setHoverCell(null);
      return;
    }

    const { col: sourceCol, row: sourceRow, block: blockData } = blockInfo;

    if (positionData) {
      const { col: targetCol, row: targetRow, axis, yPosition } = positionData;

      // Check if target cell is valid for this block
      if (
        !isCellValidForPlacement(
          targetCol,
          targetRow,
          blockData.allowedRows,
          grid,
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
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
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
  };

  const activeAllowedRows = getActiveAllowedRows();
  const showValidTargets =
    isDragging || hoveredProviderId !== null || hoveredGridCell !== null;

  const isValidTarget = (colIndex: number, rowIndex: number): boolean => {
    if (!showValidTargets) return false;
    return isCellValidForPlacement(colIndex, rowIndex, activeAllowedRows, grid);
  };

  return (
    <Container onMouseMove={handleMouseMove}>
      <Header>
        <HeaderText>Order Builder</HeaderText>
      </Header>

      <ContentWrapper>
        {/* Provider Column */}
        <ProviderColumn
          providerBlocks={providerBlocks}
          hoveredGridCell={hoveredGridCell}
          isDragging={isDragging}
          grid={grid}
          onProviderDragStart={handleProviderDragStart}
          onProviderDragEnd={handleProviderDragEnd}
          onProviderMouseEnter={handleProviderMouseEnter}
          onProviderMouseLeave={handleProviderMouseLeave}
        />

        {/* Grid Columns */}
        <ColumnsWrapper>
          {grid.map((column, colIndex) => {
            const tint =
              colIndex === 0
                ? "rgba(100, 200, 100, 0.1)"
                : "rgba(200, 100, 100, 0.1)";
            const headerTint =
              colIndex === 0
                ? "rgba(100, 200, 100, 0.2)"
                : "rgba(200, 100, 100, 0.2)";

            return (
              <Column key={colIndex} $tint={tint}>
                <ColumnHeader $tint={headerTint}>
                  <ColumnHeaderText>
                    {COLUMN_HEADERS[colIndex]}
                  </ColumnHeaderText>
                </ColumnHeader>
                {column.map((row, rowIndex) => (
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
                    isDisabled={isCellDisabled(colIndex, rowIndex, grid)}
                    align={getAlignment(colIndex)}
                    onMouseEnter={() =>
                      handleGridCellMouseEnter(colIndex, rowIndex)
                    }
                    onMouseLeave={handleGridCellMouseLeave}
                    onBlockDragStart={handleDragStart}
                    onBlockDragEnd={handleDragEnd}
                    onBlockVerticalDrag={handleBlockVerticalDrag}
                  />
                ))}
              </Column>
            );
          })}
        </ColumnsWrapper>
      </ContentWrapper>

      {/* Utility Buttons */}
      <UtilityRow>
        <UtilityButton onClick={clearAll}>🗑️ Clear All</UtilityButton>
        <UtilityButton onClick={reverseBlocks}>⇄ Reverse</UtilityButton>
      </UtilityRow>

      {/* Debug: Order Configuration Display */}
      {Object.keys(orderConfig).length > 0 && (
        <DebugPanel>
          <details>
            <summary>
              Order Config ({Object.keys(orderConfig).length} blocks)
            </summary>
            <pre
              style={{ fontSize: "9px", maxHeight: "150px", overflow: "auto" }}
            >
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(orderConfig).map(([id, config]) => [
                    id,
                    {
                      ...config,
                      position: `${COLUMN_HEADERS[config.col] ?? config.col} / ${ROW_LABELS[config.row] ?? config.row}`,
                    },
                  ]),
                ),
                null,
                2,
              )}
            </pre>
          </details>
        </DebugPanel>
      )}
    </Container>
  );
};

export default StrategyAssembly;
