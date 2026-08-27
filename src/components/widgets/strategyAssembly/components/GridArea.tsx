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
import {
  samePosition,
  type CommandSource,
} from "../../../../utils/blockCommand";
import type {
  BlockData,
  CellPosition,
  GridData,
  PlacementResult,
} from "../../../../types/grid";
import {
  COLUMN_HEADERS,
  type OrderTypeDefinition,
  type SvgIcon,
} from "../../../../data/orderTypes";
import { PATTERN_CONFIGS } from "../../../../types/grid";
import { positionFromPointer, SCALE_CONFIG } from "../../../../styles/grid";
import {
  getDragOverlayPosition,
  startDragOverlay,
  stopDragOverlay,
} from "../../../common/dragOverlayStore";
import { releaseBlockInHand } from "../../../../hooks/blockInHand";
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
  /**
   * A saved strategy the builder refused to load, because the market it was
   * placed on is not in the catalogue any more. `attempt` distinguishes two
   * presses of the same Edit button, so the second is announced too.
   */
  strategyMarketUnavailable?: { symbol: string; attempt: number } | null;
  /**
   * A saved strategy that has just been loaded into this grid, and the market
   * it brought with it.
   *
   * It arrives as a prop rather than being noticed here, because loading one
   * remounts this component: `loadConfig` bumps the key the assembly panel is
   * rendered with, so both the selection and the load land in one commit and
   * the fresh `GridArea` starts with `announcedMarketRef` already holding the
   * new symbol. The market-change effect below therefore has nothing to compare
   * against and says nothing, which is how the edit path came to change the
   * market silently. `App` is what survives the remount, so `App` carries it.
   */
  strategyLoaded?: {
    symbol: string;
    name: string;
    marketChanged: boolean;
  } | null;
  /**
   * Told that the sentence has been spoken. The prop is cleared in response, so
   * a later remount for some other reason - a submission bumps the same key -
   * does not announce a load that has already been announced.
   */
  onStrategyLoadAnnounced?: () => void;
}

/**
 * What the ghost on the cursor should look like for the block currently in
 * hand: the palette entry's own icon for an order type not yet placed, and the
 * placed block's for one already on the grid.
 *
 * `null` when the grid no longer holds the block, which is a real state rather
 * than a defensive one - Clear All and Reverse Blocks both replace the grid
 * under a live carry - and it is answered by drawing nothing rather than by
 * guessing an icon.
 */
