// =============================================================================
// GRID ANNOUNCEMENTS - the single owner of what the user is told
// =============================================================================
//
// Every sentence the strategy grid speaks is written here, and nowhere else.
// The carry, the free drag, the palette drag and the vertical price drag all
// report an *outcome* - a fact about what just happened - and this module turns
// it into words. No call site composes a message of its own.
//
// That rule exists because the announcement layer was previously three call
// sites each deciding independently, and the fixes chained: cancelling a carry
// when a drag began made the cancellation silent; announcing the drag's outcome
// instead made that announcement false for a same-cell release. Both defects
// were the same shape - a sentence written next to the code that was *about to*
// act, rather than derived from what the act turned out to do.
//
// Two invariants follow, and they are what a change here has to preserve:
//
//  1. **Every outcome is a fact, not an intention.** A placement carries a
//     `PlacementResult` produced by the function that actually mutated the grid
//     (`placeProviderInCell` / `moveBlockToCell` in `GridArea`), so a sentence
//     can never claim a move, a refusal or a removal that did not happen.
//  2. **A sentence must still be true after the operation that triggered it.**
//     Anything said as a gesture *begins* has to survive that gesture. This is
//     why a carry released by a drag is never announced as the drag begins: a
//     drag on a different block gets its own sentence, and a drag on the very
//     block being carried folds the news into the outcome that gesture reaches
//     - one sentence, said once the fact is settled.

import {
  describeCell,
  describeSource,
  type ActivationOrigin,
  type CarryEndReason,
  type CommandSource,
} from "./blockCommand";
import type {
  CellPosition,
  PlacementResult,
  StrategyPattern,
} from "../types/grid";

// =============================================================================
// OUTCOMES
// =============================================================================

/** Which gesture put a block in a cell. It changes only how a refusal reads. */
export type PlacementVia =
  /** The command model: keyboard arrows plus Enter, or tap a block then a cell. */
  | "carry"
  /** A pointer drag released over a cell. */
  | "drag";

/** Why a pointer drag ended without the grid changing. */
export type DragEndReason =
  /** Released outside every cell, with nothing there to place into. */
  | "offGrid"
  /** The browser took the pointer away mid-drag (`pointercancel`). */
  | "aborted";

/** Why a block could not be picked up at all. */
export type PickUpRefusal =
  /** Nowhere on the grid will take this order right now. */
  | "noTargets"
  /** The cell draws it on a price axis, where nothing moves between cells. */
  | "onPriceAxis"
  /** One leg of a dual-axis order; the two legs may not be separated. */
  | "dualAxisPartner";

/**
 * Everything that can happen to a block through the carry, the pointer drag or
 * the vertical price drag. Reporting one of these is the only way to speak.
 */
export type GridOutcome =
  | {
      kind: "pickedUp";
      source: CommandSource;
      target: CellPosition;
      /** Decides which follow-up instructions are read out. */
      origin: ActivationOrigin;
    }
  | {
      kind: "pickUpRefused";
      source: CommandSource;
      reason: "noTargets";
      /**
       * What is still in the user's hand, when a refused pick-up was an
       * attempt to swap. `pickUp` refuses without dispatching, so the previous
       * carry outlives the refusal and the sentence has to say so.
       */
      carrying?: CommandSource;
    }
  | {
      kind: "moveRefused";
      label: string;
      reason: Exclude<PickUpRefusal, "noTargets">;
    }
  | { kind: "targetChanged"; target: CellPosition }
  | { kind: "noTargetThatWay" }
  /** A cell was chosen that the carry never offered; the carry survives. */
  | { kind: "cellRefused"; source: CommandSource; cell: CellPosition }
  | { kind: "carryEnded"; source: CommandSource; reason: CarryEndReason }
  | {
      kind: "placement";
      source: CommandSource;
      cell: CellPosition;
      result: PlacementResult;
      via: PlacementVia;
      releasedCarry?: boolean;
    }
  | { kind: "removed"; source: CommandSource; releasedCarry?: boolean }
  | {
      kind: "dragEnded";
      source: CommandSource;
      reason: DragEndReason;
      releasedCarry?: boolean;
    };

// =============================================================================
// WORDING
// =============================================================================

/**
 * The clause that tells a user their block left their hand. A drag on the very
 * block being carried releases that carry without a word of its own - anything
 * said as the gesture began would be falsified by the same gesture - so the
 * drag's own outcome has to carry the news, as one sentence rather than a
 * second live-region write that could cut the first one off.
 *
 * It is only ever appended to a sentence that does not already describe
 * something happening to that block: see `describeOutcome`.
 */
const carryReleased = (releasedCarry?: boolean): string =>
  releasedCarry ? ", and is no longer picked up" : "";

const CARRY_HELP: Record<ActivationOrigin, string> = {
  keyboard:
    "Use the arrow keys to choose a cell, Enter to place, Escape to cancel.",
  pointer:
    "Tap a highlighted cell to place it, or tap the block again to put it back.",
};

