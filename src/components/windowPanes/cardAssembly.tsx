import React, { useState, useRef, useMemo } from "react";
import styled from "styled-components";
import Block from "../blocks/block";
import vite from "../../assets/vite.svg";

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

interface RowProps extends React.HTMLAttributes<HTMLDivElement> {
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

const Row = styled.div<RowProps>`
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

interface BlockData {
  id: string;
  icon?: string;
  abrv: string;
  allowedRows: number[];
}

// Provider blocks (static, never removed)
interface ProviderBlockData {
  type: string;
  abrv: string;
  icon?: string;
  allowedRows: number[];
}

// Grid structure: [column][row] = blocks
type GridData = BlockData[][][];

// First placement must be in middle row (row 1) of either column
const FIRST_PLACEMENT_ROW = 1;

// Column header labels
const COLUMN_HEADERS = ["Entry", "Exit"];

const Assembly: React.FC = () => {
  // 2 columns x 3 rows grid

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

  // Counter for generating unique IDs
  const blockIdCounter = useRef(0);

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
  const [hoverCell, setHoverCell] = useState<{
    col: number;
    row: number;
  } | null>(null);
  const [hoveredGridCell, setHoveredGridCell] = useState<{
    col: number;
    row: number;
  } | null>(null);

  const handleGridCellMouseEnter = (colIndex: number, rowIndex: number) => {
    if (!isDragging) {
      setHoveredGridCell({ col: colIndex, row: rowIndex });
    }
  };

  const handleGridCellMouseLeave = () => {
    setHoveredGridCell(null);
  };

  // Check if a provider block should be highlighted based on hovered grid cell
  const isProviderBlockHighlighted = (block: ProviderBlockData): boolean => {
    if (isDragging || !hoveredGridCell) return false;

    // Check if the block can be placed in the hovered cell
    const canPlaceInRow = block.allowedRows.includes(hoveredGridCell.row);
    const cellIsValid = isCellValidForPlacement(
      hoveredGridCell.col,
      hoveredGridCell.row,
      block.allowedRows,
    );

    return canPlaceInRow && cellIsValid;
  };

  // Check if any block has been placed in the grid
  const hasFirstBlockBeenPlaced = useMemo(() => {
    return grid.some((column) => column.some((row) => row.length > 0));
  }, [grid]);

  // Get all cells that have blocks
  const getOccupiedCells = useMemo(() => {
    const occupied: { col: number; row: number }[] = [];
    grid.forEach((column, colIndex) => {
      column.forEach((row, rowIndex) => {
        if (row.length > 0) {
          occupied.push({ col: colIndex, row: rowIndex });
        }
      });
    });
    return occupied;
  }, [grid]);

  // Get diagonal cells from all occupied cells
  const getDiagonalCells = useMemo(() => {
    const diagonals = new Set<string>();

    getOccupiedCells.forEach(({ col, row }) => {
      // Four diagonal directions
      const diagonalOffsets = [
        { col: -1, row: -1 }, // top-left
        { col: -1, row: 1 }, // bottom-left
        { col: 1, row: -1 }, // top-right
        { col: 1, row: 1 }, // bottom-right
      ];

      diagonalOffsets.forEach((offset) => {
        const newCol = col + offset.col;
        const newRow = row + offset.row;

        // Check bounds (2 columns, 3 rows)
        if (newCol >= 0 && newCol < 2 && newRow >= 0 && newRow < 3) {
          diagonals.add(`${newCol}-${newRow}`);
        }
      });
    });

    // Remove cells that are already occupied
    getOccupiedCells.forEach(({ col, row }) => {
      diagonals.delete(`${col}-${row}`);
    });

    return diagonals;
  }, [getOccupiedCells]);

  // Refs for each cell in the grid (not including provider)
  const cellRefs = useRef<(HTMLDivElement | null)[][]>([
    [null, null, null],
    [null, null, null],
  ]);

  // Check if a cell is a valid target considering placement rules
  const isCellValidForPlacement = (
    colIndex: number,
    rowIndex: number,
    allowedRows: number[],
  ): boolean => {
    // First, check if the row is in the block's allowed rows
    if (!allowedRows.includes(rowIndex)) {
      return false;
    }

    // If no block has been placed yet, only allow middle row of either column
    if (!hasFirstBlockBeenPlaced) {
      return rowIndex === FIRST_PLACEMENT_ROW;
    }

    // After first placement, only allow diagonal cells
    return getDiagonalCells.has(`${colIndex}-${rowIndex}`);
  };

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
    setGrid([
      [[], [], []],
      [[], [], []],
    ]);
  };

  // Reverse entry and exit blocks (swap columns)
  const handleReverseBlocks = () => {
    setGrid((prev) => {
      const newGrid: GridData = [
        [...prev[1].map((row) => [...row])],
        [...prev[0].map((row) => [...row])],
      ];
      return newGrid;
    });
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
    let targetCol: number | null = null;
    let targetRow: number | null = null;

    cellRefs.current.forEach((column, colIndex) => {
      column.forEach((ref, rowIndex) => {
        if (ref) {
          const rect = ref.getBoundingClientRect();
          if (
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
          ) {
            targetCol = colIndex;
            targetRow = rowIndex;
          }
        }
      });
    });

    if (targetCol !== null && targetRow !== null) {
      // Create a new block instance from the provider
      const providerBlock = providerBlocks.find((b) => b.type === type);
      if (providerBlock) {
        // Check if the target cell is valid for placement
        if (
          !isCellValidForPlacement(
            targetCol,
            targetRow,
            providerBlock.allowedRows,
          )
        ) {
          setDraggingFromProvider(null);
          setHoverCell(null);
          return;
        }

        blockIdCounter.current += 1;
        const newBlock: BlockData = {
          id: `${type}-${blockIdCounter.current}`,
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
    let targetCol: number | null = null;
    let targetRow: number | null = null;

    cellRefs.current.forEach((column, colIndex) => {
      column.forEach((ref, rowIndex) => {
        if (ref) {
          const rect = ref.getBoundingClientRect();
          if (
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
          ) {
            targetCol = colIndex;
            targetRow = rowIndex;
          }
        }
      });
    });
    if (targetCol !== null && targetRow !== null) {
      // Find source cell and block
      let sourceCol: number | null = null;
      let sourceRow: number | null = null;
      let blockData: BlockData | null = null;

    for (let colIndex = 0; colIndex < grid.length; colIndex++) {
      for (let rowIndex = 0; rowIndex < grid[colIndex].length; rowIndex++) {
        const block = grid[colIndex][rowIndex].find((b) => b.id === id);
        if (block) {
          sourceCol = colIndex;
          sourceRow = rowIndex;
          blockData = block;
          break;
        }
      }
      if (blockData) break;
    }

    if (targetCol !== null && targetRow !== null && blockData !== null) {
      // Check if target cell is valid for this block
      if (
        !isCellValidForPlacement(targetCol, targetRow, blockData.allowedRows)
      ) {
        setDraggingId(null);
        setHoverCell(null);
        return;
      }

      // Move block to new cell
      if (
        sourceCol !== null &&
        sourceRow !== null &&
        (targetCol !== sourceCol || targetRow !== sourceRow)
      ) {
        const movedBlock = blockData;
        setGrid((prev) => {
          const newGrid = prev.map((col) => col.map((row) => [...row]));
          // Remove from source
          newGrid[sourceCol!][sourceRow!] = newGrid[sourceCol!][
            sourceRow!
          ].filter((b) => b.id !== id);
          // Add to target
          newGrid[targetCol!][targetRow!].push(movedBlock);
          return newGrid;
        });
      }
    } else if (blockData === null) {
      // Block not found, do nothing
          return newGrid;
        });
      }

    } else {
      // Dropped outside - remove the block
      if (sourceCol !== null && sourceRow !== null) {
        setGrid((prev) => {
          const newGrid = prev.map((col) => col.map((row) => [...row]));
          newGrid[sourceCol!][sourceRow!] = newGrid[sourceCol!][
            sourceRow!
          ].filter((b) => b.id !== id);
          return newGrid;
        });
      }
    }
    setDraggingId(null);
    setHoverCell(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId && !draggingFromProvider) return;

    let hoveredCol: number | null = null;
    let hoveredRow: number | null = null;

    cellRefs.current.forEach((column, colIndex) => {
      column.forEach((ref, rowIndex) => {
        if (ref) {
          const rect = ref.getBoundingClientRect();
          if (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
          ) {
            hoveredCol = colIndex;
            hoveredRow = rowIndex;
          }
        }
      });
    });

    if (hoveredCol !== null && hoveredRow !== null) {
      setHoverCell({ col: hoveredCol, row: hoveredRow });
    } else {
      setHoverCell(null);
    }
  };

  const isDragging = draggingId !== null || draggingFromProvider !== null;
  const activeAllowedRows = getActiveAllowedRows();
  const showValidTargets = isDragging || hoveredProviderId !== null;

  // Get alignment based on column index
  const getAlignment = (colIndex: number): "left" | "right" => {
    return colIndex === 0 ? "right" : "left";
  };

  // Check if a row is a valid target for highlighting
  const isValidTarget = (colIndex: number, rowIndex: number): boolean => {
    if (!showValidTargets) return false;
    return isCellValidForPlacement(colIndex, rowIndex, activeAllowedRows);
  };

  // Check if a cell should be disabled (darkened)
  const isCellDisabled = (colIndex: number, rowIndex: number): boolean => {
    if (!hasFirstBlockBeenPlaced) {
      // Before first placement, disable all cells except middle row
      return rowIndex !== FIRST_PLACEMENT_ROW;
    }
    // After first placement, disable cells that are not diagonal to any occupied cell
    // and are not already occupied
    const isOccupied = grid[colIndex][rowIndex].length > 0;
    const isDiagonal = getDiagonalCells.has(`${colIndex}-${rowIndex}`);
    return !isOccupied && !isDiagonal;
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
                isHighlighted={isProviderBlockHighlighted(block)}
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
                    ref={(el) => (cellRefs.current[colIndex][rowIndex] = el)}
                    $isOver={
                      hoverCell?.col === colIndex &&
                      hoverCell?.row === rowIndex &&
                      isDragging &&
                      isValidTarget(colIndex, rowIndex)
                    }
                    $isValidTarget={isValidTarget(colIndex, rowIndex)}
                    $isDisabled={isCellDisabled(colIndex, rowIndex)}
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
