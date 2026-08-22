import { useEffect, useRef, type FC, type PointerEvent } from "react";
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
import { useMarket } from "../../../../store/useMarket";
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
    // Not a refusal by any cell: a carry can outlive the grid it was started
    // against, and there is then no cell to name in either clause.
    if (!blockInfo) return { status: "gone" };

    const { col: sourceCol, row: sourceRow, block: blockData } = blockInfo;
    const source = { col: sourceCol, row: sourceRow };
    const isSameCell = sourceCol === target.col && sourceRow === target.row;

    // Two decisions here, and keeping them apart is the point.
    //
    // THE GUARD, below. `!position` is load-bearing scope protection rather
    // than an oversight: it leaves the control flow of a same-cell release
    // carrying drop coordinates exactly as it is on main. In the bulk pattern
    // the placement rules take any cell, so the full move below still runs -
    // it rewrites `axis` and `yPosition` onto the block and its order config,
    // and the remove-then-push reorders the cell array, which is what the cell
    // header reads `blocks[0]` for. That reordering and re-pricing is the
    // cell-scale family of defects, owned by `bb3-mapping-owner` under the
    // ruling that direction belongs to the cell and is stamped when the first
    // block lands. Reconciling it here as well would be a second lane
    // answering one question, which has already gone wrong on this project
    // once. So the mutation stays byte-identical, and only what the user is
    // TOLD is fixed.
    //
    // WHAT IS REPORTED, decided independently of that check. A block can never
    // be refused by the cell it is already sitting in, whatever the placement
    // rules say about an occupied cell - that is the whole of the defect this
    // lane exists to close. Every same-cell release reads `unchanged`, on the
    // refused path and on the mutated path alike; `refused` is left to a
    // genuinely different target cell and `moved` to a release that really did
    // change cells.
    if (isSameCell && !position) {
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
      return isSameCell
        ? { status: "unchanged", blockId: id }
        : { status: "refused", at: source };
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

    return isSameCell
      ? { status: "unchanged", blockId: id }
      : { status: "moved", blockId: id };
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

  // ─── Market changes ──────────────────────────────────────────────
  //
  // Switching market re-prices every block on the grid, and nothing says so to
  // a screen-reader user: the `<select>` speaks its own new value, which is a
  // fact about the control rather than about the grid. So the grid's own
  // announcer says it, from here rather than from the selector, because it is
  // the single owner of everything the grid speaks - the selector has no
  // `announce` to reach for and that is deliberate.
  //
  // Reported from an effect, after the render that actually re-priced the
  // cells, so the sentence is a fact rather than an intention. The ref starts at
  // the current market so the first render says nothing: the app has not
  // "changed" to the market it opened on.
  const { market } = useMarket();
  const announcedMarketRef = useRef(market.symbol);

  useEffect(() => {
    if (announcedMarketRef.current === market.symbol) return;
    announcedMarketRef.current = market.symbol;
    announcer.report({
      kind: "marketChanged",
      name: market.name,
      symbol: market.symbol,
    });
    // `announcer` is re-created every render; listing it would re-announce on
    // every one of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market.symbol, market.name]);

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
    carryReleasedByDragRef.current = false;
    setDraggingId(id);
  };

  /**
   * Whether the drag now in flight quietly took a carry of that same block out
   * of the user's hand. `releaseForDrag` says nothing there on purpose - see
   * its own note - so the outcome this gesture reaches has to carry the news,
   * and this is how it travels from the moment of recognition to the moment of
   * the drop.
   *
   * It is reset at the START of every gesture rather than at the end, and that
   * is deliberate: a `pointercancel` fires `onDragCancel` - which is `endDrag`
   * - BEFORE `onDragAborted`, which is the handler that announces, so clearing
   * it on end would wipe the flag the abort sentence needs. Every gesture that
   * can READ the flag resets it on its own pointer-down, so nothing leaks into
   * the next one. That is narrower than every gesture: `useVerticalDrag` takes
   * no `onDragStart`, so a price drag leaves the flag untouched - harmless
   * while the price drag announces nothing, and the thing to fix first if it
   * ever should.
   */
  const carryReleasedByDragRef = useRef(false);

  /**
   * A real drag has started on `subjectKey` - a block id, or a palette order
   * type. Whether that ends an active carry silently or out loud is decided in
   * one place, `releaseForDrag`, from whether the drag is about the carried
   * block itself. A silent release is remembered rather than dropped.
   */
  const handleDragRecognised = (subjectKey: string) => {
    carryReleasedByDragRef.current = command.releaseForDrag(subjectKey);
  };

  const endDrag = () => {
    setDraggingId(null);
    setDraggingFromProvider(null);
    setHoverCell(null);
  };

  const handleProviderDragStart = (type: string) => {
    carryReleasedByDragRef.current = false;
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

    const releasedCarry = carryReleasedByDragRef.current;

    if (positionData) {
      const cell = { col: positionData.col, row: positionData.row };
      announcer.report({
        kind: "placement",
        source,
        cell,
        result: placeProviderInCell(type, cell),
        via: "drag",
        releasedCarry,
      });
    } else {
      // Released over no cell at all. Nothing was created, and this used to be
      // the one drag outcome that said nothing whatsoever.
      announcer.report({
        kind: "dragEnded",
        source,
        reason: "offGrid",
        releasedCarry,
      });
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
      releasedCarry: carryReleasedByDragRef.current,
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

  /**
   * A placed block, named the way the announcer names it, from the lookup its
   * caller has already done: finding it twice is one traversal too many and
   * leaves two null checks to keep in step.
   */
  const gridSource = (info: {
    col: number;
    row: number;
    block: BlockData;
  }) => ({
    kind: "grid" as const,
    id: info.block.id,
    label: info.block.label,
    origin: { col: info.col, row: info.row },
  });

  const handleDragEnd = (id: string, x: number, y: number) => {
    const blockInfo = findBlockInGrid(grid, id);
    const positionData = findCellAndPositionData(
      x,
      y,
      strategyPattern,
      blockInfo?.block.orderType,
    );

    // The block is not on the grid, so there is no fact to report about it.
    if (!blockInfo) {
      endDrag();
      return;
    }

    const source = gridSource(blockInfo);
    const releasedCarry = carryReleasedByDragRef.current;

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
        releasedCarry,
      });
    } else {
      // Dropped outside - remove only this block
      removeBlock(id, source.origin);
      announcer.report({ kind: "removed", source, releasedCarry });
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
    const blockInfo = findBlockInGrid(grid, id);
    if (blockInfo) {
      announcer.report({
        kind: "dragEnded",
        source: gridSource(blockInfo),
        reason: "aborted",
        releasedCarry: carryReleasedByDragRef.current,
      });
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