/** Where a block that was not placed has ended up, as a verb phrase. */
const restingPlace = (
  source: CommandSource,
  pattern: StrategyPattern,
): string =>
  source.kind === "provider"
    ? "returned to the palette"
    : `left in ${describeCell(source.origin, pattern)}`;

/**
 * The second half of every "nothing happened" sentence. A palette order that
 * was not placed does not exist at all; a grid block that was not placed is
 * still sitting in the cell it started in, and naming that cell is the only way
 * a screen-reader user can tell the difference.
 */
const wentNowhere = (
  source: CommandSource,
  pattern: StrategyPattern,
  releasedCarry?: boolean,
  /**
   * Where the grid has just confirmed the block to be. Without it the cell
   * comes from `source.origin`, which is only current for a drag - a carry
   * snapshots it at pick-up time, and the grid can move the block out from
   * under it before the carry is committed.
   */
  at?: CellPosition,
): string =>
  source.kind === "provider"
    ? `${describeSource(source)} was not placed${carryReleased(releasedCarry)}.`
    : `${describeSource(source)} stayed in ${describeCell(at ?? source.origin, pattern)}${carryReleased(releasedCarry)}.`;

const describePlacement = (
  source: CommandSource,
  cell: CellPosition,
  result: PlacementResult,
  via: PlacementVia,
  pattern: StrategyPattern,
  releasedCarry?: boolean,
): string => {
  switch (result.status) {
    case "created":
      return `Placed ${describeSource(source)} in ${describeCell(cell, pattern)}.`;
    case "moved":
      return `Moved ${describeSource(source)} to ${describeCell(cell, pattern)}.`;
    // The defect this branch exists for: a drop inside the block's own cell.
    // The grid rightly changed nothing, and saying the cell refused the order
    // contradicts the block sitting in it.
    //
    // "created" and "moved" above already describe something happening to this
    // very block, so a released-carry clause there would be noise. This branch
    // and "refused" below describe nothing happening, which is where a user who
    // was carrying that block needs telling that they no longer are.
    case "unchanged":
      return `${describeSource(source)} stayed in ${describeCell(cell, pattern)}${carryReleased(releasedCarry)}.`;
    case "refused":
      // "any more" only for a carry: the arrow keys walk cells the grid offered
      // at pick-up time, so a refusal there means the grid has changed since. A
      // drag can be released over any cell, and most were never on offer.
      return `${describeCell(cell, pattern)} cannot take this order${
        via === "carry" ? " any more" : ""
      }. ${wentNowhere(source, pattern, releasedCarry, result.at)}`;
    // Naming any cell here would be a claim the grid cannot support. When the
    // carry ends is a separate question, and it belongs to the command model
    // rather than to the words.
    case "gone":
      return `${describeSource(source)} is no longer on the grid${carryReleased(releasedCarry)}.`;
  }
};

/**
 * The one function that decides what the user hears. Pure, so every sentence in
 * the app is reachable from a test without a DOM.
 */
export const describeOutcome = (
  outcome: GridOutcome,
  pattern: StrategyPattern,
): string => {
  switch (outcome.kind) {
    case "pickedUp":
      return `Picked up ${describeSource(outcome.source)}. ${
        CARRY_HELP[outcome.origin]
      } Target: ${describeCell(outcome.target, pattern)}.`;

    case "pickUpRefused":
      // Reaching for a second order type while holding one leaves the first in
      // hand when the new pick-up is refused, and only this says so.
      return `${describeSource(outcome.source)} cannot be placed anywhere in the grid right now.${
        outcome.carrying
          ? ` Still carrying ${describeSource(outcome.carrying)}.`
          : ""
      }`;

    case "moveRefused":
      return outcome.reason === "onPriceAxis"
        ? `${outcome.label} is priced on this axis and cannot be moved to another cell. Use the arrow keys to change its price.`
        : `${outcome.label} cannot be moved on its own: its trigger and limit must stay in the same cell.`;

    case "targetChanged":
      return `${describeCell(outcome.target, pattern)}, ready to place.`;

    case "noTargetThatWay":
      return "No cell available in that direction.";

    // The carry survives a refused cell, and only this sentence says so: the
    // highlight that shows it is not available to a screen-reader user.
    case "cellRefused":
      return `${describeCell(outcome.cell, pattern)} cannot take this order. Still carrying ${describeSource(outcome.source)}.`;

    case "carryEnded":
      return outcome.reason === "cancelled"
        ? `Cancelled. ${describeSource(outcome.source)} ${restingPlace(outcome.source, pattern)}.`
        : `${describeSource(outcome.source)} ${restingPlace(outcome.source, pattern)}: a drag took over.`;

    case "placement":
      return describePlacement(
        outcome.source,
        outcome.cell,
        outcome.result,
        outcome.via,
        pattern,
        outcome.releasedCarry,
      );

    case "removed":
      return `Removed ${describeSource(outcome.source)} from the grid.`;

    case "dragEnded":
      return outcome.reason === "offGrid"
        ? `Released outside the grid. ${wentNowhere(outcome.source, pattern, outcome.releasedCarry)}`
        : `Drag cancelled. ${wentNowhere(outcome.source, pattern, outcome.releasedCarry)}`;
  }
};
