// =============================================================================
// BLOCK COMMAND MODEL - select, move, place
// =============================================================================
//
// The command model is what makes the builder usable without a pointing device
// at all: focus a block, Enter to pick it up, arrows to choose a target cell,
// Enter to place, Escape to cancel. It sits over the drag rather than replacing
// it, and it is the same model a tap drives on a phone.
//
// Everything here is pure. The DOM-facing half lives in `useBlockCommand`.

import type {
  BlockData,
  CellPosition,
  GridData,
  StrategyPattern,
} from "../types/grid";
import { isCellValidForPlacement } from "./grid";

// =============================================================================
// TYPES
// =============================================================================

/** Where the block being carried came from. */
export type CommandSource =
  | {
      kind: "provider";
      /** Order type identifier, e.g. "stop-loss-limit". */
      type: string;
      label: string;
    }
  | {
      kind: "grid";
      id: string;
      label: string;
      origin: CellPosition;
    };

export interface CarriedBlock {
  source: CommandSource;
  /** The cell the block would land in if placed now. */
  target: CellPosition;
  /** Every cell this block may legally be placed in, in reading order. */
  targets: CellPosition[];
}

export interface CommandState {
  /** `null` while idle; a carried block while the user is choosing a cell. */
  carrying: CarriedBlock | null;
}

export const IDLE_COMMAND_STATE: CommandState = { carrying: null };

export type CommandAction =
  | {
      type: "pickUp";
      source: CommandSource;
      targets: CellPosition[];
      /** Preferred starting cell, normally the block's own cell. */
      preferred?: CellPosition | null;
    }
  | { type: "moveTarget"; dCol: number; dRow: number }
  | { type: "place" }
  | { type: "cancel" };

// =============================================================================
// TARGET SELECTION
// =============================================================================

export const samePosition = (
  a: CellPosition | null | undefined,
  b: CellPosition | null | undefined,
): boolean => !!a && !!b && a.col === b.col && a.row === b.row;

/**
 * Every cell a block with these `allowedRows` may be placed in right now, in
 * reading order (column-major, matching the on-screen layout).
 */
export const validTargetsFor = (
  allowedRows: number[],
  grid: GridData,
  pattern: StrategyPattern,
): CellPosition[] => {
  const targets: CellPosition[] = [];
  for (let col = 0; col < grid.length; col++) {
    for (let row = 0; row < grid[col].length; row++) {
      if (isCellValidForPlacement(col, row, allowedRows, grid, pattern)) {
        targets.push({ col, row });
      }
    }
  }
  return targets;
};

/**
 * A block's own cell is always somewhere it may be put back, even though the
 * placement rules read it as occupied. Inserting it keeps reading order, so
 * the arrow keys still walk the grid the way it looks.
 */
export const withOriginCell = (
  targets: CellPosition[],
  origin: CellPosition,
): CellPosition[] => {
  if (targets.some((cell) => samePosition(cell, origin))) return targets;
  const merged = [...targets, origin];
  merged.sort((a, b) => a.col - b.col || a.row - b.row);
  return merged;
};

/**
 * Where a pick-up starts: the block's own cell when that is still a legal
 * target, otherwise the first legal one. `null` means the block cannot be
 * placed anywhere at all, so the pick-up must not happen.
 */
export const initialTarget = (
  targets: CellPosition[],
  preferred?: CellPosition | null,
): CellPosition | null => {
  if (targets.length === 0) return null;
  const match = targets.find((cell) => samePosition(cell, preferred));
  return match ?? targets[0];
};

/**
 * Step the target one cell in a direction, considering only legal cells - so
 * every position the arrows can reach is one the block can actually be placed
 * in, and Enter is never refused.
 *
 * Straight ahead wins when there is anything straight ahead. Otherwise the
 * nearest legal cell that way is taken, which is what makes the diagonal
 * placement rule reachable at all: with a block in the Entry primary cell the
 * only other legal cells are diagonals, and a strictly orthogonal step could
 * never leave the cell it started in.
 *
 * Nothing that way leaves the target where it is.
 */
