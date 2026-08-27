import {
  useEffect,
  useRef,
  useState,
  type FC,
  type PointerEvent,
} from "react";
import {
  isCellValidForPlacement,
  getAlignment,
  isCellDisabled,
  findBlockInGrid,
  findCellAtPosition,
  addBlocksToCell,
  cellDirection,
  clampOffset,
  isDescending,
  MAX_OFFSET_PERCENT,
  MIN_OFFSET_PERCENT,
  hasConditionalWithoutPrimary,
  createBlocksFromOrderType,
} from "../../../../utils";
import {
  samePosition,
  type ProviderSource,
} from "../../../../utils/blockCommand";
import type {
  BlockData,
  CellPosition,
  PlacementResult,
} from "../../../../types/grid";
import {
  COLUMN_HEADERS,
  type OrderTypeDefinition,
  type SvgIcon,
} from "../../../../data/orderTypes";
import { PATTERN_CONFIGS } from "../../../../types/grid";
import { positionFromPointer } from "../../../../styles/grid";
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
  gridPane,
  cellLockedNote,
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
 * What the ghost on the cursor should look like for the order currently in
 * hand: the palette entry's own icon.
 *
 * Only a palette order is ever carried - a placed block never changes cells
 * (decision D9) - so there is one lookup here rather than two. `null` when the
 * palette does not know the type, which is answered by drawing nothing rather
 * than by guessing an icon.
 */
