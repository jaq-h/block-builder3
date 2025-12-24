import React from "react";
import {
  isCellValidForPlacement,
  getAlignment,
  isCellDisabled,
  findBlockInGrid,
  findCellAndPositionData,
  shouldBeDescending,
  hasConditionalWithoutPrimary,
} from "../../../utils/cardAssemblyUtils";
import { COLUMN_HEADERS, ROW_LABELS } from "../../../data/orderTypes";
import {
  createBlocksFromOrderType,
  buildOrderConfigEntry,
} from "../../../utils/blockFactory";
import { StrategyAssemblyProvider } from "./StrategyAssemblyContext";
import { useStrategyAssembly } from "./useStrategyAssembly";
import type { OrderConfig, StrategyPattern } from "./StrategyAssemblyTypes";
import { PATTERN_CONFIGS } from "./StrategyAssemblyTypes";
import ProviderColumn from "./ProviderColumn";
import GridCell from "./GridCell";
import {
  Container,
  Header,
  HeaderText,
  PatternSelectorRow,
  PatternButton,
  PatternLabel,
  PatternDescription,
  ContentWrapper,
  ColumnsWrapper,
  Column,
  ColumnHeader,
  ColumnHeaderText,
  UtilityRow,
  UtilityButton,
  UtilityIcon,
  DebugPanel,
} from "./strategyAssembly.styles";
import TrashIcon from "../../../assets/icons/trash.svg";
import ReverseIcon from "../../../assets/icons/reverse.svg";
import { SCALE_CONFIG } from "./GridCell.styles";
import { useKrakenAPI } from "../../../hooks/useKrakenAPI";

// Props for the main component
interface StrategyAssemblyProps {
  onConfigChange?: (config: OrderConfig) => void;
  initialConfig?: OrderConfig;
  initialPattern?: StrategyPattern;
}

// Main export - wraps with provider
const StrategyAssembly: React.FC<StrategyAssemblyProps> = ({
  onConfigChange,
  initialConfig,
  initialPattern,
}) => {
  return (
    <StrategyAssemblyProvider
      onConfigChange={onConfigChange}
      initialConfig={initialConfig}
      initialPattern={initialPattern}
    >
      <StrategyAssemblyInner />
    </StrategyAssemblyProvider>
  );
};

// Inner component that consumes the context
const StrategyAssemblyInner: React.FC = () => {
  // Kraken API integration for current price
  const { currentPrice, tickerError } = useKrakenAPI({
    symbol: "BTC/USD",
    autoConnect: true,
    pollInterval: 30000, // Update every 30 seconds
  });

  const {
    grid,
    orderConfig,
    strategyPattern,
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
    setStrategyPattern,
    setDraggingId,
    setDraggingFromProvider,
    setHoveredProviderId,
    setHoverCell,
    setHoveredGridCell,
    clearAll,
    reverseBlocks,
  } = useStrategyAssembly();

  // Get pattern config
  const patternConfig = PATTERN_CONFIGS[strategyPattern];

  // Check if there's a warning condition (conditional without primary)
  const showPrimaryWarning =
    strategyPattern === "conditional" && hasConditionalWithoutPrimary(grid);

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
    const clampedRelativeY = Math.max(0, Math.min(availableHeight, relativeY));

    // Determine if this cell uses descending scale
    const isDescending = shouldBeDescending(row, col);

    // Convert to percentage based on scale direction
    // Use SCALE_CONFIG.MAX_PERCENT as the maximum value (single source of truth)
    const { MAX_PERCENT } = SCALE_CONFIG;
    let percentage: number;
    if (isDescending) {
      // Descending: 0% at top, MAX_PERCENT at bottom
      percentage = (clampedRelativeY / availableHeight) * MAX_PERCENT;
    } else {
      // Ascending: MAX_PERCENT at top, 0% at bottom
      percentage =
        MAX_PERCENT - (clampedRelativeY / availableHeight) * MAX_PERCENT;
    }

    // Round to 2 decimal places for precision display
    const roundedPercentage = Math.round(percentage * 100) / 100;

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

  const handlePatternChange = (pattern: StrategyPattern) => {
    setStrategyPattern(pattern);
    // Optionally clear the grid when switching patterns
    // clearAll();
  };

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

  // Get row label based on pattern
  const getRowLabel = (rowIndex: number): string => {
    if (strategyPattern === "conditional") {
      return patternConfig.rowLabels[
        rowIndex === 0 ? "top" : rowIndex === 1 ? "middle" : "bottom"
      ];
    }
    return "";
  };

  return (
    <Container onMouseMove={handleMouseMove}>
      <Header>
        <HeaderText>Strategy Builder</HeaderText>
      </Header>

      {/* Pattern Selector */}
      <PatternSelectorRow>
        {(Object.keys(PATTERN_CONFIGS) as StrategyPattern[]).map((pattern) => (
          <PatternButton
            key={pattern}
            $isActive={strategyPattern === pattern}
            onClick={() => handlePatternChange(pattern)}
          >
            <PatternLabel>{PATTERN_CONFIGS[pattern].label}</PatternLabel>
            <PatternDescription>
              {PATTERN_CONFIGS[pattern].description}
            </PatternDescription>
          </PatternButton>
        ))}
      </PatternSelectorRow>

      <ContentWrapper>
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
        <ColumnsWrapper>
          {grid.map((column, colIndex) => {
            const headerTint =
              colIndex === 0
                ? "rgba(100, 200, 100, 0.15)"
                : "rgba(200, 100, 100, 0.15)";
            const cellTint =
              colIndex === 0
                ? "rgba(100, 200, 100, 0.08)"
                : "rgba(200, 100, 100, 0.08)";

            return (
              <Column key={colIndex}>
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
              </Column>
            );
          })}
        </ColumnsWrapper>
      </ContentWrapper>

      {/* Utility Buttons */}
      <UtilityRow>
        <UtilityButton onClick={clearAll}>
          <UtilityIcon src={TrashIcon} alt="Clear" />
          Clear All
        </UtilityButton>
        <UtilityButton onClick={reverseBlocks}>
          <UtilityIcon src={ReverseIcon} alt="Reverse" />
          Reverse
        </UtilityButton>
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