export const stepTarget = (
  targets: CellPosition[],
  current: CellPosition,
  dCol: number,
  dRow: number,
): CellPosition => {
  if (dCol === 0 && dRow === 0) return current;

  const horizontal = dCol !== 0;
  const ahead = targets.filter((cell) =>
    horizontal
      ? (cell.col - current.col) * dCol > 0
      : (cell.row - current.row) * dRow > 0,
  );
  if (ahead.length === 0) return current;

  const straight = ahead.filter((cell) =>
    horizontal ? cell.row === current.row : cell.col === current.col,
  );
  const candidates = straight.length > 0 ? straight : ahead;

  const primary = (cell: CellPosition) =>
    Math.abs(horizontal ? cell.col - current.col : cell.row - current.row);
  const secondary = (cell: CellPosition) =>
    Math.abs(horizontal ? cell.row - current.row : cell.col - current.col);

  return [...candidates].sort(
    (a, b) => primary(a) - primary(b) || secondary(a) - secondary(b),
  )[0];
};

// =============================================================================
// STATE MACHINE
// =============================================================================

/**
 * The command model's four transitions. `place` and `cancel` both return to
 * idle; the caller reads `state.carrying` before dispatching to know what to
 * commit, because the reducer owns the interaction and not the grid.
 */
export const commandReducer = (
  state: CommandState,
  action: CommandAction,
): CommandState => {
  switch (action.type) {
    case "pickUp": {
      const target = initialTarget(action.targets, action.preferred);
      // A block with nowhere legal to go is not picked up at all, so the user
      // can never get stuck carrying something that cannot be put down.
      if (!target) return state;
      return {
        carrying: { source: action.source, target, targets: action.targets },
      };
    }

    case "moveTarget": {
      const { carrying } = state;
      if (!carrying) return state;
      const target = stepTarget(
        carrying.targets,
        carrying.target,
        action.dCol,
        action.dRow,
      );
      if (samePosition(target, carrying.target)) return state;
      return { carrying: { ...carrying, target } };
    }

    case "place":
    case "cancel":
      return state.carrying === null ? state : IDLE_COMMAND_STATE;

    default:
      return state;
  }
};

// =============================================================================
// ANNOUNCEMENTS
// =============================================================================

const COLUMN_NAMES = ["Entry", "Exit"];
const ROW_NAMES = ["upper conditional", "primary", "lower conditional"];

/** Human-readable name for a cell, used in labels and announcements alike. */
export const describeCell = (
  cell: CellPosition,
  pattern: StrategyPattern = "conditional",
): string => {
  const column = COLUMN_NAMES[cell.col] ?? `column ${cell.col + 1}`;
  if (pattern === "bulk") return `${column} column, row ${cell.row + 1}`;
  const row = ROW_NAMES[cell.row] ?? `row ${cell.row + 1}`;
  return `${column} column, ${row} row`;
};

/**
 * True when this block is one of the two axes of a single dual-axis order:
 * `createBlocksFromOrderType` case 4 puts a trigger block (axis 1) and a limit
 * block (axis 2) of the same order type in one cell, and they only mean
 * anything together. Moving one on its own would split the order across two
 * cells, which flips one leg from buy to sell.
 *
 * The pointer drag never offered this - every block on an axis is wired to the
 * vertical drag, so free drag cannot reach it - so the cell-level pick-up must
 * not offer it either.
 *
 * Sharing an order type is not enough on its own: the bulk pattern is
 * "multiple independent orders", so two separate Market or Limit orders can sit
 * in one cell. Those share an axis rather than splitting one between them, and
 * a mouse can move them, so the keyboard and a finger must be able to too.
 */
export const hasDualAxisPartner = (
  cellBlocks: BlockData[],
  block: BlockData,
): boolean =>
  block.axes.length > 0 &&
  cellBlocks.some(
    (other) =>
      other.id !== block.id &&
      other.orderType === block.orderType &&
      other.axes.length > 0 &&
      other.axis !== block.axis,
  );

export const describeSource = (source: CommandSource): string =>
  source.kind === "provider"
    ? `${source.label} order`
    : `${source.label} block`;
