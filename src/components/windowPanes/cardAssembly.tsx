import React, { useState, useRef, useId } from "react";
import styled from "styled-components";
import Block from "../blocks/block";
import vite from "../../assets/vite.svg";
import type {
  BlockData,
  ProviderBlockData,
  GridData,
  CellPosition,
} from "../../utils/cardAssemblyUtils";
import {
  isCellValidForPlacement,
  getAlignment,
  isCellDisabled,
  findCellAtPosition,
  findBlockInGrid,
  clearGrid,
  reverseColumns,
  isProviderBlockHighlighted as checkProviderBlockHighlighted,
} from "../../utils/cardAssemblyUtils";

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

const ProviderColumn = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 60px;
  width: 80px;
  border-right: 1px solid #444;
  background-color: rgba(50, 50, 50, 0.3);
`;

const ProviderHeader = styled.div`
  padding: 8px;
  text-align: center;
  border-bottom: 1px solid #444;
`;

const ProviderHeaderText = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #ccc;
`;

interface RowProps {
  $isOver: boolean;
  $isValidTarget: boolean;
  $isDisabled: boolean;
  $align: "left" | "right";
}

const breathingAnimation = `
  @keyframes breathing {
    0%, 100% {
      border-color: rgba(255, 255, 255, 0.5);
      box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.1);
    }
    50% {
      border-color: rgba(255, 255, 255, 1);
      box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.2);
    }
  }
`;

const Row = styled.div.attrs<RowProps>(() => ({}))<RowProps>`
  ${breathingAnimation}
  flex: 1;
  border: ${({ $isOver }) => ($isOver ? "3px" : "1px")} solid
    ${({ $isOver, $isValidTarget, $isDisabled }) =>
      $isDisabled
        ? "#222"
        : $isOver
          ? "#fff"
          : $isValidTarget
            ? "#888"
            : "#444"};
  background-color: ${({ $isDisabled }) =>
    $isDisabled ? "rgba(0, 0, 0, 0.4)" : "transparent"};
  background-image: ${({ $isOver, $isValidTarget, $isDisabled }) => {
    if ($isDisabled) return "none";
    if ($isOver) {
      return `
        linear-gradient(to right, rgba(255, 255, 255, 0.4) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 1px, transparent 1px)
      `;
    }
    if ($isValidTarget) {
      return `
        linear-gradient(to right, rgba(255, 255, 255, 0.2) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 1px, transparent 1px)
      `;
    }
    return "none";
  }};
  background-size: ${({ $isOver, $isValidTarget }) =>
    $isOver || $isValidTarget ? "20px 20px" : "auto"};
  animation: ${({ $isOver, $isValidTarget }) =>
    $isOver || $isValidTarget ? "breathing 1.5s ease-in infinite" : "none"};
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  justify-content: ${({ $align }) =>
    $align === "left" ? "flex-start" : "flex-end"};
  padding: ${({ $isOver }) => ($isOver ? "6px" : "8px")};
  min-height: 144px;
  gap: 8px;
  overflow: auto;
  transition:
    border-width 0.2s,
    padding 0.2s,
    background-image 0.2s;
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

const ProviderRow = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: 8px;
  gap: 0;
  overflow: auto;
`;

// Column header labels
const COLUMN_HEADERS = ["Entry", "Exit"];