const ghostFor = (
  source: ProviderSource,
  providerBlocks: OrderTypeDefinition[],
): { icon?: SvgIcon; abrv: string } | null => {
  const provider = providerBlocks.find((entry) => entry.type === source.type);
  return provider ? { icon: provider.icon, abrv: provider.abrv } : null;
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
  const { grid, strategyPattern, setGrid } = useGridData();

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

  // ─── The refusal, on screen ──────────────────────────────────────
  //
  // Decision D9 asks for the refusal to be *legible* rather than silent: a
  // gesture that simply does nothing is indistinguishable from a broken one.
  // The announcer covers a screen-reader user, and this covers everybody else -
  // the label of the last order that was asked to change cells, drawn as a note
  // under the grid until the next gesture starts.
  //
  // Ordinary visible text, deliberately: no `aria-live`, no `role="status"`. A
  // second live region would talk over `LiveAnnouncer` during the one
  // interaction that fires both, which is exactly what the announcer being the
  // grid's single voice exists to prevent.
  const [refusedMove, setRefusedMove] = useState<string | null>(null);

  // The note names an order by its label, so that label is the identity it has
  // to keep: once no block on the grid carries it, the note is talking about
  // something the user can no longer see. `clearAll`, `reverseBlocks` and a
  // market switch all replace the grid wholesale without going near the
  // gestures that reset this, which is how a note naming a cleared-away order
  // came to sit under an empty grid.
  useEffect(() => {
    if (!refusedMove) return;
    const stillOnGrid = grid.some((col) =>
      col.some((cell) => cell.some((block) => block.label === refusedMove)),
    );
    if (!stillOnGrid) setRefusedMove(null);
  }, [grid, refusedMove]);

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

    const { blocks, nextCounter } = createBlocksFromOrderType(providerBlock, {
      baseId,
      counter: blockCounterRef.current,
    });
    blockCounterRef.current = nextCounter;

    const blockId = blocks[0]?.id;
    if (!blockId) {
      // The factory produced nothing, so the grid gains nothing either.
      return { status: "refused" };
    }

    // `addBlocksToCell` is the one write path into a cell, and the only thing
    // that chooses a direction: an occupied cell keeps the scale it already
    // draws, an empty one takes the scale its first arrival implies, and every
    // block in the cell is stamped with it. That is decision D8, and it is why
    // a Stop Loss dropped beside a Limit is priced the way the cell is drawn
    // rather than the way its order type would have been drawn alone.
    setGrid((prev) => addBlocksToCell(prev, target, blocks, strategyPattern));
    setRefusedMove(null);

    return { status: "created", blockId };
  };

  /**
   * A placed block was released over a cell. It never moves.
   *
   * Captain decision D9: once a block is placed and priced, its cell is where
   * it lives - every block, with no per-type carve-out. So this reports rather
   * than mutates: `unchanged` for a release inside the block's own cell, and
   * `refused` for any other cell, which the announcer words as the rule it is
   * and `refusedMove` puts on screen for everyone else. Correcting a misplaced
   * order means removing it and placing a new one, until the cell-detail editor
   * ships.
   *
   * A cross-cell move is not merely unwired here, it is the one thing this
   * function exists to say no to. It used to rewrite `axis` and `yPosition`
   * from the drop coordinates and re-stamp the direction from the target cell,
   * which is how one leg of a dual-axis order could end up on the opposite side
   * of the market from its partner.
   */
  const keepBlockInItsCell = (
    id: string,
    target: CellPosition,
  ): PlacementResult => {
    const blockInfo = findBlockInGrid(grid, id);
    // Not a refusal by any cell: a carry can outlive the grid it was started
    // against, and there is then no cell to name in either clause.
    if (!blockInfo) return { status: "gone" };

    const at = { col: blockInfo.col, row: blockInfo.row };
    return samePosition(at, target)
      ? { status: "unchanged", blockId: id }
      : { status: "refused", at, reason: "staysInCell" };
  };

  /**
   * Take a block off the grid entirely - a drag that ended outside it.
   *
   * This is the *only* way to get an order out of a cell, and under decision D9
   * it is therefore how a misplaced order is corrected: remove it and place a
   * new one. The cell's direction is untouched by a removal, because every
   * block left behind already carries it - that is what stops a Stop Loss from
   * flipping from `-15.00% $85,000` to `+15.00% $115,000` when the block beside
   * it is deleted.
   */
  const removeBlock = (id: string, source: CellPosition) => {
    setGrid((prev) => {
      const newGrid = prev.map((col) => col.map((row) => [...row]));
      newGrid[source.col][source.row] = newGrid[source.col][source.row].filter(
        (b) => b.id !== id,
      );
      return newGrid;
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
    // A placed block is never carried, because it never changes cells
    // (decision D9), so the command model only ever commits palette orders.
    // `refuseMove` is what a press on a placed block reaches instead, and it
    // both speaks and puts the rule on screen.
    refuseMove: (label, reason) => {
      if (reason === "staysInCell") setRefusedMove(label);
      announcer.report({ kind: "moveRefused", label, reason });
    },
  });

  const carryingProviderType = command.carrying?.source.type ?? null;

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
  // `ghostFor` reads the carried order out of the same palette the rest of this
  // component does, so the ghost can never show an icon the palette disagrees
  // with.
  const carriedGhost =
    command.carrying?.origin === "mouse"
      ? ghostFor(command.carrying.source, providerBlocks)
      : null;
  // Which order is on the cursor, so the effect below runs when the carry
  // starts and ends rather than on every target change. `null` covers both
  // "nothing is carried" and "the palette does not know this type", which is
  // why it is derived from the ghost rather than from the source.
  const carriedGhostKey = carriedGhost ? carryingProviderType : null;

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

  /**
   * Which rows the gesture in flight could legally place into, for the cell
   * highlighting.
   *
   * A palette order gets its order type's rows. A *placed* block gets none, and
   * that is the point: it is not going anywhere (decision D9), so lighting up
   * cells that would take it would be the interface promising a move the drop
   * is about to refuse. Dragging one now highlights nothing at all, which is
   * the first half of telling the user why - `refusedMove` is the second.
   */
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
    return [];
  };

  // ─── Drag handlers ───────────────────────────────────────────────

  const handleDragStart = (id: string) => {
    carryReleasedByDragRef.current = false;
    setRefusedMove(null);
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
    setRefusedMove(null);
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
    // The cell alone. A drop no longer carries a position or an axis with it:
    // where along the axis a new order starts is the order type's own default,
    // and which leg it is comes from `axesForBlockAxis`. Reading those off the
    // drop coordinates was two separate defects - a 0-100 reading written into
    // a 0-50 axis, and an `axis` rewritten without its matching `axes`.
    const cell = findCellAtPosition(x, y);
    const source = providerSource(type);

    const releasedCarry = carryReleasedByDragRef.current;

    if (cell) {
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

  /**
   * Write a new axis position for one block.
   *
   * The grid is the only store: the saved `orderConfig` is derived from it by
   * `orderConfigFromGrid`, so there is no second copy here to keep in step.
   * `clampOffset` is the mapping owner's, so no gesture can write a position
   * the axis could not have drawn - which is what made a price of zero
   * reachable.
   */
  const setBlockPosition = (id: string, yPosition: number) => {
    const clamped = clampOffset(yPosition);
    setGrid((prev) =>
      prev.map((gridCol) =>
        gridCol.map((rowArray) =>
          rowArray.map((b) => (b.id === id ? { ...b, yPosition: clamped } : b)),
        ),
      ),
    );
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
      isDescending(cellDirection(grid[col][row])),
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
    const towardsMarket = isDescending(cellDirection(grid[col][row]))
      ? -delta
      : delta;
    const next = Math.max(
      MIN_OFFSET_PERCENT,
      Math.min(MAX_OFFSET_PERCENT, block.yPosition + towardsMarket),
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
    const cell = findCellAtPosition(x, y);

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
    // block is sitting in - and a release over a *different* cell reads as the
    // rule that refused it rather than as a cell that happens to be full.
    if (cell) {
      const result = keepBlockInItsCell(id, cell);
      if (result.status === "refused") setRefusedMove(blockInfo.block.label);
      announcer.report({
        kind: "placement",
        source,
        cell,
        result,
        via: "drag",
        releasedCarry,
      });
    } else {
      // Dropped outside - remove only this block. This is the one way an order
      // leaves a cell, and under decision D9 it is how a misplaced one is put
      // right: remove it, then place a new one where it belongs.
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
  // A placed block being dragged offers no targets at all, so nothing is drawn
  // as one. `draggingFromProvider` is what makes a drag show targets now.
  const showValidTargets =
    draggingFromProvider !== null || hoveredProviderId !== null;

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
    <div className={gridPane}>
      <div
        ref={placementSurfaceRef}
        className={contentWrapper}
        onPointerMove={handlePointerMove}
      >
      {/* Named once and referenced by every block, so the instructions are
          available to a screen reader without being repeated nine times. */}
      <p id={BLOCK_INSTRUCTIONS_ID} className="sr-only">
        Press Enter on an order in the palette to pick it up, then use the
        arrow keys to choose a cell and Enter again to place it. Escape returns
        it. A block already on the grid stays in the cell it was placed in: on a
        price axis the arrow keys move it along that axis, and in a cell that
        draws no price axis it can be dragged off the grid to remove it.
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
                    focusBlockId={command.focusRequest}
                    onBlockFocusHandled={command.clearFocusRequest}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      </div>
      {refusedMove && (
        // Plain visible text, not a live region: `LiveAnnouncer` below is the
        // grid's one voice, and a second one would cut it off mid-sentence
        // during the very interaction that fires both.
        <p className={cellLockedNote}>
          <strong>{refusedMove}</strong> stays in the cell it was placed in.
          Orders do not move between cells - to put this one somewhere else,
          drag it off the grid to remove it, then place a new one.
        </p>
      )}
      <LiveAnnouncer announcement={announcer.announcement} />
    </div>
  );
};

export default GridArea;
