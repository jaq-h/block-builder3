import type { FC, PointerEvent } from "react";
import {
  isCellValidForPlacement,
  getAlignment,
  isCellDisabled,
  findBlockInGrid,
  findCellAtPosition,
  findCellAndPositionData,
  isCellDescending,
  shouldBeDescending,
  hasConditionalWithoutPrimary,
  createBlocksFromOrderType,
  buildOrderConfigEntry,
} from "../../../../utils";
import { samePosition } from "../../../../utils/blockCommand";
import type {
  BlockData,
  CellPosition,
  PlacementResult,
} from "../../../../types/grid";
import { COLUMN_HEADERS } from "../../../../data/orderTypes";
import { PATTERN_CONFIGS } from "../../../../types/grid";
import { positionFromPointer, SCALE_CONFIG } from "../../../../styles/grid";
import ProviderColumn from "../../../common/grid/ProviderColumn";
import GridCell from "../../../common/grid/GridCell";
import LiveAnnouncer from "../../../common/LiveAnnouncer";
import { BLOCK_INSTRUCTIONS_ID } from "../../../blocks/block";
import { useBlockCommand } from "../../../../hooks/useBlockCommand";
import { useGridAnnouncer } from "../../../../hooks/useGridAnnouncer";
import { useGridData } from "../contexts/GridDataContext";
import { useDrag } from "../contexts/DragContext";
import { useHover } from "../contexts/HoverContext";
import { useStatic } from "../contexts/StaticContext";
import {
  contentWrapper,
  contentRow,
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
 * GridArea - encapsulates all drag/drop interaction logic and renders the
 * ProviderColumn + grid columns.
 *
 * This component subscribes to all four contexts because it orchestrates
 * the interaction between grid data, drag state, hover state, and static
 * block definitions. The optimization win comes from isolating this complex
 * interaction area away from simpler siblings (PatternSelector, UtilityButtons,
 * DebugPanel) that only need GridDataContext.
 *
 * Placement itself is expressed once, in terms of a target *cell*. The pointer
 * drag turns coordinates into a cell and calls it; the command model picks a
 * cell with the arrow keys and calls the same function. That is what keeps the
 * two input models from drifting apart.
 */
const GridArea: FC<GridAreaProps> = ({ currentPrice, tickerError }) => {
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

  // ─── Placement primitives (shared by drag and command model) ─────

  /**
   * Add the blocks for an order type to a cell. Returns what it actually did,
   * which is the only thing anything is allowed to announce: see
   * `utils/gridAnnouncements.ts`.
   */
  const placeProviderInCell = (
    type: string,
    target: CellPosition,
  ): PlacementResult => {
    const providerBlock = providerBlocks.find((b) => b.type === type);
    if (
      !providerBlock ||
      !isCellValidForPlacement(
        target.col,
        target.row,
        providerBlock.allowedRows,
        grid,
        strategyPattern,
      )
    ) {
      return { status: "refused" };
    }

    // Use factory to create blocks, then stamp direction from placement context
    const { blocks: rawBlocks, nextCounter } = createBlocksFromOrderType(
      providerBlock,
      {
        baseId,
        counter: blockCounterRef.current,
      },
    );
    blockCounterRef.current = nextCounter;
    const blocks = rawBlocks.map((block) => ({
      ...block,
      direction: shouldBeDescending(
        target.row,
        target.col,
        strategyPattern,
        block.orderType,
      )
        ? ("downside" as const)
        : ("upside" as const),
    }));

    // Update grid
    setGrid((prev) => {
      const newGrid = prev.map((col) => col.map((row) => [...row]));
      blocks.forEach((block) => newGrid[target.col][target.row].push(block));
      return newGrid;
    });

    // Update order config
    setOrderConfig((prev) => {
      const updated = { ...prev };
      blocks.forEach((block) => {
        updated[block.id] = buildOrderConfigEntry(
          block,
          target.col,
          target.row,
          type,
        );
      });
      return updated;
    });

    const blockId = blocks[0]?.id;
    return blockId
      ? { status: "created", blockId }
      : // The factory produced nothing, so the grid gained nothing either.
        { status: "refused" };
  };

  /**
   * Move an existing block to a cell, and report what happened. `axis` and
   * `yPosition` are supplied by the pointer drag, which reads them off the drop
   * coordinates; the command model omits them and the block keeps the position
   * it already had.
   */
  const moveBlockToCell = (
    id: string,
    target: CellPosition,
    position?: { axis: 1 | 2; yPosition: number },
  ): PlacementResult => {
    const blockInfo = findBlockInGrid(grid, id);
    if (!blockInfo) return { status: "refused" };

    const { col: sourceCol, row: sourceRow, block: blockData } = blockInfo;

    // Putting a block back where it already is changes nothing, and is not a
    // rejection: the placement rules read its own cell as occupied, so asking
    // them would refuse the cell the block is visibly sitting in. That is what
    // a nudge-and-release does, and reporting it as a refusal is what made the
    // live region contradict itself.
    if (sourceCol === target.col && sourceRow === target.row) {
      return { status: "unchanged", blockId: id };
    }

    if (
      !isCellValidForPlacement(
        target.col,
        target.row,
        blockData.allowedRows,
        grid,
        strategyPattern,
      )
    ) {
      return { status: "refused" };
    }

    const updatedBlock: BlockData = {
      ...blockData,
      ...(position ?? {}),
      direction: shouldBeDescending(
        target.row,
        target.col,
        strategyPattern,
        blockData.orderType,
      )
        ? ("downside" as const)
        : ("upside" as const),
    };

    setGrid((prev) => {
      const newGrid = prev.map((col) => col.map((row) => [...row]));

      // Remove only this block from source
      newGrid[sourceCol][sourceRow] = newGrid[sourceCol][sourceRow].filter(
        (b) => b.id !== id,
      );

      // Add to target with updated position
      newGrid[target.col][target.row].push(updatedBlock);

      return newGrid;
    });

    // Update order config for this block only
    setOrderConfig((prev) => {
      const updated = { ...prev };
      if (updated[id]) {
        updated[id] = {
          ...updated[id],
          col: target.col,
          row: target.row,
          axis: updatedBlock.axis,
          yPosition: updatedBlock.yPosition,
          direction: updatedBlock.direction,
        };
      }
      return updated;
    });

    return {
      status: "moved",
      blockId: id,
      from: { col: sourceCol, row: sourceRow },
    };
  };

  /** Take a block off the grid entirely - a drag that ended outside it. */
  const removeBlock = (id: string, source: CellPosition) => {
    setGrid((prev) => {
      const newGrid = prev.map((col) => col.map((row) => [...row]));
      newGrid[source.col][source.row] = newGrid[source.col][source.row].filter(
        (b) => b.id !== id,
      );
      return newGrid;
    });

    setOrderConfig((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  // ─── Command model (select, arrows, place) ───────────────────────

  // Every sentence this grid speaks goes through here, and `report` is the only
  // way to reach it: see `utils/gridAnnouncements.ts` for what that buys.
  const announcer = useGridAnnouncer(strategyPattern);

  const command = useBlockCommand({
    grid,
    strategyPattern,
    providerBlocks,
    announcer,
    placeProvider: placeProviderInCell,
    moveBlock: (id, target) => moveBlockToCell(id, target),
  });

  const carryingProviderType =
    command.carrying?.source.kind === "provider"
      ? command.carrying.source.type
      : null;
  const carryingBlockId =
    command.carrying?.source.kind === "grid" ? command.carrying.source.id : null;

  // ─── Hover handlers ──────────────────────────────────────────────

  const handleGridCellMouseEnter = (colIndex: number, rowIndex: number) => {
    if (draggingId === null && draggingFromProvider === null) {
      setHoveredGridCell({ col: colIndex, row: rowIndex });
    }
  };

  const handleGridCellMouseLeave = () => {
    setHoveredGridCell(null);
  };

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

  const handleDragStart = (id: string) => {
    setDraggingId(id);
  };

  /**
   * A real drag has started on `subjectKey` - a block id, or a palette order
   * type. Whether that ends an active carry silently or out loud is decided in
   * one place, `releaseForDrag`, from whether the drag is about the carried
   * block itself.
   */
  const handleDragRecognised = (subjectKey: string) => {
    command.releaseForDrag(subjectKey);
  };

  const endDrag = () => {
    setDraggingId(null);
    setDraggingFromProvider(null);
    setHoverCell(null);
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

  /** A palette order type, named the way the announcer names it. */
  const providerSource = (type: string) => ({
    kind: "provider" as const,
    type,
    label: providerBlocks.find((b) => b.type === type)?.label ?? type,
  });

  const handleProviderDragEnd = (type: string, x: number, y: number) => {
    const positionData = findCellAndPositionData(x, y);
    const source = providerSource(type);

    if (positionData) {
      const cell = { col: positionData.col, row: positionData.row };
      announcer.report({
        kind: "placement",
        source,
        cell,
        result: placeProviderInCell(type, cell),
        via: "drag",
      });
    } else {
      // Released over no cell at all. Nothing was created, and this used to be
      // the one drag outcome that said nothing whatsoever.
      announcer.report({ kind: "dragEnded", source, reason: "offGrid" });
    }
    endDrag();
  };

  /**
   * The browser took the pointer away mid-drag; nothing was created. `endDrag`
   * is not called here - `onProviderDragCancel` fires for the same event and
   * already does it. This handler exists only to say what happened.
   */
  const handleProviderDragAborted = (type: string) => {
    announcer.report({
      kind: "dragEnded",
      source: providerSource(type),
      reason: "aborted",
    });
  };

  // ─── Vertical drag (slider) ──────────────────────────────────────

  /** Write a new axis position for one block, into both the grid and the config. */
  const setBlockPosition = (id: string, yPosition: number) => {
    setGrid((prev) =>
      prev.map((gridCol) =>
        gridCol.map((rowArray) =>
          rowArray.map((b) => (b.id === id ? { ...b, yPosition } : b)),
        ),
      ),
    );

    setOrderConfig((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        yPosition,
      },
    }));
  };

  /**
   * `pointerY` is where the block's centre should end up, and the axis column
   * is the element the renderer lays that centre out within. Measuring anything
   * else - the containing cell, say - reads a block back at a different
   * percentage than it was drawn at, and every drag then jumps on its first
   * move. `positionFromPointer` is the inverse of that layout.
   */
  const handleBlockVerticalDrag = (id: string, pointerY: number) => {
    const blockInfo = findBlockInGrid(grid, id);
    if (!blockInfo) return;

    const { col, row, block: blockData } = blockInfo;

    const cellSelector = `[data-col="${col}"][data-row="${row}"]`;
    const trackElement =
      document.querySelector(
        `${cellSelector} [data-axis-track="${col}-${row}-${blockData.axis}"]`,
      ) ?? document.querySelector(`${cellSelector} [data-axis-track]`);
    if (!trackElement) return;

    const position = positionFromPointer(
      trackElement.getBoundingClientRect(),
      pointerY,
      isCellDescending(grid[col][row]),
    );

    setBlockPosition(id, Math.round(position * 100) / 100);
  };

  /**
   * The keyboard half of the price axis. `delta` is in percentage points
   * towards a *higher price*, so the block always moves the way the arrow
   * points regardless of which side of the market it sits on.
   */
  const handleBlockAdjustPrice = (id: string, delta: number) => {
    const blockInfo = findBlockInGrid(grid, id);
    if (!blockInfo) return;

    const { col, row, block } = blockInfo;
    const towardsMarket = isCellDescending(grid[col][row]) ? -delta : delta;
    const next = Math.max(
      SCALE_CONFIG.MIN_PERCENT,
      Math.min(SCALE_CONFIG.MAX_PERCENT, block.yPosition + towardsMarket),
    );
    if (next === block.yPosition) return;

    setBlockPosition(id, Math.round(next * 100) / 100);
  };

  // ─── Drop handler ────────────────────────────────────────────────

  /** A placed block, named the way the announcer names it. */
  const gridSource = (id: string) => {
    const blockInfo = findBlockInGrid(grid, id);
    if (!blockInfo) return null;
    return {
      kind: "grid" as const,
      id,
      label: blockInfo.block.label,
      origin: { col: blockInfo.col, row: blockInfo.row },
    };
  };

  const handleDragEnd = (id: string, x: number, y: number) => {
    const blockInfo = findBlockInGrid(grid, id);
    const positionData = findCellAndPositionData(
      x,
      y,
      strategyPattern,
      blockInfo?.block.orderType,
    );

    // The block is not on the grid, so there is no fact to report about it.
    const source = gridSource(id);
    if (!blockInfo || !source) {
      endDrag();
      return;
    }

    // The drag is the only feedback a screen-reader user gets for this gesture,
    // and it is the gesture a finger reaches for first. What is said comes from
    // the placement primitive's own account of what it did, so a release inside
    // the block's own cell reads as "stayed", not as a refusal by the cell the
    // block is sitting in.
    if (positionData) {
      const { col, row, axis, yPosition } = positionData;
      const cell = { col, row };
      announcer.report({
        kind: "placement",
        source,
        cell,
        result: moveBlockToCell(id, cell, { axis, yPosition }),
        via: "drag",
      });
    } else {
      // Dropped outside - remove only this block
      removeBlock(id, source.origin);
      announcer.report({ kind: "removed", source });
    }

    endDrag();
  };

  /**
   * The browser took the pointer away mid-drag. Nothing moved, so the block is
   * still in the cell it started in - and saying so is the difference between a
   * gesture that failed and a gesture the user thinks succeeded. `endDrag` is
   * left to `onBlockDragCancel`, which fires for the same event.
   */
  const handleBlockDragAborted = (id: string) => {
    const source = gridSource(id);
    if (source) {
      announcer.report({ kind: "dragEnded", source, reason: "aborted" });
    }
  };

  // ─── Pointer move (drag tracking) ────────────────────────────────

  // The dragged block holds pointer capture, so `e.target` is the block itself
  // for the whole drag - the cell under the pointer has to be found by
  // coordinates rather than by walking up from the event target.
  const handlePointerMove = (e: PointerEvent) => {
    if (draggingId !== null || draggingFromProvider !== null) {
      setHoverCell(findCellAtPosition(e.clientX, e.clientY));
    }
  };

  // ─── Computed values for rendering ───────────────────────────────

  const activeAllowedRows = getActiveAllowedRows();
  const showValidTargets = isDragging || hoveredProviderId !== null;

  const isValidTarget = (colIndex: number, rowIndex: number): boolean => {
    if (command.carrying) {
      return command.carrying.targets.some((cell) =>
        samePosition(cell, { col: colIndex, row: rowIndex }),
      );
    }
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
    <div className={contentWrapper} onPointerMove={handlePointerMove}>
      {/* Named once and referenced by every block, so the instructions are
          available to a screen reader without being repeated nine times. */}
      <p id={BLOCK_INSTRUCTIONS_ID} className="sr-only">
        Press Enter to pick this block up, then use the arrow keys to choose a
        cell and Enter again to place it. Escape returns it. A block drawn on a
        price axis stays in its cell; there the arrow keys move it along that
        axis instead.
      </p>
      <div className={contentRow}>
        {/* Provider Column */}
        <ProviderColumn
          providerBlocks={providerBlocks}
          hoveredGridCell={hoveredGridCell}
          isDragging={isDragging}
          grid={grid}
          strategyPattern={strategyPattern}
          onProviderDragStart={handleProviderDragStart}
          onProviderDragEnd={handleProviderDragEnd}
          onProviderDragCancel={endDrag}
          onProviderDragAborted={handleProviderDragAborted}
          onProviderDragRecognised={handleDragRecognised}
          onProviderMouseEnter={handleProviderMouseEnter}
          onProviderMouseLeave={handleProviderMouseLeave}
          onProviderActivate={command.activateProvider}
          onCommandMove={command.moveTarget}
          onCommandCancel={command.cancel}
          carryingType={carryingProviderType}
          focusType={command.focusRequest}
          onFocusHandled={command.clearFocusRequest}
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
                    isCommandTarget={samePosition(command.carrying?.target, {
                      col: colIndex,
                      row: rowIndex,
                    })}
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
                    onBlockDragCancel={endDrag}
                    onBlockDragAborted={handleBlockDragAborted}
                    onBlockDragRecognised={handleDragRecognised}
                    onBlockVerticalDrag={handleBlockVerticalDrag}
                    onBlockActivate={command.activateBlock}
                    onBlockCommandMove={command.moveTarget}
                    onBlockCommandCancel={command.cancel}
                    onBlockAdjustPrice={handleBlockAdjustPrice}
                    onCellActivate={() =>
                      command.activateCell({ col: colIndex, row: rowIndex })
                    }
                    carryingBlockId={carryingBlockId}
                    focusBlockId={command.focusRequest}
                    onBlockFocusHandled={command.clearFocusRequest}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <LiveAnnouncer announcement={announcer.announcement} />
    </div>
  );
};

export default GridArea;
