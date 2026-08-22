import { useReducer, useRef, useState } from "react";
import type {
  CellPosition,
  GridData,
  PlacementResult,
  StrategyPattern,
} from "../types/grid";
import type { OrderTypeDefinition } from "../data/orderTypes";
import {
  commandReducer,
  hasDualAxisPartner,
  IDLE_COMMAND_STATE,
  initialTarget,
  samePosition,
  validTargetsFor,
  withOriginCell,
  type ActivationOrigin,
  type CarriedBlock,
  type CommandSource,
} from "../utils/blockCommand";
import { findBlockInGrid, getCellDisplayMode } from "../utils/grid";
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
  /** Commit a move of an existing block, and report what the grid did. */
  moveBlock: (id: string, cell: CellPosition) => PlacementResult;
}

export interface UseBlockCommandReturn {
  carrying: CarriedBlock | null;
  /** True when this palette entry or grid block is the one being carried. */
  isCarrying: (key: string) => boolean;
  /** Enter, Space or a tap on a palette entry. */
  activateProvider: (type: string, origin: ActivationOrigin) => void;
  /** Enter, Space or a tap on a placed block. */
  activateBlock: (id: string, origin: ActivationOrigin) => void;
  /** A tap on a cell. Does nothing, silently, while nothing is carried. */
  activateCell: (cell: CellPosition) => void;
  moveTarget: (dCol: number, dRow: number) => void;
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
  moveBlock,
}: UseBlockCommandOptions): UseBlockCommandReturn => {
  const [state, dispatch] = useReducer(commandReducer, IDLE_COMMAND_STATE);
  const [focusRequest, setFocusRequest] = useState<string | null>(null);
  const { report } = announcer;

  const carrying = state.carrying;

  // Set for the instant between a tap that picks a block up and the click the
  // browser appends to that same tap. See `activateBlock`.
  const pointerPickUpRef = useRef(false);

  const isCarrying = (key: string): boolean => {
    if (!carrying) return false;
    return carrying.source.kind === "provider"
      ? carrying.source.type === key
      : carrying.source.id === key;
  };

  /** The element focus returns to when a carry is cancelled. */
  const sourceKey = (source: CommandSource): string =>
    source.kind === "provider" ? source.type : source.id;

  /**
   * Where the grid says this block is, right now. `CommandSource.origin` is a
   * pick-up-time snapshot and the grid can be replaced under a live carry, so
   * every sentence that names a carried block's cell is composed from this
   * instead. `undefined` means the grid no longer holds the block at all.
   */
  const confirmedCell = (source: CommandSource): CellPosition | undefined => {
    if (source.kind !== "grid") return undefined;
    const found = findBlockInGrid(grid, source.id);
    return found ? { col: found.col, row: found.row } : undefined;
  };

  /** True when the block was actually picked up, false when it was refused. */
  const pickUp = (
    source: CommandSource,
    allowedRows: number[],
    preferred: CellPosition | null,
    origin: ActivationOrigin,
  ): boolean => {
    let targets = validTargetsFor(allowedRows, grid, strategyPattern);
    // A placed block can always go back where it came from.
    if (preferred) targets = withOriginCell(targets, preferred);
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
    dispatch({ type: "pickUp", source, targets, preferred });
    // The same choice the reducer makes, so the announcement can never name a
    // cell other than the one that is actually the target.
    const target = initialTarget(targets, preferred) ?? targets[0];
    report({ kind: "pickedUp", source, target, origin });
    return true;
  };

  const commit = (block: CarriedBlock, cell: CellPosition) => {
    pointerPickUpRef.current = false;
    const result =
      block.source.kind === "provider"
        ? placeProvider(block.source.type, cell)
        : moveBlock(block.source.id, cell);

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
        setFocusRequest(sourceKey(block.source));
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
    pointerPickUpRef.current = false;
    if (!carrying) return;
    dispatch({ type: "cancel" });
    if (restoreFocus) setFocusRequest(sourceKey(carrying.source));
    report({
      kind: "carryEnded",
      source: carrying.source,
      reason: "cancelled",
      at: confirmedCell(carrying.source),
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
    pointerPickUpRef.current = false;
    if (!carrying) return false;
    const isSameSubject = isCarrying(subjectKey);
    dispatch({ type: "cancel" });
    if (isSameSubject) return true;
    report({
      kind: "carryEnded",
      source: carrying.source,
      reason: "superseded",
      at: confirmedCell(carrying.source),
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
      null,
      origin,
    );
  };

  const activateBlock = (id: string, origin: ActivationOrigin) => {
    if (carrying) {
      // A block that is not the one being carried belongs to a cell, and the
      // cell decides - so the carried block lands there rather than swapping.
      if (!isCarrying(id)) return;
      if (origin === "keyboard") commit(carrying, carrying.target);
      else cancel();
      return;
    }
    const found = findBlockInGrid(grid, id);
    if (!found) return;
    const cell = { col: found.col, row: found.row };

    // A block drawn on a price axis does not move between cells at all. A mouse
    // cannot move one either - `Block` routes anything rendered on an axis to
    // the vertical drag, so the free drag never applies to it - and this model
    // gives the keyboard and a finger the same capability as the mouse, not a
    // larger one. The cell's display mode is what decides whether a block is
    // drawn on an axis, so it is what decides this too: a cell holding any
    // axis-less block draws *every* block in it without one.
    //
    // Refusing silently would make Enter look broken, so each refusal says what
    // the block can still do - and only what this render actually wires.
    const cellBlocks = grid[cell.col][cell.row];
    if (getCellDisplayMode(cellBlocks) !== "no-axis") {
      report({
        kind: "moveRefused",
        label: found.block.label,
        reason: "onPriceAxis",
      });
      return;
    }

    // No axis in this render, so the arrow keys are not wired and cannot be
    // offered. One leg of a dual-axis order still cannot travel on its own: it
    // would leave its partner behind and the two halves would be submitted as
    // two orders on opposite sides of the market.
    if (hasDualAxisPartner(cellBlocks, found.block)) {
      report({
        kind: "moveRefused",
        label: found.block.label,
        reason: "dualAxisPartner",
      });
      return;
    }

    const carried = pickUp(
      { kind: "grid", id, label: found.block.label, origin: cell },
      found.block.allowedRows,
      cell,
      origin,
    );

    // The browser appends a click to every tap, and it bubbles from the block
    // to the cell holding it - which, now that something is carried, is a live
    // placement target. Left alone it puts the block straight back down in the
    // cell it was just picked up from, so tap-to-pick-up on the grid would do
    // nothing at all. Only this branch consumes the tap: a tap on a block that
    // is *not* the carried one deliberately falls through to its cell.
    if (carried && origin === "pointer") pointerPickUpRef.current = true;
  };

  const activateCell = (cell: CellPosition) => {
    if (pointerPickUpRef.current) {
      pointerPickUpRef.current = false;
      return;
    }
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

  return {
    carrying,
    isCarrying,
    activateProvider,
    activateBlock,
    activateCell,
    moveTarget,
    cancel,
    releaseForDrag,
    focusRequest,
    clearFocusRequest: () => setFocusRequest(null),
  };
};
