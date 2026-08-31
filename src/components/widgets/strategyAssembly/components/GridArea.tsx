import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  addBlocksToCell,
  cellDirection,
  isDescending,
  legOfBlock,
  offsetForOrder,
  MAX_OFFSET_PERCENT,
  MIN_OFFSET_PERCENT,
  hasConditionalWithoutPrimary,
  createBlocksFromOrderType,
  resolveDrop,
  removeBlockFromGrid,
  clearCellInGrid,
  type DropResolution,
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
import { BLOCK_HEIGHT, positionFromPointer } from "../../../../styles/grid";
import {
  getDragOverlayPosition,
  startDragOverlay,
  stopDragOverlay,
} from "../../../common/dragOverlayStore";
import { releaseBlockInHand } from "../../../../hooks/blockInHand";
import { cn } from "../../../../lib/utils";
import ProviderColumn from "../../../common/grid/ProviderColumn";
import ColumnPager from "./ColumnPager";
import GridCell from "../../../common/grid/GridCell";
import LiveAnnouncer from "../../../common/LiveAnnouncer";
import { BLOCK_INSTRUCTIONS_ID } from "../../../blocks/block";
import { useBlockCommand } from "../../../../hooks/useBlockCommand";
import { useGridAnnouncer } from "../../../../hooks/useGridAnnouncer";
import type { PickUpRefusal } from "../../../../utils/gridAnnouncements";
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
  pagedColumn,
  offPageColumn,
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
  // the last order that was asked to change cells, drawn as a note under the
  // grid until the next gesture starts or the user does what it asks.
  //
  // Ordinary visible text, deliberately: no `aria-live`, no `role="status"`. A
  // second live region would talk over `LiveAnnouncer` during the one
  // interaction that fires both, which is exactly what the announcer being the
  // grid's single voice exists to prevent.
  const [refusedMove, setRefusedMove] = useState<{
    id: string;
    at: CellPosition;
    label: string;
    reason: Exclude<PickUpRefusal, "noTargets">;
  } | null>(null);

  // The note is a claim about one block IN ONE CELL - "this order stays where
  // it was placed" - so it holds only while that pairing does. Both halves are
  // load-bearing:
  //
  // - The id, because the note is about one block: once it is off the grid the
  //   note describes something the user can no longer see. `clearAll`,
  //   `reverseBlocks` and a market switch all replace the grid wholesale
  //   without going near the gestures that reset this, which is how a note
  //   naming a cleared-away order came to sit under an empty grid. Keyed on the
  //   label instead, two Market orders sharing the grid kept the note alive
  //   after the one it named was dragged off.
  // - The cell, because `reverseBlocks` swaps the columns while keeping every
  //   block's id, so the block is still found while it visibly moves to the
  //   other column - and the note went on insisting it stays in the cell it was
  //   placed in, beside a block that had just changed cells.
  useEffect(() => {
    if (!refusedMove) return;
    const found = findBlockInGrid(grid, refusedMove.id);
    if (!found || !samePosition(found, refusedMove.at)) setRefusedMove(null);
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
    // Not a refusal by any cell: the grid does not hold this block, so there
    // is no cell to name in either clause. No carry is in play here - this
    // gesture released one at drag recognition; see `PlacementResult`'s
    // `gone` for the rest.
    if (!blockInfo) return { status: "gone" };

    const at = { col: blockInfo.col, row: blockInfo.row };
    return samePosition(at, target)
      ? { status: "unchanged", blockId: id }
      : { status: "refused", at, reason: "staysInCell" };
  };

  /**
   * Take a block off the grid entirely, links to it included.
   *
   * This is the grid's half of the block-level removal: the command model owns
   * the operation - who asked, what is said, where focus lands - and this owns
   * the write. `removeBlockFromGrid` is where the write itself lives, so the
   * filtering and the link clearing cannot come apart; see its own note for why
   * a removal that leaves a dangling `linkedBlockId` behind would hand the user
   * a strategy the mapper rightly refuses and no control that mends it.
   *
   * It takes no cell. The id is enough, and a cell travelling beside it is one
   * more pair of facts to keep in step.
   *
   * It returns what it wrote, because the command model decides the fate of a
   * carry in the user's other hand from it - see `removeFromGrid` there for why
   * that one path cannot wait for the next render. Computed from this render's
   * `grid` rather than through an updater, deliberately: the model has already
   * looked the block up in exactly this grid, so the value both of them reason
   * about is one value rather than two that agree.
   *
   * **The price of that, stated so the next writer meets it here rather than in
   * the product:** a value write does not compose with another grid write
   * batched into the same event, the way this file's other two `setGrid` callers
   * do - a second writer in one event would clobber this one and resurrect the
   * block. No such path exists today: each removal affordance (Delete or
   * Backspace, a free drag released clear of every cell, and the cell's own
   * clear control, which writes through `clearCellInGridData` below) fires once
   * per event, and the placement and price writes are events of their own. Adding one means revisiting this, and the way out is
   * not simply restoring the updater - the returned value is what makes the grid
   * the model reasons about and the grid this wrote provably the same object,
   * which is what keeps the removal's own sentence from being erased.
   */
  const removeBlockFromCell = (id: string) => {
    const next = removeBlockFromGrid(grid, id);
    setGrid(next);
    return next;
  };

  /**
   * Empty one cell entirely, links to everything it held included.
   *
   * The grid's half of the pointer's removal, on the same terms as
   * `removeBlockFromCell` above: `clearCellInGrid` owns the write so the
   * filtering and the link clearing cannot come apart, and it returns what it
   * wrote so the command model can decide a carry's fate in the same event
   * rather than a render later. The same value-write caution applies - a second
   * grid write batched into this event would clobber it and resurrect the
   * orders - and there is no such path: the clear control fires once per event.
   */
  const clearCellInGridData = (cell: CellPosition) => {
    const next = clearCellInGrid(grid, cell);
    setGrid(next);
    return next;
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

  // ─── The paged column viewport ───────────────────────────────────────
  //
  // WHICH COLUMN IS ON SCREEN. Below `sm` the panel cannot draw both grid
  // columns at once - two `min-w-[220px]` columns and a 6px gap need 446px
  // against a 288px panel at 320 - so `columnsWrapper` is a one-column viewport
  // over the pair and this is which of them it shows. It is derived: it follows
  // the carry's target ALWAYS, the target a pick-up starts on included, which
  // is what makes a carry survive paging and what opens the pager on the other
  // column when that is the only place an order may go. `ColumnPager` is the
  // control; above `sm` the wrapper stops being a scroll container at all and
  // this state stops meaning anything, which is why it is expressed as a scroll
  // position rather than as a rule about what to render.
  const [visibleColumn, setVisibleColumn] = useState(0);
  // Which columns the panel is WITHHOLDING, read off their own computed
  // `pointer-events` rather than off a breakpoint of its own; the rule that
  // writes it is `syncOffPageColumns` below, and its comment is the authority.
  // It is declared up here because the command model is handed a value derived
  // from it, and the derivation has to exist before that call.
  const [offPageColumns, setOffPageColumns] = useState(0);
  const columnsViewportRef = useRef<HTMLDivElement>(null);

  /**
   * The one grid column the panel is showing, or `null` while it is showing
   * them all.
   *
   * **What a pick-up starts from, and the reason a pick-up no longer chooses
   * for itself.** It used to take the first legal cell of its offer in
   * column-major order, so on a phone paged to Exit it landed in Entry and the
   * viewport - which follows the carry's target - dragged the user back to the
   * column they had deliberately left. It starts in the column on screen
   * instead; see `initialTarget`.
   *
   * **This is a fact about the panel right now, not a preference remembered
   * between carries, and the difference is the whole design.** A remembered
   * column has to answer "did the user choose this one?", which means naming
   * every state change that counts as a choice - a question with more entry
   * points than can be enumerated, and one that was enumerated wrongly through
   * eight review rounds before that design was withdrawn. Nothing here observes
   * a change. The panel is showing one column or it is showing them all, and
   * the pick-up reads which at the moment it happens.
   *
   * `null` above `sm`, where nothing is withheld: the question does not arise,
   * so the offer decides on its own and desktop is exactly what it was. That is
   * why "is the panel paging at all" is asked of `offPageColumns` - the same
   * computed `pointer-events` the drop resolver and the tab-order rule read -
   * rather than of a breakpoint written down a second time here. `visibleColumn`
   * stays the one WRITER of which column that is; this only reads it.
   */
  const shownColumn = offPageColumns === 0 ? null : visibleColumn;

  const command = useBlockCommand({
    grid,
    strategyPattern,
    providerBlocks,
    shownColumn,
    announcer,
    placeProvider: placeProviderInCell,
    removeFromGrid: removeBlockFromCell,
    clearFromGrid: clearCellInGridData,
    // A placed block is never carried, because it never changes cells
    // (decision D9), so the command model only ever commits palette orders.
    // `refuseMove` is what a press on a placed block reaches instead, and it
    // both speaks and puts the rule on screen.
    refuseMove: (block, at, reason) => {
      setRefusedMove({ id: block.id, at, label: block.label, reason });
      announcer.report({ kind: "moveRefused", label: block.label, reason });
    },
  });

  const carryingProviderType = command.carrying?.source.type ?? null;

  // **The carry's target and the column on screen are one fact.** A carry
  // highlights a cell and reads it out as `aria-current`, so a target in the
  // column the viewport is not showing is an invitation the user cannot see -
  // the mirror of the stale highlight the `gridReplaced` transition exists to
  // stop. The target is the owner and the viewport follows it: the arrow keys
  // move the target between columns, and `ColumnPager` dispatches that very
  // same `moveTarget` rather than moving the viewport behind the carry's back.
  //
  // Keyed on the target's column alone, so nudging a carried block's target up
  // and down a column does not re-run it, and so a page the user asked for
  // while carrying nothing is not undone by the next render.
  //
  // A layout effect, because it must commit before the browser paints. As an
  // ordinary effect it ran after the paint of the render in which the target
  // had already moved, so for one frame the OLD column was on screen while
  // `aria-current` sat on a cell inside the column `offPageColumn` had just
  // withheld - the very state this pairing exists to prevent, on every
  // cross-column move. The extra render is synchronous, and the scroll effect
  // below still runs after it on `visibleColumn`.
  //
  // **It writes the viewport and nothing else, and nothing here touches DOM
  // focus.** Nothing anywhere in this component does: see `ColumnPager` for
  // why paging cannot strand a carry without a single focus call.
  const carryTargetColumn = command.carrying?.target.col ?? null;
  useLayoutEffect(() => {
    if (carryTargetColumn === null) return;
    setVisibleColumn(carryTargetColumn);
  }, [carryTargetColumn]);

  // Tab does not enter the column the pager is not showing.
  //
  // The peeking column is DRAWN (see `offPageColumn`), so unlike the
  // `visibility: hidden` this replaced it is focusable, and a Tab into it would
  // make the browser scroll the viewport to a column the pager did not choose -
  // leaving the control claiming a column the user is not on, which is the
  // stale offer the whole paging design exists to withhold.
  //
  // `tabindex` and not `inert`, and the difference is the point: `inert` blurs
  // what it is applied to, so paging away from a focused block would drop focus
  // to `<body>` - the exact defect that four rounds of focus hand-offs failed to
  // close, reintroduced by the cure. Setting `tabindex` to -1 on an element that
  // already holds focus does NOT blur it; the element keeps focus and merely
  // leaves the sequential order. So nothing here ever moves focus, and this
  // panel still contains no code that does.
  //
  // Which column is off page is read from the same inherited `pointer-events`
  // that `cellBoxesFromDom` reads, rather than from `visibleColumn` plus a
  // breakpoint of its own: one owner for "is this column reachable", so the tab
  // order, the drop resolver and the target highlight cannot come to disagree
  // about it. `visibleColumn` is what WRITES the class; it is not the answer,
  // because above `sm` the class resolves to nothing and both columns are
  // reachable whatever it says.
  //
  // **It is a function rather than an effect body because it has TWO triggers,
  // and a rule read off the viewport cannot be derived from renders alone.**
  // A render is what brings new focusables into a column; the viewport's own
  // size is what decides whether that column is off page at all, and crossing
  // `sm` changes that with no React render behind it. Both are below: the
  // effect covers the first, and the viewport effect that follows calls this
  // from the SAME `ResizeObserver` it already installs for the second. One
  // observer on one box, because two watching it for the same reason is how
  // they come to disagree.
  //
  // **Every read happens before any write, and a write already in place is
  // skipped.** `getComputedStyle` after a DOM mutation forces a fresh style
  // recalculation, and this runs after every render - including every
  // `pointermove` of a drag, since the hover cell is re-derived there. Reading
  // both columns first costs one recalculation rather than one per column, and
  // the skip keeps a drag from re-writing every `tabindex` in the off-page
  // column on each of those renders. Neither changes what the rule computes.
  //
  // The state itself is declared at the top of this section, beside
  // `visibleColumn`, because `shownColumn` is derived from it there.

  const syncOffPageColumns = useCallback(() => {
    const viewport = columnsViewportRef.current;
    if (!viewport) return;

    const columns = Array.from(viewport.children);
    const withheld = columns.map(
      (columnElement) =>
        getComputedStyle(columnElement).pointerEvents === "none",
    );

    // Published as a bitmask so an unchanged answer is an unchanged value and
    // React bails out of the re-render this would otherwise cause on every
    // pass. An array would be a fresh reference each time and never settle.
    setOffPageColumns(
      withheld.reduce((mask, offPage, col) => mask | (Number(offPage) << col), 0),
    );

    columns.forEach((columnElement, col) => {
      const focusable = columnElement.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      );
      for (const element of Array.from(focusable)) {
        if (withheld[col]) {
          // Remember what the element asked for before this rule touched it, so
          // restoring cannot invent a tab stop the component never wanted. It
          // has to happen before the write below, and the guard is the record
          // rather than the value: an element the rule has already touched
          // reads `-1` for a reason that is not its own.
          if (!element.hasAttribute("data-paged-tabindex")) {
            element.setAttribute(
              "data-paged-tabindex",
              element.getAttribute("tabindex") ?? "",
            );
          }
          if (element.getAttribute("tabindex") !== "-1") {
            element.setAttribute("tabindex", "-1");
          }
        } else if (element.hasAttribute("data-paged-tabindex")) {
          const previous = element.getAttribute("data-paged-tabindex");
          if (previous) element.setAttribute("tabindex", previous);
          else element.removeAttribute("tabindex");
          element.removeAttribute("data-paged-tabindex");
        }
      }
    });
  }, []);

  useLayoutEffect(syncOffPageColumns);

  /** Whether the panel is withholding this column, from the read above. */
  const isColumnOffPage = (col: number) => (offPageColumns & (1 << col)) !== 0;

  // The state above, applied to the one thing that draws it.
  //
  // A layout effect, because it must commit before the browser paints, and
  // re-run whenever the viewport is resized: crossing `sm` in either direction
  // changes the box from a scroll container to a plain row and back, and a
  // `scrollLeft` set while it was one is silently dropped when it stops being
  // one. Reading the columns' own boxes rather than multiplying a page width by
  // an index keeps the gap between them out of the arithmetic.
  //
  // The tab-order rule above rides the same observer, because it reads the same
  // breakpoint off the same box. Left on renders alone it went stale on a
  // rotation: paged to Exit and then turned landscape, every focusable in Entry
  // kept `tabindex="-1"` at a width drawing both columns, and the reverse
  // crossing left the peeking column tabbable - which is the state this rule
  // exists to prevent.
  useLayoutEffect(() => {
    const viewport = columnsViewportRef.current;
    if (!viewport) return;

    const showColumn = () => {
      const target = viewport.children[visibleColumn];
      if (!target) return;
      const offset =
        target.getBoundingClientRect().left -
        viewport.getBoundingClientRect().left;
      // `scrollLeft` and not `scrollIntoView`: this box is the only thing that
      // may move. `scrollIntoView` walks up the ancestors too, so it would drag
      // the panel's vertical scroller - and the page under it - to wherever the
      // column happened to be, in answer to a press about columns.
      if (offset !== 0) viewport.scrollLeft += offset;
    };

    const syncToViewport = () => {
      showColumn();
      syncOffPageColumns();
    };

    syncToViewport();
    const observer = new ResizeObserver(syncToViewport);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [visibleColumn, syncOffPageColumns]);

  /**
   * The pager was pressed.
   *
   * **Carrying nothing**, this is a view change and nothing else: the viewport
   * moves to the column named, and nothing is announced, because
   * `gridAnnouncements` speaks about a BLOCK and no block was touched.
   *
   * **Carrying a block**, it is `moveTarget`, the same action the Left and
   * Right arrow keys dispatch: one mechanism for moving between columns, so the
   * sentence the user hears and the cells a carry may reach are the ones that
   * were already there. The viewport follows the target through the effect
   * above, so a step the carry refuses ("no target that way") leaves the pager
   * where it is and says why, exactly as the arrow key does.
   *
   * **The press naming the column the carry is ALREADY on is silent**, and it
   * is the one case `moveTarget` cannot answer for. `moveTarget` is reused
   * precisely so the pager and the arrow keys cannot drift, but a zero delta is
   * the one press that has no arrow-key equivalent: there is no key meaning
   * "stay put", so `stepTarget` returns the target unchanged, the reducer
   * returns the identical state, and `moveTarget` reports `noTargetThatWay` -
   * announcing a refusal for a press that asked for nothing. The two branches
   * have to say the same thing for the same press, and the non-carrying branch
   * is already silent for it, so this one is too. It reaches exactly the users
   * the named pair was chosen for: a voice-control user saying the name of the
   * column they are already on, and a screen-reader user activating the button
   * without first reading `aria-pressed`.
   *
   * **It says nothing about focus, and must never be given anything to say.**
   * Nothing in this panel moves DOM focus in answer to paging; `ColumnPager`
   * carries the whole of why that is safe, and why a hand-off here is the
   * wrong answer.
   */
  const handleShowColumn = (col: number) => {
    if (command.carrying) {
      if (col === command.carrying.target.col) return;
      command.moveTarget(col - command.carrying.target.col, 0);
      return;
    }
    setVisibleColumn(col);
  };

  // Activating a cell in the column the pager is not showing brings that
  // column into view first.
  //
  // Only assistive technology can reach this. `offPageColumn` withholds the
  // peeking column from hit testing, so no pointer press lands there, and the
  // tab-order rule keeps the keyboard out - but `pointer-events` does not stop
  // a DISPATCHED click, and a peeking cell is an ordinary element with an
  // `onClick`, so AT activation reaches this handler. That exposure is
  // deliberate and accepted (see AGENTS.md): the column is drawn, and hiding it
  // from AT users alone would give them less than sighted users get.
  //
  // What is NOT accepted is where it used to lead. The activation placed the
  // order into the column the panel was not showing, leaving the user looking
  // at the other one with no way back to what they had just done - a stranding,
  // and the same shape as the two traps this layout has already closed: the
  // peek band that DELETED a free-dragged block, and the sliver that drew a
  // valid-target highlight at cells the release then refused. Each time the
  // answer was to make the behaviour match what the app appears to offer,
  // rather than to write the mismatch down.
  //
  // Showing the column is therefore part of the activation rather than a
  // reaction to it, and it goes through `visibleColumn` - the one owner of
  // which column is on screen, which the pager and the carry-target effect
  // already write - rather than a second path beside it. Above `sm` nothing is
  // withheld, so `isColumnWithheld` is false for every cell and this is exactly
  // `activateCell`.
  const isColumnWithheld = (col: number) => {
    const columnElement = columnsViewportRef.current?.children[col];
    return (
      columnElement instanceof HTMLElement &&
      getComputedStyle(columnElement).pointerEvents === "none"
    );
  };

  const activateCellInView = (cell: CellPosition) => {
    if (isColumnWithheld(cell.col)) setVisibleColumn(cell.col);
    command.activateCell(cell);
  };

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

  /**
   * The cell a release at (`x`, `y`) lands in, for every drag in this
   * component: the palette drag that creates an order, the free drag of a
   * placed block, and the hover highlight that has to agree with both.
   *
   * The block's own 40px tile is what is hit-tested, not the pointer's single
   * pixel - see `utils/dropTarget.ts` for the rule and for the dead band around
   * every cell that testing the pointer alone left behind.
   *
   * **The candidates are THIS grid's cells, and the viewport is what says so.**
   * `columnsViewportRef` is already the owner of which columns exist and which
   * of them the panel is withholding; handing it to the resolver makes it the
   * owner of which cells a release may land in as well, rather than leaving
   * that to a document-wide query any `[data-col][data-row]` element could
   * join. `ReadOnlyGridCell` carries both attributes, so above `lg` - where
   * both panels are on screen - a release over the Active Orders panel used to
   * resolve to a cell and place the order into the assembly cell of the same
   * coordinates.
   *
   * **No viewport, no candidates.** Until the first render has committed the
   * ref is empty and no cell is drawn, so there is nothing a release could have
   * been over; `offGrid` is what the resolver answers for a grid holding no
   * cells anyway, and saying it here keeps the fallback from being a second,
   * document-wide answer.
   */
  const dropAt = (x: number, y: number): DropResolution => {
    const gridRoot = columnsViewportRef.current;
    if (!gridRoot) return { kind: "offGrid" };
    return resolveDrop(x, y, BLOCK_HEIGHT, gridRoot);
  };

  /**
   * What the grid did about a release over a cell it is not showing: nothing.
   *
   * A `PlacementResult` like the ones `placeProviderInCell` and
   * `keepBlockInItsCell` return, because the announcer may only be told what
   * the grid did - and this one is the grid declining to be asked. It mutates
   * nothing, so it is a value rather than a function.
   *
   * There is no second helper collapsing `withheld` into "no cell": that
   * collapse is what told a user their release was outside the grid while they
   * watched it land on a drawn column, and both drag paths now read
   * `resolveDrop`'s three-way answer directly so a third cannot inherit it.
   */
  const COLUMN_NOT_SHOWN: PlacementResult = {
    status: "refused",
    reason: "columnNotShown",
  };

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
    const drop = dropAt(x, y);
    const source = providerSource(type);

    const releasedCarry = carryReleasedByDragRef.current;

    // A release over a WITHHELD cell is a release over a cell, exactly as it is
    // on the placed-block path: the peeking column is drawn, so the user aimed
    // at something they can see. Nothing is created there - the exclusion is
    // unchanged - but "Released outside the grid" is a false account of a
    // release inside the panel, and the two drag paths may not give different
    // readings of one geometry.
    if (drop.kind !== "offGrid") {
      announcer.report({
        kind: "placement",
        source,
        cell: drop.cell,
        result:
          drop.kind === "available"
            ? placeProviderInCell(type, drop.cell)
            : COLUMN_NOT_SHOWN,
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
   * `offsetForOrder` is the mapping owner's, so no gesture can write a position
   * the axis could not have drawn - which is what made a price of zero
   * reachable.
   *
   * `offsetForOrder` rather than `clampOffset`, because this is a WRITE. The
   * range half is the same in both; the difference is that a non-finite value
   * is passed through instead of being answered with zero, which is the market
   * price and a perfectly plausible order. Clamping on write here was the last
   * place in the app that turned a corrupt position into a submittable one, and
   * it took only one arrow press to do it. Display still clamps at render, so
   * nothing draws `NaN%`.
   */
  const setBlockPosition = (id: string, yPosition: number) => {
    // The note tells a priced block's user to change its price with the arrow
    // keys, and this is that price changing. A message that survives the action
    // it asked for reads as though the action failed.
    setRefusedMove(null);
    const clamped = offsetForOrder(yPosition);
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

    // Rooted at the grid's own viewport for the same reason `dropAt` is: these
    // attributes say where a cell sits in ITS grid and not which grid that is,
    // so a document-wide lookup is one mounted second grid away from measuring
    // a track this component never drew.
    const gridRoot = columnsViewportRef.current;
    if (!gridRoot) return;

    const cellSelector = `[data-col="${col}"][data-row="${row}"]`;
    // Keyed by the block's LEG, which is the same key the cell drew the column
    // under. It used to be keyed by `blockData.axis`, and that was one answer
    // to axis membership sitting beside the renderer's other one: a block whose
    // saved `axis` disagreed with its `axes` measured a track it was not drawn
    // in, and every drag on it jumped. The fallback stays for the cell that
    // draws a single column.
    const leg = legOfBlock(blockData);
    const trackElement =
      gridRoot.querySelector(
        `${cellSelector} [data-axis-track="${col}-${row}-${leg}"]`,
      ) ?? gridRoot.querySelector(`${cellSelector} [data-axis-track]`);
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
   *
   * A block whose stored position is not a finite number is left exactly as it
   * is. There is no position to nudge from - `NaN + 1` is `NaN`, and it walks
   * straight through `Math.max`/`Math.min` and through the no-op guard below,
   * which is false for `NaN` against itself - so the only thing an arrow press
   * could do is invent a position the user never chose. Inventing one is the
   * guessing this whole mapping exists to prevent, and it is worse than doing
   * nothing: the invented value is finite, so it sails past `validateOrder` and
   * the corrupt order is submitted at the market price instead of refused.
   */
  const handleBlockAdjustPrice = (id: string, delta: number) => {
    const blockInfo = findBlockInGrid(grid, id);
    if (!blockInfo) return;
    if (!Number.isFinite(blockInfo.block.yPosition)) return;

    // Before the no-op guard below: an arrow press at the end of the axis moves
    // nothing, and leaving the note up would say the key did not work.
    setRefusedMove(null);

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
    const drop = dropAt(x, y);

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
    // **A release over a WITHHELD cell is a release over a cell.** The peeking
    // column is drawn, so a release in the 20% of it that shows is a release
    // the user aimed at a cell they can see; reading it as "clear of every
    // cell" was the false step, and it cost the block - the branch below
    // REMOVES, so a Market order dragged into the sliver was destroyed with no
    // undo. Nothing about the drop exclusion changes: `resolveDrop` still
    // refuses to place there, and this refuses with the very same primitive and
    // the very same sentence a release over any other cell gets.
    if (drop.kind !== "offGrid") {
      const result = keepBlockInItsCell(id, drop.cell);
      // Only a free drag reaches here, and `block.tsx` wires one for a cell
      // that draws no axis, so this refusal is always the removable case.
      if (result.status === "refused") {
        setRefusedMove({
          id: blockInfo.block.id,
          at: { col: blockInfo.col, row: blockInfo.row },
          label: blockInfo.block.label,
          reason: "staysInCell",
        });
      }
      announcer.report({
        kind: "placement",
        source,
        cell: drop.cell,
        result,
        via: "drag",
        releasedCarry,
      });
    } else {
      // Dropped clear of every cell - remove only this block, through the
      // command model's block-level removal rather than a branch of its own. It
      // is no longer the ONLY way an order leaves a cell: Delete and Backspace
      // reach the same operation, and the cell's clear control empties the cell
      // outright, which is what finally makes decision D9's correction path -
      // remove it, then place a new one - available to a block drawn on a price
      // axis.
      command.removeBlock(id, { releasedCarry });
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
  //
  // Through `dropAt`, the same resolver the release uses. The highlight is the
  // only warning a user gets before letting go, so it has to name the cell the
  // drop will actually place into; a highlight computed one way and a drop the
  // other is the shape of defect this repository keeps paying for. Only
  // `available` highlights, because it is the only answer a release may place
  // on - a withheld cell is refused rather than offered.
  const handlePointerMove = (e: PointerEvent) => {
    if (draggingId !== null || draggingFromProvider !== null) {
      const drop = dropAt(e.clientX, e.clientY);
      setHoverCell(drop.kind === "available" ? drop.cell : null);
    }
  };

  // ─── Computed values for rendering ───────────────────────────────

  const activeAllowedRows = getActiveAllowedRows();
  // A placed block being dragged offers no targets at all, so nothing is drawn
  // as one. `draggingFromProvider` is what makes a drag show targets now.
  const showValidTargets =
    draggingFromProvider !== null || hoveredProviderId !== null;

  // **A cell the panel is not showing never draws itself as a target.** The
  // valid-target treatment is the strongest affordance this app has - an accent
  // border, a ring, the pattern and the breathing animation - and drawing the
  // peek made it visible in a column every release is refused in: at 320 that
  // is 38px of each Exit cell breathing "drop here" at a cell `resolveDrop`
  // classifies as `withheld`. A highlight computed one way and a drop the other
  // is the defect `dropTarget.ts` exists to prevent, so both take the same
  // answer: the computed `pointer-events` read above, not a second notion of
  // which column is on screen. Above `sm` nothing is withheld, so this costs
  // the desktop layout nothing.
  const isValidTarget = (colIndex: number, rowIndex: number): boolean => {
    if (isColumnOffPage(colIndex)) return false;
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
        price axis the arrow keys move it along that axis, and Delete or
        Backspace removes that one block. Each cell that holds an order also
        has a clear button, which empties the whole cell in one press.
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

        {/* The control that moves the user to the other column, and the answer
            to a panel too narrow to draw both. `sm:hidden`, so above `sm` it is
            not a flex item of the row at all. */}
        <ColumnPager
          visibleColumn={visibleColumn}
          isCarrying={command.carrying !== null}
          onShowColumn={handleShowColumn}
        />

        {/* Grid Columns */}
        <div ref={columnsViewportRef} className={columnsWrapper}>
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
              <div
                key={colIndex}
                className={cn(
                  column,
                  pagedColumn,
                  colIndex !== visibleColumn && offPageColumn,
                )}
              >
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
                    onBlockRemove={command.removeBlock}
                    onCellClear={() =>
                      command.clearCell({ col: colIndex, row: rowIndex })
                    }
                    onCellActivate={() =>
                      activateCellInView({ col: colIndex, row: rowIndex })
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
        //
        // Both refusals end in the same correction, because both blocks have
        // it: Delete on the block takes that one order off the grid whichever
        // drag hook its cell wired. Only the extra clause differs, and it is
        // the affordance that render really wires - the arrow keys exist for a
        // block on a price axis and for no other.
        //
        // The last sentence names BOTH removals and says what each one takes,
        // because they are not the same operation and offering them as
        // alternatives would be a trap: the cell's clear button empties the
        // whole cell, which in a bulk cell is orders this note is not about.
        <p className={cellLockedNote}>
          <strong>{refusedMove.label}</strong> stays in the cell it was placed
          in. Orders do not move between cells -{" "}
          {refusedMove.reason === "onPriceAxis"
            ? "use the arrow keys to change this one's price, or remove it and place a new one."
            : "to put this one somewhere else, remove it and place a new one."}{" "}
          Press Delete while it has focus to remove this order, or use the
          cell's clear button to empty the whole cell.
        </p>
      )}
      <LiveAnnouncer announcement={announcer.announcement} />
    </div>
  );
};

export default GridArea;
