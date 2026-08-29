import { useEffect, useReducer, useRef, useState } from "react";
import type {
  BlockData,
  CellPosition,
  GridData,
  PlacementResult,
  StrategyPattern,
} from "../types/grid";
import type { OrderTypeDefinition } from "../data/orderTypes";
import {
  commandReducer,
  IDLE_COMMAND_STATE,
  initialTarget,
  samePosition,
  sameTargets,
  validTargetsFor,
  type ActivationOrigin,
  type CarriedBlock,
  type GridSource,
  type ProviderSource,
} from "../utils/blockCommand";
import { findBlockInGrid } from "../utils/grid";
import { cellDrawsPriceAxis, legInCell } from "../utils/blockMapping";
import type { PickUpRefusal } from "../utils/gridAnnouncements";
import { holdBlockInHand } from "./blockInHand";
import type { GridAnnouncer } from "./useGridAnnouncer";

// =============================================================================
// USE BLOCK COMMAND - the DOM-facing half of the select-then-place model
// =============================================================================
//
// The transitions themselves are pure and live in `utils/blockCommand.ts`.
// This hook adds the two things a real interaction needs and a reducer cannot
// provide: the outcome a screen-reader user hears at each step, and the element
// focus has to land on afterwards.
//
// It reports outcomes to the announcer it is given; it never composes a
// sentence. See `utils/gridAnnouncements.ts` for why that separation is the
// point rather than a formality.

export type { ActivationOrigin };

export interface CancelOptions {
  /**
   * Hand focus back to the block the carry started on. Tab must not: the
   * browser has already moved focus on by the time the request is honoured,
   * and restoring it would drag the user back to the block they just left.
   */
  restoreFocus?: boolean;
}

export interface RemoveOptions {
  /**
   * The gesture that reached this removal had already taken a carry of the same
   * subject out of the user's hand without saying so - see `releaseForDrag`.
   *
   * It is reported rather than acted on, because where such a clause belongs is
   * the announcer's decision and not a caller's. For a removal the answer is
   * "nowhere": the sentence already describes something happening to that very
   * block, so `describeOutcome` appends nothing, exactly as it appends nothing
   * to a placement. It travels anyway so the drag path can hand over what it
   * knows without having to know that.
   */
  releasedCarry?: boolean;
}

export interface UseBlockCommandOptions {
  grid: GridData;
  strategyPattern: StrategyPattern;
  providerBlocks: OrderTypeDefinition[];
  /** The one voice of the grid; see `useGridAnnouncer`. */
  announcer: GridAnnouncer;
  /** Commit a new block from the palette, and report what the grid did. */
  placeProvider: (type: string, cell: CellPosition) => PlacementResult;
  /**
   * Take one block off the grid, links to it included, and hand back the grid
   * that was written.
   *
   * The owner is handed an id and nothing else: it looks the block up itself,
   * so there is no cell travelling alongside the id for the two to disagree
   * about. See `removeBlockFromGrid` in `utils/grid.ts` for why the removal and
   * the link clearing are one function rather than two that agree.
   *
   * **It returns the grid because a removal is the one write this model makes
   * that also speaks.** The carry's fate is decided by one rule - does the grid
   * still stand behind the cells the carry offered - and everywhere else that
   * rule is applied a render later, on the grid this hook is handed next. Here
   * that is a render too late: the removal has already announced which block
   * went, and a second live-region write erases it before it is read. So the
   * owner returns what it wrote and the same rule runs in the same event, with
   * `gridStandsBehind` and `removeBlockFromGrid` each used once rather than
   * re-derived. There is no removal-shaped exception to the rule, and no second
   * transition: this is the rule, run early, on the one path that needs it.
   */
  removeFromGrid: (id: string) => GridData;
  /**
   * A placed block was activated, and it is not going anywhere.
   *
   * Decision D9: once a block is placed, its cell is where it lives - every
   * block, no carve-outs - so there is no `moveBlock` here any more and the
   * grid-block carry it existed for is gone with it. The owner is handed the
   * block and the reason rather than a sentence, because it has to do two
   * things with them: report the outcome to the announcer, and put the rule on
   * screen for everyone who is not listening to a live region.
   *
   * The block comes with the cell it is in, because the rule being refused is
   * about that pairing: the note says this order stays *here*, so it has to be
   * taken down when the block is no longer here - gone from the grid, or moved
   * to the other column by Reverse Blocks, which keeps every id. The id comes
   * with the label for the same reason a cell does: two orders can share a
   * label, and the note is about one of them. This model has already found the
   * block, so it hands the cell over rather than leaving the owner to look it
   * up again and keep a second null check in step.
   */
  refuseMove: (
    block: Pick<BlockData, "id" | "label">,
    at: CellPosition,
    reason: Exclude<PickUpRefusal, "noTargets">,
  ) => void;
}

