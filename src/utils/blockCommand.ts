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

import type { CellPosition, GridData, StrategyPattern } from "../types/grid";
import { isCellValidForPlacement } from "./grid";

// =============================================================================
// TYPES
// =============================================================================

/**
 * What a sentence about the grid is about: a palette order type, or a block
 * already placed in a cell.
 */
export type CommandSource = ProviderSource | GridSource;

/** A palette entry - an order type that is not on the grid yet. */
export interface ProviderSource {
  kind: "provider";
  /** Order type identifier, e.g. "stop-loss-limit". */
  type: string;
  label: string;
}

/** A block already on the grid, and the cell the gesture started in. */
export interface GridSource {
  kind: "grid";
  id: string;
  label: string;
  origin: CellPosition;
}

export interface CarriedBlock {
  /**
   * Always a palette order. A placed block is never carried, because a placed
   * block never changes cells (decision D9) - so this is narrower than
   * `CommandSource`, and deliberately: it is the type system holding that rule
   * rather than a comment asking future code to.
   */
  source: ProviderSource;
  /** The cell the block would land in if placed now. */
  target: CellPosition;
  /** Every cell this block may legally be placed in, in reading order. */
  targets: CellPosition[];
  /**
   * How this carry was started. It is held on the carry rather than re-derived
   * later because the two things that depend on it - the ghost that follows a
   * cursor, and the cell the cursor points at becoming the target - last for
   * the whole carry, while the event that could answer the question is one
   * pointer up at the start of it. Re-deriving it from whatever pointer moved
   * last is the second derivation this repository's history is made of.
   */
  origin: ActivationOrigin;
}

export interface CommandState {
  /** `null` while idle; a carried block while the user is choosing a cell. */
  carrying: CarriedBlock | null;
}

/**
 * Which affordance activated a block, and on a pointer which kind of device
 * did it. Three, not two, because the mouse differs from a finger in a way the
 * model has to answer for rather than gloss: a mouse keeps a cursor on screen
 * between contacts, so a block it is carrying can follow that cursor and the
 * instructions have to say "click"; a finger and a pen leave nothing on screen
 * between contacts, so neither can be true for them. Pen is grouped with touch
 * because what matters here is a persistent cursor rather than hover.
 *
 * The keyboard diverges from both in exactly one place: Enter on a carried
 * block places it, because the keyboard has Escape to cancel with, while a
 * second click or tap on it puts it back down, because a pointer does not.
 */
export type ActivationOrigin = "keyboard" | "mouse" | "touch";

/**
 * The origin a pointer gesture reports, from the device's own word for itself.
 * Anything that is not a mouse is treated as a direct-manipulation contact.
 */
export const originForPointerType = (pointerType: string): ActivationOrigin =>
  pointerType === "mouse" ? "mouse" : "touch";

/** Why a carry ended without the block being placed. */
export type CarryEndReason =
  /** The user asked for it: Escape, Tab, or a second tap on the carried block. */
  | "cancelled"
  /** A pointer drag started and took the interaction over. */
  | "superseded"
  /**
   * The grid the carry was offered against is not the grid that is there any
   * more: Clear All, Reverse Blocks, a pattern switch, a removal, or anything
   * else that rewrites what the grid holds. See `gridReplaced` below.
   */
  | "gridReplaced";

export const IDLE_COMMAND_STATE: CommandState = { carrying: null };

export type CommandAction =
  | {
      type: "pickUp";
      source: ProviderSource;
      targets: CellPosition[];
      origin: ActivationOrigin;
      /**
       * The column the user was last working in, or `null` if they have not
       * chosen one; see `initialTarget`.
       */
      preferredCol: number | null;
    }
  | { type: "moveTarget"; dCol: number; dRow: number }
  /**
   * Point at a cell without stepping towards it: the mouse names a target
   * outright rather than walking to one. A cell the carry never offered leaves
   * the target where it is, so this can no more reach an illegal cell than the
   * arrow keys can.
   */
  | { type: "pointAt"; target: CellPosition }
  | { type: "place" }
  | { type: "cancel" }
  /**
   * The grid this carry was offered against has been replaced beneath it.
   *
   * A carry is a promise about *cells* - these are the ones that will take this
   * order - and `targets` is that promise snapshotted at pick-up. Anything that
   * rewrites the grid or switches the pattern can make it untrue, and an untrue
   * promise is drawn on screen as a highlighted cell and read out as
   * `aria-current`, so the user is invited to drop into a cell the placement
   * primitive will then refuse. It is a transition of its own rather than a
   * second spelling of `cancel` because nobody cancelled anything: the carry
   * ends because the grid moved, and the sentence the user hears says so.
   */
  | { type: "gridReplaced" };

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
 * Whether two offers name the same cells, in the same order.
 *
 * `validTargetsFor` walks the grid in one fixed order, so two offers built from
 * it are equal exactly when they are equal element by element - there is no set
 * comparison to do, and doing one would be a second rule about what an offer is.
 * This is what tells a carry whose cells the grid still stands behind from one
 * whose cells it does not; see the `gridReplaced` transition.
 */
