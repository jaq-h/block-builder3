import { useReducer, useRef, useState } from "react";
import type {
  CellPosition,
  GridData,
  StrategyPattern,
} from "../types/grid";
import type { OrderTypeDefinition } from "../data/orderTypes";
import {
  commandReducer,
  describeCell,
  describeSource,
  hasDualAxisPartner,
  IDLE_COMMAND_STATE,
  initialTarget,
  samePosition,
  validTargetsFor,
  withOriginCell,
  type CarriedBlock,
  type CommandSource,
} from "../utils/blockCommand";
import { findBlockInGrid } from "../utils/grid";
import { useAnnouncer, type Announcement } from "./useAnnouncer";

// =============================================================================
// USE BLOCK COMMAND - the DOM-facing half of the select-then-place model
// =============================================================================
//
// The transitions themselves are pure and live in `utils/blockCommand.ts`.
// This hook adds the two things a real interaction needs and a reducer cannot
// provide: the announcement a screen-reader user hears at each step, and the
// element focus has to land on afterwards.

/**
 * Which affordance activated a block. They diverge in exactly one place: Enter
 * on a carried block places it, because the keyboard has Escape to cancel with;
 * a second tap on it puts it back down, because a finger does not.
 */
export type ActivationOrigin = "keyboard" | "pointer";

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
  /** Commit a new block from the palette; returns the block id to focus. */
  placeProvider: (type: string, cell: CellPosition) => string | null;
  /** Commit a move of an existing block; returns the block id to focus. */
  moveBlock: (id: string, cell: CellPosition) => string | null;
}

export interface UseBlockCommandReturn {
  carrying: CarriedBlock | null;
  /** True when this palette entry or grid block is the one being carried. */
  isCarrying: (key: string) => boolean;
  /** Enter, Space or a tap on a palette entry. */
  activateProvider: (type: string, origin: ActivationOrigin) => void;
  /** Enter, Space or a tap on a placed block. */
  activateBlock: (id: string, origin: ActivationOrigin) => void;
  /** A tap on a cell while carrying. */
  activateCell: (cell: CellPosition) => void;
  moveTarget: (dCol: number, dRow: number) => void;
  place: () => void;
  cancel: (options?: CancelOptions) => void;
  announce: (text: string) => void;
  announcement: Announcement;
  /** The block id that should take focus, once React has rendered it. */
  focusRequest: string | null;
  clearFocusRequest: () => void;
}

const CARRY_HELP: Record<ActivationOrigin, string> = {
  keyboard: "Use the arrow keys to choose a cell, Enter to place, Escape to cancel.",
  pointer: "Tap a highlighted cell to place it, or tap the block again to put it back.",
};

export const useBlockCommand = ({
  grid,
  strategyPattern,
  providerBlocks,
  placeProvider,
  moveBlock,
}: UseBlockCommandOptions): UseBlockCommandReturn => {
  const [state, dispatch] = useReducer(commandReducer, IDLE_COMMAND_STATE);
  const [focusRequest, setFocusRequest] = useState<string | null>(null);
  const { announcement, announce } = useAnnouncer();

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
      announce(
        `${describeSource(source)} cannot be placed anywhere in the grid right now.`,
      );
      return false;
    }
    dispatch({ type: "pickUp", source, targets, preferred });
    // The same choice the reducer makes, so the announcement can never name a
    // cell other than the one that is actually the target.
    const target = initialTarget(targets, preferred) ?? targets[0];
    announce(
      `Picked up ${describeSource(source)}. ${CARRY_HELP[origin]} Target: ${describeCell(target, strategyPattern)}.`,
    );
    return true;
  };

  const commit = (block: CarriedBlock, cell: CellPosition) => {
    pointerPickUpRef.current = false;
    const placedId =
      block.source.kind === "provider"
        ? placeProvider(block.source.type, cell)
        : moveBlock(block.source.id, cell);

    // `null` is how the grid refuses a placement, and it can disagree with the
    // targets snapshotted at pick-up time - the grid may have been emptied or
    // filled since. Saying "Placed" then would be a lie to the one user who has
    // nothing but the announcement to go on.
    if (placedId === null) {
      dispatch({ type: "cancel" });
      setFocusRequest(sourceKey(block.source));
      announce(
        `${describeCell(cell, strategyPattern)} cannot take this order any more. ${describeSource(block.source)} was not placed.`,
      );
      return;
    }

    dispatch({ type: "place" });
    setFocusRequest(placedId);
    announce(
      `Placed ${describeSource(block.source)} in ${describeCell(cell, strategyPattern)}.`,
    );
  };

  const cancel = ({ restoreFocus = true }: CancelOptions = {}) => {
    pointerPickUpRef.current = false;
    if (!carrying) return;
    dispatch({ type: "cancel" });
    if (restoreFocus) setFocusRequest(sourceKey(carrying.source));
    announce(
      carrying.source.kind === "provider"
        ? `Cancelled. ${describeSource(carrying.source)} returned to the palette.`
        : `Cancelled. ${describeSource(carrying.source)} left in ${describeCell(carrying.source.origin, strategyPattern)}.`,
    );
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

    // One leg of a dual-axis order cannot travel on its own: it would leave its
    // partner behind and the two halves would be submitted as two orders on
    // opposite sides. Refusing silently would make Enter look broken, so say
    // what the block can still do instead.
    if (hasDualAxisPartner(grid[cell.col][cell.row], found.block)) {
      announce(
        `${found.block.label} cannot be moved on its own: its trigger and limit must stay in the same cell. Use the arrow keys to move it along the price axis.`,
      );
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
    if (!carrying) return;
    const isValid = carrying.targets.some((target) =>
      samePosition(target, cell),
    );
    if (!isValid) {
      announce(
        `${describeCell(cell, strategyPattern)} cannot take this order.`,
      );
      return;
    }
    commit(carrying, cell);
  };

  const moveTarget = (dCol: number, dRow: number) => {
    if (!carrying) return;
    const next = commandReducer(state, { type: "moveTarget", dCol, dRow });
    if (next === state) {
      announce("No cell available in that direction.");
      return;
    }
    dispatch({ type: "moveTarget", dCol, dRow });
    announce(
      `${describeCell(next.carrying!.target, strategyPattern)}, ready to place.`,
    );
  };

  const place = () => {
    if (!carrying) return;
    commit(carrying, carrying.target);
  };

  return {
    carrying,
    isCarrying,
    activateProvider,
    activateBlock,
    activateCell,
    moveTarget,
    place,
    cancel,
    announce,
    announcement,
    focusRequest,
    clearFocusRequest: () => setFocusRequest(null),
  };
};