export interface UseBlockCommandReturn {
  carrying: CarriedBlock | null;
  /** True when this palette entry or grid block is the one being carried. */
  isCarrying: (key: string) => boolean;
  /** Enter, Space or a tap on a palette entry. */
  activateProvider: (type: string, origin: ActivationOrigin) => void;
  /**
   * Enter, Space or a tap on a placed block. It is never picked up - a placed
   * block stays in its cell (decision D9) - so this only ever reports the
   * refusal, or places whatever palette order is already in hand.
   */
  activateBlock: (id: string, origin: ActivationOrigin) => void;
  /** A tap on a cell. Does nothing, silently, while nothing is carried. */
  activateCell: (cell: CellPosition) => void;
  /**
   * Take one placed block off the grid: Delete or Backspace on it, its own
   * remove control, or a free drag released clear of every cell.
   *
   * **The app's one removal.** It was previously a branch inside the free
   * drag's release handler, which is why it did not exist for most of the
   * grid: `block.tsx` wires the vertical price drag instead of the free drag
   * for every block a cell draws on a price axis, so a Limit, a Stop Loss or a
   * Take Profit could not be removed by any input method at all, and Clear All
   * - which destroys the whole strategy - was the only way out. Decision D9
   * names delete-and-rebuild as *the* way to correct a misplaced order, so the
   * removal has to be an operation of the command model rather than one
   * gesture's side effect.
   */
  removeBlock: (id: string, options?: RemoveOptions) => void;
  moveTarget: (dCol: number, dRow: number) => void;
  /**
   * The cursor is over this cell, so it is the cell a click would place into.
   *
   * Silent by design, and that is a decision rather than an omission. It fires
   * on every cell a mouse crosses, so announcing it would be a live region
   * talking over itself for the length of one sweep across the grid - and the
   * user it fires for is watching the cursor, which is the feedback. What a
   * screen-reader user hears is unchanged: the arrow keys still report every
   * target they reach, through `moveTarget`.
   */
  pointToTarget: (cell: CellPosition) => void;
  /** Escape, Tab, or a second tap: the user put the block back. */
  cancel: (options?: CancelOptions) => void;
  /**
   * A pointer drag has been recognised on `subjectKey` - a block id, or a
   * palette order type - so it takes the interaction over from the carry.
   *
   * Returns true when it released a carry of that *same* subject without
   * saying so. The caller owes that user a mention of it on the outcome the
   * drag eventually reaches; see `releaseForDrag` for why it cannot be said
   * here.
   */
  releaseForDrag: (subjectKey: string) => boolean;
  /** The block id that should take focus, once React has rendered it. */
  focusRequest: string | null;
  clearFocusRequest: () => void;
}

