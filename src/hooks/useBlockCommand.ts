import { useReducer, useState } from "react";
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
  IDLE_COMMAND_STATE,
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
  cancel: () => void;
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

  const isCarrying = (key: string): boolean => {
    if (!carrying) return false;
    return carrying.source.kind === "provider"
      ? carrying.source.type === key
      : carrying.source.id === key;
  };

  /** The element focus returns to when a carry is cancelled. */
  const sourceKey = (source: CommandSource): string =>
    source.kind === "provider" ? source.type : source.id;

  const pickUp = (
    source: CommandSource,
    allowedRows: number[],
    preferred: CellPosition | null,
    origin: ActivationOrigin,
  ) => {
    let targets = validTargetsFor(allowedRows, grid, strategyPattern);
    // A placed block can always go back where it came from.
    if (preferred) targets = withOriginCell(targets, preferred);
    if (targets.length === 0) {
      announce(
        `${describeSource(source)} cannot be placed anywhere in the grid right now.`,
      );
      return;
    }
    dispatch({ type: "pickUp", source, targets, preferred });
    const target =
      targets.find((cell) => samePosition(cell, preferred)) ?? targets[0];
    announce(
      `Picked up ${describeSource(source)}. ${CARRY_HELP[origin]} Target: ${describeCell(target, strategyPattern)}.`,
    );
  };

  const commit = (block: CarriedBlock, cell: CellPosition) => {
    const placedId =
      block.source.kind === "provider"
        ? placeProvider(block.source.type, cell)
        : moveBlock(block.source.id, cell);
    dispatch({ type: "place" });
    setFocusRequest(placedId ?? sourceKey(block.source));
    announce(
      `Placed ${describeSource(block.source)} in ${describeCell(cell, strategyPattern)}.`,
    );
  };

  const cancel = () => {
    if (!carrying) return;
    dispatch({ type: "cancel" });
    setFocusRequest(sourceKey(carrying.source));
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
    pickUp(
      { kind: "grid", id, label: found.block.label, origin: cell },
      found.block.allowedRows,
      cell,
      origin,
    );
  };

  const activateCell = (cell: CellPosition) => {
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
