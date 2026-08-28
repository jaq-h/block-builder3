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
  validTargetsFor,
  type ActivationOrigin,
  type CarriedBlock,
  type ProviderSource,
} from "../utils/blockCommand";
import { findBlockInGrid } from "../utils/grid";
import { cellDrawsPriceAxis } from "../utils/blockMapping";
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

export interface UseBlockCommandOptions {
  grid: GridData;
  strategyPattern: StrategyPattern;
  providerBlocks: OrderTypeDefinition[];
  /** The one voice of the grid; see `useGridAnnouncer`. */
  announcer: GridAnnouncer;
  /** Commit a new block from the palette, and report what the grid did. */
  placeProvider: (type: string, cell: CellPosition) => PlacementResult;
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
    moveTarget,
    pointToTarget,
    cancel,
    releaseForDrag,
    focusRequest,
    clearFocusRequest: () => setFocusRequest(null),
  };
};