export const useBlockCommand = ({
  grid,
  strategyPattern,
  providerBlocks,
  announcer,
  placeProvider,
  removeFromGrid,
  refuseMove,
}: UseBlockCommandOptions): UseBlockCommandReturn => {
  const [state, dispatch] = useReducer(commandReducer, IDLE_COMMAND_STATE);
  const [focusRequest, setFocusRequest] = useState<string | null>(null);
  const { report } = announcer;

  const carrying = state.carrying;

  // Only a palette order is ever carried, so the key is always an order type.
  const isCarrying = (key: string): boolean =>
    carrying?.source.type === key;

  /** True when the block was actually picked up, false when it was refused. */
  const pickUp = (
    source: ProviderSource,
    allowedRows: number[],
    origin: ActivationOrigin,
  ): boolean => {
    const targets = validTargetsFor(allowedRows, grid, strategyPattern);
    if (targets.length === 0) {
      // Nothing was dispatched, so a carry this pick-up was trying to swap out
      // is still live - and the refusal is the only place that can say so.
      report({
        kind: "pickUpRefused",
        source,
        reason: "noTargets",
        carrying: carrying?.source,
      });
      return false;
    }
    dispatch({ type: "pickUp", source, targets, origin });
    // The same choice the reducer makes, so the announcement can never name a
    // cell other than the one that is actually the target.
    const target = initialTarget(targets) ?? targets[0];
    report({ kind: "pickedUp", source, target, origin });
    return true;
  };

  const commit = (block: CarriedBlock, cell: CellPosition) => {
    // Only a palette order is ever carried, so this is the only commit there
    // is. A placed block never leaves its cell (decision D9), which
    // `CarriedBlock.source` states in the type rather than in a comment.
    const result = placeProvider(block.source.type, cell);

    // The grid can disagree with the targets snapshotted at pick-up time - it
    // may have been emptied or filled since - so what is said comes from what
    // the grid did, never from what this call was hoping for.
    switch (result.status) {
      // The block the carry named is no longer on the grid. The carry ends the
      // same way a refusal ends it, but focus is left where it is: a request
      // naming a block that does not exist is never honoured, and sits waiting
      // for some later block to answer it.
      case "gone":
        dispatch({ type: "cancel" });
        break;
      case "refused":
        dispatch({ type: "cancel" });
        setFocusRequest(block.source.type);
        break;
      default:
        dispatch({ type: "place" });
        setFocusRequest(result.blockId);
    }
    // Every branch above ends the carry, so this path always has to say so -
    // and where that clause belongs is the announcer's decision, not this
    // caller's. It appends it only to the sentences that do not already
    // describe something happening to the block.
    report({
      kind: "placement",
      source: block.source,
      cell,
      result,
      via: "carry",
      releasedCarry: true,
    });
  };

  /**
   * Does this grid still stand behind the cells that carry offered?
   *
   * The one statement of the rule, and the only thing that decides a carry's
   * fate. `validTargetsFor` is the same function `pickUp` built the promise
   * with, so this compares an offer with an offer rather than adding a second
   * opinion about what a legal cell is. A palette that no longer lists the
   * carried order type stands behind nothing: there is no order left to place.
   */
  const gridStandsBehind = (carry: CarriedBlock, against: GridData): boolean => {
    const provider = providerBlocks.find(
      (entry) => entry.type === carry.source.type,
    );
    if (!provider) return false;
    return sameTargets(
      validTargetsFor(provider.allowedRows, against, strategyPattern),
      carry.targets,
    );
  };

  /**
   * The grid this carry was offered against has been replaced beneath it, so
   * the carry ends.
   *
   * **This is the one owner of that transition.** Clear All, Reverse Blocks, a
   * pattern switch and a removal all rewrite what the grid holds, and none of
   * them is where the decision belongs: three callers remembering to end a
   * carry is three chances to forget, and the fourth path is always the one
   * that does. So no caller is asked to call this at all - the check below
   * notices, from the grid this model is handed.
   *
   * Focus is not handed back, for the same reason the dismissal hatch does not:
   * the user has just pressed a control somewhere else, and pulling them back
   * to the palette entry they left would be the interface taking the keyboard
   * off them mid-task.
   */
  const endCarryOnGridChange = () => {
    if (!carrying) return;
    dispatch({ type: "gridReplaced" });
    report({
      kind: "carryEnded",
      source: carrying.source,
      reason: "gridReplaced",
    });
  };

  /**
   * Remove one placed block, and put focus somewhere that still exists.
   *
   * Focus goes to the palette entry the order came from, which is the same
   * place a cancelled carry hands it back to. Two reasons, and the first is not
   * optional: the element that was focused is the block being removed, so
   * leaving focus alone drops it to `<body>` and the next Tab restarts at the
   * top of the document. The second is that decision D9 makes removal half of a
   * correction - remove it, then place a new one - and the palette entry is
   * where the other half starts, so the keyboard lands ready for it.
   *
   * A block the grid does not hold is not reported at all. A grid can be
   * replaced under a gesture - Clear All, Reverse Blocks, a strategy load - and
   * a sentence about a block that is not there names a cell the grid has not
   * confirmed, which is the one thing `gridAnnouncements` refuses to do.
   */
  const removeBlock = (
    id: string,
    { releasedCarry = false }: RemoveOptions = {},
  ) => {
    const found = findBlockInGrid(grid, id);
    if (!found) return;

    const source: GridSource = {
      kind: "grid",
      id: found.block.id,
      label: found.block.label,
      origin: { col: found.col, row: found.row },
    };

    // Which leg of its order type this was, if its cell drew it on a price
    // axis at all. A dual-axis order type puts two blocks in one cell under one
    // label, so the sentence needs it to name the one that went - and this is
    // the block's own cell, asked of `legInCell`, the one owner of that
    // question and the same one that named the control the user just pressed.
    const leg = legInCell(grid[found.col][found.row], found.block);

    // One press, one message. A removal can take cells away from a carry in the
    // user's other hand - conditional validity is diagonal adjacency to an
    // OCCUPIED cell, so removing a block deletes its diagonals and the cell it
    // frees is the smaller half - and both of those are this one press.
    // Reported separately, the second live-region write erases the first:
    // `LiveAnnouncer` alternates regions and clears the one it is leaving, and
    // both are assertive. For a removal the sentence lost is the only one
    // naming which block went, and there is no undo.
    //
    // So the rule runs here, in the same event, on the grid the owner just
    // wrote. **This is not a removal-shaped exception to it.** It is the same
    // `gridStandsBehind` the check below applies, asked one render earlier
    // because this is the one write that also speaks - so a removal that leaves
    // the same cells on offer, which is every removal in the bulk pattern and
    // any that only empties a cell somebody else's diagonals already covered,
    // still leaves the carry exactly where it was.
    announcer.asOneEvent(() => {
      const written = removeFromGrid(id);
      // Only when the palette really offers that order type. A focus request
      // naming nothing on screen is never honoured and sits waiting for
      // whatever block happens to answer it next.
      if (providerBlocks.some((entry) => entry.type === found.block.orderType)) {
        setFocusRequest(found.block.orderType);
      }
      report({ kind: "removed", source, leg, releasedCarry });
      if (carrying && !gridStandsBehind(carrying, written)) {
        endCarryOnGridChange();
      }
    });
  };

  const cancel = ({ restoreFocus = true }: CancelOptions = {}) => {
    if (!carrying) return;
    dispatch({ type: "cancel" });
    if (restoreFocus) setFocusRequest(carrying.source.type);
    report({
      kind: "carryEnded",
      source: carrying.source,
      reason: "cancelled",
    });
  };

  /**
   * A real drag takes over from whatever the command model was carrying:
   * leaving the carry live would let the click the browser appends to the drag
   * place the carried block in a cell the user never chose. Focus is not handed
   * back - pointer-down has already moved it to the block under the pointer.
   *
   * Whether that release is spoken turns on one question, and it is the whole
   * reason this is not just `cancel()`: **is the drag about the block being
   * carried?**
   *
   * - Same subject, so the drag will move, place or remove the very block a
   *   cancellation would name as resting somewhere. Saying anything now would
   *   be true for a moment and then false. So nothing is said *now*, and `true`
   *   is returned instead: the caller folds "no longer picked up" into the one
   *   sentence the drag's own outcome produces, where it is settled fact.
   * - Different subject - a vertical price drag on another block, a palette
   *   drag while holding a grid block - and the drag's outcome says nothing
   *   about the carry at all. Staying silent there loses the carry with no word
   *   said, and the next tap on a cell then does nothing the user can explain.
   */
  const releaseForDrag = (subjectKey: string): boolean => {
    if (!carrying) return false;
    const isSameSubject = isCarrying(subjectKey);
    dispatch({ type: "cancel" });
    if (isSameSubject) return true;
    report({
      kind: "carryEnded",
      source: carrying.source,
      reason: "superseded",
    });
    return false;
  };

  const activateProvider = (type: string, origin: ActivationOrigin) => {
    const provider = providerBlocks.find((entry) => entry.type === type);
    if (!provider) return;

    if (carrying && isCarrying(type)) {
      if (origin === "keyboard") commit(carrying, carrying.target);
      else cancel();
      return;
    }

    // Reaching for a different order type while holding one swaps what is
    // held, rather than doing nothing and looking broken.
    pickUp(
      { kind: "provider", type, label: provider.label },
      provider.allowedRows,
      origin,
    );
  };

  const activateBlock = (id: string, origin: ActivationOrigin) => {
    if (carrying) {
      // A block that is not the one being carried belongs to a cell, and the
      // cell decides - so the carried block lands there rather than swapping.
      // Nothing placed is ever carried, so `isCarrying` can only be true of a
      // palette entry, whose key is an order type rather than a block id.
      if (!isCarrying(id)) return;
      if (origin === "keyboard") commit(carrying, carrying.target);
      else cancel();
      return;
    }
    const found = findBlockInGrid(grid, id);
    if (!found) return;
    const cell = { col: found.col, row: found.row };

    // A placed block does not move between cells, by any input method
    // (decision D9). This model used to pick one up and walk it to another
    // cell, which is the capability that has gone; what is left is telling the
    // user so, because a press that silently does nothing is indistinguishable
    // from a broken control.
    //
    // Which refusal depends on whether this cell draws a price axis, and that
    // question has exactly one owner - `cellDrawsPriceAxis` - shared with the
    // renderer, so the arrow keys offered here are the arrow keys `Block`
    // actually wires. A cell with an axis has something else to offer; one
    // without has only "remove it and place a new one".
    refuseMove(
      found.block,
      cell,
      cellDrawsPriceAxis(grid[cell.col][cell.row])
        ? "onPriceAxis"
        : "staysInCell",
    );
  };

  const activateCell = (cell: CellPosition) => {
    // A click on the grid with nothing carried is not an interaction the user
    // started - it is a click on the page - so it says nothing.
    if (!carrying) return;
    const isValid = carrying.targets.some((target) =>
      samePosition(target, cell),
    );
    if (!isValid) {
      report({ kind: "cellRefused", source: carrying.source, cell });
      return;
    }
    commit(carrying, cell);
  };

  /**
   * Only for a carry the mouse started. A finger and a pen fire `mouseenter`
   * too - the browser synthesises one from the tap that placed the block - so
   * without this the target would jump to whatever cell the last tap landed on
   * and the announcement naming it would be stale. The keyboard is excluded for
   * the plainer reason that a stray mouse crossing the grid must not move a
   * target the user is stepping through with the arrow keys.
   */
  const pointToTarget = (cell: CellPosition) => {
    if (!carrying || carrying.origin !== "mouse") return;
    dispatch({ type: "pointAt", target: cell });
  };

  const moveTarget = (dCol: number, dRow: number) => {
    if (!carrying) return;
    const next = commandReducer(state, { type: "moveTarget", dCol, dRow });
    if (next === state) {
      report({ kind: "noTargetThatWay" });
      return;
    }
    dispatch({ type: "moveTarget", dCol, dRow });
    report({ kind: "targetChanged", target: next.carrying!.target });
  };

  // ─── The offer this carry makes, against the grid that is there ─────
  //
  // A carry is a promise about cells: these are the ones that will take this
  // order. `targets` is that promise as it stood at pick-up, and it is what the
  // grid draws as a highlight and reads out as `aria-current`. Every path that
  // rewrites the grid or switches the pattern can make it untrue, and until the
  // user tapped one of those cells nothing said so - the app went on inviting a
  // drop into a cell `placeProvider` was about to refuse. The refusal itself was
  // made honest by an earlier change; this is the half that stops the invitation
  // being issued at all.
  //
  // It is derived rather than signalled, and that is the whole point. A counter
  // the grid's owner bumps, or a call each of Clear All, Reverse Blocks and the
  // pattern switch makes, is a rule three call sites have to keep - and the
  // fourth path that replaces a grid is written by someone who has never read
  // this file. Asking the grid what it would offer *now* cannot be forgotten by
  // a path that does not exist yet, because there is nothing for it to remember.
  //
  // Cheap, deliberately: `gridStandsBehind` is `isCellValidForPlacement` over
  // six cells. It is the one statement of the rule, shared with the removal
  // above, which asks it a render earlier because it is the one grid write that
  // also speaks.
  const offerIsStale = carrying !== null && !gridStandsBehind(carrying, grid);

  // Through a ref, and written from an effect, for the reason the register's
  // release below is: the callback closes over this render's grid and carry,
  // and a ref written during render is one the next render cannot be trusted to
  // have seen. This effect is declared before the one that reads it, so the
  // reader always sees its own render's closure.
  const endCarryOnGridChangeRef = useRef(endCarryOnGridChange);
  useEffect(() => {
    endCarryOnGridChangeRef.current = endCarryOnGridChange;
  });

  useEffect(() => {
    if (!offerIsStale) return;
    endCarryOnGridChangeRef.current();
    // On the staleness itself, not on the grid: the grid is a new array on every
    // block placement and every price nudge, and re-running there would end a
    // carry the grid still stands behind. Ending it clears `carrying`, so the
    // next render is not stale and this settles in one pass.
  }, [offerIsStale]);

  // The carry's half of the shared register, so one call ends it and any live
  // pointer gesture together. The release goes through a ref rather than being
  // re-registered on every render: `cancel` is a fresh closure each time, and a
  // register entry that is replaced on every render is one more thing that has
  // to be right for the hatch to work at all.
  const cancelRef = useRef(cancel);
  // Written from an effect rather than during render, for the same reason
  // `usePointerGesture` refreshes its callbacks that way: a ref written during
  // render is a ref the next render cannot be trusted to have seen.
  useEffect(() => {
    cancelRef.current = cancel;
  });
  // On whether anything is carried, not on the carry itself: the carry is a
  // new object every time the target cell changes, and a mouse sweeping the
  // grid changes it on every cell it crosses.
  const holdingBlock = carrying !== null;
  useEffect(() => {
    if (!holdingBlock) return;
    // Focus is not handed back. Whatever emptied the register did so because
    // the user acted somewhere else, and pulling focus to the block they left
    // is the behaviour Tab already refuses for the same reason.
    return holdBlockInHand(() => cancelRef.current({ restoreFocus: false }));
  }, [holdingBlock]);

  return {
    carrying,
    isCarrying,
    activateProvider,
    activateBlock,
    activateCell,
    removeBlock,
    moveTarget,
    pointToTarget,
    cancel,
    releaseForDrag,
    focusRequest,
    clearFocusRequest: () => setFocusRequest(null),
  };
};