export const sameTargets = (
  a: CellPosition[],
  b: CellPosition[],
): boolean =>
  a.length === b.length && a.every((cell, index) => samePosition(cell, b[index]));

/**
 * Where a pick-up starts: the first legal cell in the column the user is
 * looking at, and otherwise the first legal cell there is.
 *
 * A carried block is always a palette order now, so there is no cell it "came
 * from" to prefer. `withOriginCell` used to insert a placed block's own cell
 * into the target list for exactly that; it went with the cross-cell move
 * (decision D9), because a carry whose only legal destination is where the
 * block already sits is not a move, it is a no-op with extra steps.
 *
 * `preferredCol` is what replaced it, and it is a different kind of preference:
 * not where the block came from, but **the column the user was last working
 * in**. Below `sm` the panel shows one grid column at a time, so a pick-up
 * landing in the first legal cell outright would throw a user who had paged to
 * Exit back to Entry the moment they reached for an order - every time, since
 * an empty grid makes some Entry cell legal and the target list is walked
 * column-major. It is one rule at every width rather than a phone-only concept:
 * a cross-column arrow move is an expressed choice on a desktop too, and a
 * pick-up starting where the user was last working is right there as well.
 *
 * It is a choice the user EXPRESSED, never a column the app merely ended up
 * showing them, which is why it is `null` until one is made rather than
 * defaulting to 0. `GridArea` owns which events count; the reason it matters
 * here is that the target a pick-up starts on must not feed back in. That
 * target can be this function's own fallback, and taking it as a preference
 * would make one pick-up's fallback silently decide the next one's start.
 *
 * **The fallback is exactly the first legal cell**, taken whenever there is no
 * preference or the preferred column offers no legal cell. That is what keeps a
 * pick-up whose only legal cells are in the OTHER column opening the pager
 * there.
 */
export const initialTarget = (
  targets: CellPosition[],
  preferredCol: number | null,
): CellPosition | null =>
  targets.find((cell) => cell.col === preferredCol) ?? targets[0] ?? null;

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
      const target = initialTarget(action.targets, action.preferredCol);
      // A block with nowhere legal to go is not picked up at all, so the user
      // can never get stuck carrying something that cannot be put down.
      if (!target) return state;
      return {
        carrying: {
          source: action.source,
          target,
          targets: action.targets,
          origin: action.origin,
        },
      };
    }

    case "pointAt": {
      const { carrying } = state;
      if (!carrying) return state;
      if (samePosition(action.target, carrying.target)) return state;
      if (!carrying.targets.some((cell) => samePosition(cell, action.target))) {
        return state;
      }
      return { carrying: { ...carrying, target: action.target } };
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
    case "gridReplaced":
      return state.carrying === null ? state : IDLE_COMMAND_STATE;

    default:
      return state;
  }
};

// =============================================================================
// NAMING - shared by accessible labels and by `utils/gridAnnouncements.ts`
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

// `hasDualAxisPartner` lived here, and refused to pick up one leg of a
// dual-axis order because moving it alone would split the order across two
// cells and flip one leg from buy to sell. Decision D9 refuses the move for
// EVERY placed block, so the special case has nothing left to add: the general
// rule already covers it, and a second guard saying the same thing more
// narrowly is the shape this repository keeps having to undo.

export const describeSource = (source: CommandSource): string =>
  source.kind === "provider"
    ? `${source.label} order`
    : `${source.label} block`;