const ghostFor = (
  source: CommandSource,
  providerBlocks: OrderTypeDefinition[],
  grid: GridData,
): { icon?: SvgIcon; abrv: string } | null => {
  if (source.kind === "provider") {
    const provider = providerBlocks.find((entry) => entry.type === source.type);
    return provider ? { icon: provider.icon, abrv: provider.abrv } : null;
  }
  const found = findBlockInGrid(grid, source.id);
  return found ? { icon: found.block.icon, abrv: found.block.abrv } : null;
};

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
const GridArea: FC<GridAreaProps> = ({
  currentPrice,
  tickerError,
  strategyMarketUnavailable,
  strategyLoaded,
  onStrategyLoadAnnounced,
}) => {
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

  // ─── A strategy the builder did load ─────────────────────────────
  //
  // One sentence for one event, from the one announcer. The load and the market
  // it came back on are two facts about the same press of Edit, and reporting
  // them as two outcomes is exactly the pair of live-region writes in quick
  // succession this module's history records the first of being cut off by the
  // second - so `gridAnnouncements` words them together and this reports one
  // outcome. The ref is moved on first, so the market-change effect above
  // cannot say the same thing again on a later render.
  useEffect(() => {
    if (!strategyLoaded) return;
    announcedMarketRef.current = strategyLoaded.symbol;
    announcer.report({
      kind: "strategyLoaded",
      name: strategyLoaded.name,
      symbol: strategyLoaded.symbol,
      marketChanged: strategyLoaded.marketChanged,
    });
    onStrategyLoadAnnounced?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyLoaded]);

  // ─── A strategy the builder would not load ───────────────────────
  //
  // Reported here rather than beside the Edit button for the same reason as
  // above: this grid is what did not change, and it has one voice. The refusal
  // itself belongs to `App`, which owns the market and the load; this only says
  // so, once, after the render in which nothing happened.
  const refusedAttemptRef = useRef<number | null>(null);

  useEffect(() => {
    if (!strategyMarketUnavailable) return;
    if (refusedAttemptRef.current === strategyMarketUnavailable.attempt) return;
    refusedAttemptRef.current = strategyMarketUnavailable.attempt;
    announcer.report({
      kind: "strategyMarketUnavailable",
      symbol: strategyMarketUnavailable.symbol,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyMarketUnavailable]);

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

  // ─── The cursor half of a mouse carry ────────────────────────────────
  //
  // A mouse user was asked to click instead of hold, so the block has to follow
  // the cursor between the two clicks exactly as it does during a drag. It is
  // the same ghost `useFreeDrag` puts up, from the same store, because a second
  // cursor-following block would be a second answer to "where is the block the
  // user is holding" - and the drag's ghost is already right.
  //
  // Only for a carry the mouse started. A finger and a pen leave nothing on
  // screen between contacts, so a ghost pinned to where they last touched
  // would be an artefact rather than the block; the keyboard has no pointer
  // position at all and its last one would be wherever the mouse was left.
  //
  // `ghostFor` reads the block being carried out of the same two places the
  // rest of this component does, so the ghost can never show an icon the grid
  // and the palette disagree with.
  const carriedGhost =
    command.carrying?.origin === "mouse"
      ? ghostFor(command.carrying.source, providerBlocks, grid)
      : null;
  // Which block is on the cursor, so the effect below runs when the carry
  // starts and ends rather than on every target change. `null` covers both
  // "nothing is carried" and "the grid no longer holds what is", which is why
  // it is derived from the ghost rather than from the source.
  const carriedGhostKey = carriedGhost
    ? (carryingProviderType ?? carryingBlockId)
    : null;

  useEffect(() => {
    if (!carriedGhost) return;
    // `dragOverlayStore` still holds the position of the press that picked the
    // block up - `useFreeDrag` put a ghost there on pointer down and took it
    // off again on the release - so the carry's ghost starts under the cursor
    // rather than jumping there on the first move. `DragOverlay` tracks the
    // pointer itself from then on.
    const { x, y } = getDragOverlayPosition();
    const handle = startDragOverlay(carriedGhost.icon, carriedGhost.abrv, x, y);
    // By handle: dragging the very block being carried starts the drag's own
    // ghost before this carry ends, and a handle-less stop here would clear the
    // ghost of the gesture that just superseded it.
    return () => stopDragOverlay(handle);
    // Keyed on which block is in hand, not on the carry object: the carry is a
    // new object every time the target cell changes, and restarting the ghost
    // on each of those would put it back at the pick-up point mid-sweep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carriedGhostKey]);

  // ─── Hover handlers ──────────────────────────────────────────────

  const handleGridCellMouseEnter = (colIndex: number, rowIndex: number) => {
    if (draggingId === null && draggingFromProvider === null) {
      setHoveredGridCell({ col: colIndex, row: rowIndex });
    }
    // The cell under the cursor is the cell a click would place into, so it is
    // the cell drawn as the target. Without this the target stays where the
    // pick-up left it and the highlight names a cell the next click will not
    // use - the model would still place correctly, and the user would have been
    // shown otherwise. `pointToTarget` ignores anything that is not a live
    // mouse carry, and says nothing: see its own note.
    command.pointToTarget({ col: colIndex, row: rowIndex });
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

  // ─── Putting a block down by clicking away from the grid ─────────
  //
  // The placement surface is exactly what this component draws: the palette a
  // block is picked up from, and the cells it can be put down in. Everything
  // else on the page - the pattern selector, Clear All, Execute Trade, the
  // chart, the orders panel, the background - can place nothing, so a click
  // there means the user is done holding whatever they are holding. Choosing
  // the surface by the element that owns placement, rather than by a panel
  // outline or a coordinate, is what keeps this rule and the drop rules from
  // ever disagreeing: a click that lands on a legal target is not outside.
  const placementSurfaceRef = useRef<HTMLDivElement>(null);

  // One release, through the one register. `releaseBlockInHand` ends every
  // mechanism that has a block in hand - the command model's carry and any
  // pointer gesture still in flight - because the user cannot tell which of
  // them has the block, and because the two answering separately is what let a
  // dismissal click delete one. See `hooks/blockInHand.ts`.
  //
  // Each of those mechanisms reports its own outcome, and one dismissal is one
  // event, so they are collected into one live-region write: two writes here
  // means the second replaces the first before it has been read. `asOneEvent`
  // changes nothing when only one thing was held, which is the common case.
  //
  // The two calls after it are cleanup of what a hold leaves *drawn* rather
  // than second opinions about who holds what: the register's own releases
  // already run these for every hold it knew about, and these run for a ghost
  // or a highlight left behind by a hold it never did. The handle-less
  // `stopDragOverlay()` is deliberate and is the only handle-less stop in the
  // app: this is putting down everything that is in hand, so there is no ghost
  // it means to leave standing.
  //
  // Focus is deliberately not handed back - the user has just clicked somewhere
  // else, and `restoreFocus` would drag them back to the block they were
  // leaving, which is the same reason Tab does not restore it.
  const releaseInHandRef = useRef<() => void>(() => {});
  useEffect(() => {
    releaseInHandRef.current = () => {
      announcer.asOneEvent(releaseBlockInHand);
      stopDragOverlay();
      endDrag();
      setHoveredProviderId(null);
    };
  });

  // `pointerdown` in the capture phase. Capture, so nothing in between can
  // swallow the click before it is seen; pointer-down rather than click,
  // because a drag that is genuinely in flight holds pointer capture and every
  // event it produces is retargeted to the dragged block - which is inside the
  // surface - so a live gesture is not cancelled by this, only a ghost one
  // that has already lost its owner. That rests on the capture, which is not
  // guaranteed.
  //
  // What this hatch does and does not answer for. It ends every hold the
  // register knows about, so a stale gesture's window listeners come off here
  // and the `pointerup` that completes this very click can no longer be matched
  // as that gesture's drop. It is still a boundary rather than a detector: it
  // fires when the user acts, and between an unheard release and that action
  // the gesture is live and its ghost is on the cursor. The exits in
  // `usePointerGesture` - the `buttons === 0` transition among them - are what
  // cover the ways a user reaches that state without clicking away.
  useEffect(() => {
    const onPointerDownAnywhere = (event: globalThis.PointerEvent) => {
      const surface = placementSurfaceRef.current;
      if (!surface) return;
      const target = event.target;
      if (target instanceof Node && surface.contains(target)) return;
      releaseInHandRef.current();
    };
    document.addEventListener("pointerdown", onPointerDownAnywhere, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDownAnywhere, true);
  }, []);

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

  // While the dragged block holds pointer capture, `e.target` is the block
  // itself for the whole drag, so the cell under the pointer has to be found by
  // coordinates rather than by walking up from the event target. Coordinates
  // are the answer for a drag whose capture was refused too, where the target
  // is instead whatever happens to be under the cursor.
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
    <div
      ref={placementSurfaceRef}
      className={contentWrapper}
      onPointerMove={handlePointerMove}
    >
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