const Assembly: React.FC = () => {
  // Static provider blocks (column 0)
  const providerBlocks: ProviderBlockData[] = [
    { type: "limit", abrv: "Lmt", allowedRows: [0, 1] },
    { type: "market", abrv: "Mkt", icon: vite, allowedRows: [1] },
    { type: "iceberg", abrv: "Ice", icon: vite, allowedRows: [1] },
    { type: "stop-loss", abrv: "SL", icon: vite, allowedRows: [1, 2] },
    {
      type: "stop-loss-limit",
      abrv: "SL-Lmt",
      icon: vite,
      allowedRows: [1, 2],
    },
    { type: "take-profit", abrv: "TP", icon: vite, allowedRows: [0, 1] },
    {
      type: "take-profit-limit",
      abrv: "TP-Lmt",
      icon: vite,
      allowedRows: [0, 1],
    },
    { type: "trailing-stop", abrv: "TS", icon: vite, allowedRows: [1, 2] },
    {
      type: "trailing-stop-limit",
      abrv: "TS-Lmt",
      icon: vite,
      allowedRows: [1, 2],
    },
  ];

  // Generate unique base ID for this component instance
  const baseId = useId();
  const blockCounter = useRef(0);

  // 2 columns x 3 rows grid (columns 0 and 1)
  const [grid, setGrid] = useState<GridData>([
    // Column 0 - LEFT column, blocks align RIGHT
    [
      [], // Row 0
      [], // Row 1
      [], // Row 2
    ],
    // Column 1 - RIGHT column, blocks align LEFT
    [
      [], // Row 0
      [], // Row 1
      [], // Row 2
    ],
  ]);

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

  const handleGridCellMouseEnter = (colIndex: number, rowIndex: number) => {
    if (!isDragging) {
      setHoveredGridCell({ col: colIndex, row: rowIndex });
    }
  };

  const handleGridCellMouseLeave = () => {
    setHoveredGridCell(null);
  };

  // Check if a provider block should be highlighted based on hovered grid cell

  // Get allowed rows for the currently active block (dragging or hovering)
  const getActiveAllowedRows = (): number[] => {
    // Check if dragging from provider
    if (draggingFromProvider) {
      const provider = providerBlocks.find(
        (b) => b.type === draggingFromProvider,
      );
      return provider?.allowedRows || [];
    }
    // Check if hovering over provider
    if (hoveredProviderId) {
      const provider = providerBlocks.find((b) => b.type === hoveredProviderId);
      return provider?.allowedRows || [];
    }
    // Check if dragging an existing block
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

  // Clear all blocks from the grid
  const handleClearAll = () => {
    setGrid(clearGrid(2, 3));
  };

  // Reverse entry and exit blocks (swap columns)
  const handleReverseBlocks = () => {
    setGrid(reverseColumns);
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
    // Find which cell the block was dropped on
    const cellPosition = findCellAtPosition(x, y);

    if (cellPosition) {
      const { col: targetCol, row: targetRow } = cellPosition;
      // Create a new block instance from the provider
      const providerBlock = providerBlocks.find((b) => b.type === type);
      if (providerBlock) {
        // Check if the target cell is valid for placement
        if (
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

        blockCounter.current += 1;
        const newBlock: BlockData = {
          id: `${baseId}-${type}-${blockCounter.current}`,
          icon: providerBlock.icon,
          abrv: providerBlock.abrv,
          allowedRows: providerBlock.allowedRows,
        };

        setGrid((prev) => {
          const newGrid = prev.map((col) => col.map((row) => [...row]));
          newGrid[targetCol!][targetRow!].push(newBlock);
          return newGrid;
        });
      }
    }

    setDraggingFromProvider(null);
    setHoverCell(null);
  };

  const handleDragEnd = (id: string, x: number, y: number) => {
    // Find which cell the block was dropped on
    const cellPosition = findCellAtPosition(x, y);

    // Find source cell and block
    const blockInfo = findBlockInGrid(grid, id);

    if (!blockInfo) {
      setDraggingId(null);
      setHoverCell(null);
      return;
    }

    const { col: sourceCol, row: sourceRow, block: blockData } = blockInfo;

    if (cellPosition) {
      const { col: targetCol, row: targetRow } = cellPosition;

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

      // Move block to new cell
      if (targetCol !== sourceCol || targetRow !== sourceRow) {
        setGrid((prev) => {
          const newGrid = prev.map((col) => col.map((row) => [...row]));
          // Remove from source
          newGrid[sourceCol][sourceRow] = newGrid[sourceCol][sourceRow].filter(
            (b) => b.id !== id,
          );
          // Add to target
          newGrid[targetCol][targetRow].push(blockData);
          return newGrid;
        });
      }
    } else {
      // Dropped outside - remove the block
      setGrid((prev) => {
        const newGrid = prev.map((col) => col.map((row) => [...row]));
        newGrid[sourceCol][sourceRow] = newGrid[sourceCol][sourceRow].filter(
          (b) => b.id !== id,
        );
        return newGrid;
      });
    }

    setDraggingId(null);
    setHoverCell(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId && !draggingFromProvider) return;

    const target = e.target as HTMLElement;
    const rowElement = target.closest("[data-col][data-row]") as HTMLElement;

    if (rowElement) {
      const col = parseInt(rowElement.getAttribute("data-col") || "-1", 10);
      const row = parseInt(rowElement.getAttribute("data-row") || "-1", 10);

      if (col !== -1 && row !== -1) {
        setHoverCell({ col, row });
        return;
      }
    }

    setHoverCell(null);
  };

  const isDragging = draggingId !== null || draggingFromProvider !== null;
  const activeAllowedRows = getActiveAllowedRows();
  const showValidTargets = isDragging || hoveredProviderId !== null;

  // Check if a row is a valid target for highlighting
  const isValidTarget = (colIndex: number, rowIndex: number): boolean => {
    if (!showValidTargets) return false;
    return isCellValidForPlacement(colIndex, rowIndex, activeAllowedRows, grid);
  };

  return (
    <Container onMouseMove={handleMouseMove}>
      <Header>
        <HeaderText>Card Assembly</HeaderText>
      </Header>
      <ContentWrapper>
        {/* Provider Column */}
        <ProviderColumn>
          <ProviderHeader>
            <ProviderHeaderText>Blocks</ProviderHeaderText>
          </ProviderHeader>
          <ProviderRow>
            {providerBlocks.map((block) => (
              <Block
                key={block.type}
                id={block.type}
                icon={block.icon}
                abrv={block.abrv}
                isHighlighted={checkProviderBlockHighlighted(
                  block,
                  hoveredGridCell,
                  isDragging,
                  grid,
                )}
                onDragStart={() => handleProviderDragStart(block.type)}
                onDragEnd={(_id, x, y) =>
                  handleProviderDragEnd(block.type, x, y)
                }
                onMouseEnter={() => handleProviderMouseEnter(block.type)}
                onMouseLeave={handleProviderMouseLeave}
              />
            ))}
          </ProviderRow>
        </ProviderColumn>

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
                  <Row
                    key={rowIndex}
                    data-col={colIndex}
                    data-row={rowIndex}
                    $isOver={
                      hoverCell?.col === colIndex &&
                      hoverCell?.row === rowIndex &&
                      isDragging &&
                      isValidTarget(colIndex, rowIndex)
                    }
                    $isValidTarget={isValidTarget(colIndex, rowIndex)}
                    $isDisabled={isCellDisabled(colIndex, rowIndex, grid)}
                    $align={getAlignment(colIndex)}
                    onMouseEnter={() =>
                      handleGridCellMouseEnter(colIndex, rowIndex)
                    }
                    onMouseLeave={handleGridCellMouseLeave}
                  >
                    {row.map((block) => (
                      <Block
                        key={block.id}
                        id={block.id}
                        icon={block.icon}
                        abrv={block.abrv}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </Row>
                ))}
              </Column>
            );
          })}
        </ColumnsWrapper>
      </ContentWrapper>

      {/* Utility Buttons */}
      <UtilityRow>
        <UtilityButton onClick={handleClearAll}>🗑️ Clear All</UtilityButton>
        <UtilityButton onClick={handleReverseBlocks}>⇄ Reverse</UtilityButton>
      </UtilityRow>
    </Container>
  );
};

export default Assembly;
