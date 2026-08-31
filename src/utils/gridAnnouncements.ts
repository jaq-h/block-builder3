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
//     (`placeProviderInCell` / `keepBlockInItsCell` in `GridArea`), so a sentence
//     can never claim a move, a refusal or a removal that did not happen.
//  2. **A sentence must still be true after the operation that triggered it.**
//     Anything said as a gesture *begins* has to survive that gesture. This is
//     why a carry released by a drag is never announced as the drag begins: a
//     drag on a different block gets its own sentence, and a drag on the very
//     block being carried folds the news into the outcome that gesture reaches
//     - one sentence, said once the fact is settled.

import {
  describeCell,
  describeColumn,
  describeSource,
  type ActivationOrigin,
  type CarryEndReason,
  type CommandSource,
  type GridSource,
} from "./blockCommand";
import type { PriceAxisLeg } from "./blockMapping";
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
  /**
   * The drag ended mid-flight with no release to resolve: a `pointercancel`,
   * an unmount, or a release nobody heard. `usePointerGesture`'s `onCancel`
   * owns that list.
   */
  | "aborted";

/** Why a block could not be picked up at all. */
export type PickUpRefusal =
  /** Nowhere on the grid will take this order right now. */
  | "noTargets"
  /**
   * The cell draws it on a price axis. Nothing moves between cells, and this
   * block has something else the arrow keys can do, so the refusal says so.
   */
  | "onPriceAxis"
  /**
   * A placed block, in a cell that draws no price axis. It stays where it is
   * for the same reason every placed block does (decision D9), and there is no
   * axis to offer the arrow keys instead - so this refusal says how to correct
   * a misplaced order rather than what else to try.
   */
  | "staysInCell";

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
  | {
      kind: "carryEnded";
      source: CommandSource;
      reason: CarryEndReason;
      /**
       * Where the grid has just been asked to find the block, for a grid
       * source. `undefined` means the grid could not find it, which is a fact
       * about the grid rather than a missing argument - so a grid source must
       * always supply this, and `restingPlace` treats its absence as "not
       * there" rather than falling back to anything. A provider source has no
       * cell at all and leaves it unset.
       */
      at?: CellPosition;
    }
  | {
      kind: "placement";
      source: CommandSource;
      cell: CellPosition;
      result: PlacementResult;
      via: PlacementVia;
      releasedCarry?: boolean;
    }
  /**
   * One placed block was taken off the grid. `GridSource` rather than
   * `CommandSource`, because only a placed block can be removed - a palette
   * entry is an order type, and there is nothing there to take away. That is
   * also what lets the sentence name the cell without a fallback: a grid source
   * always carries one.
   */
  | {
      kind: "removed";
      source: GridSource;
      /**
       * Which price axis this block is drawn on, from `legOfBlock` - the one
       * owner of that question - or absent for a block carrying no price.
       *
       * A dual-axis order type places two blocks in one cell under one label,
       * so the cell alone tells them apart no better than the label does. This
       * removal names one block because the keyboard had focus on one block;
       * the pointer's removal is per cell and reports `cellCleared` instead.
       */
      leg?: PriceAxisLeg | null;
      releasedCarry?: boolean;
    }
  /**
   * One cell was emptied by its own clear control: every order it held, in one
   * press.
   *
   * The pointer's removal is per CELL rather than per block, so this is not a
   * `removed` outcome repeated - it is one event with one sentence, and saying
   * it block by block would be several live-region writes each erasing the one
   * before it.
   *
   * The unit is the ORDER rather than the block or the label. A dual-axis
   * order type puts two blocks in one cell under one label and is one order,
   * so naming that label twice would say two orders went; but a bulk cell can
   * hold two INDEPENDENT orders that also share a label, and naming it once
   * there said one order went where two did. So the caller reports how many
   * orders of each label it destroyed, and the count is what separates the two
   * cases. Facts, not words: `describeOutcome` is still the only thing that
   * turns them into a sentence.
   */
  | {
      kind: "cellCleared";
      cell: CellPosition;
      orders: { label: string; count: number }[];
    }
  | {
      kind: "dragEnded";
      source: CommandSource;
      reason: DragEndReason;
      releasedCarry?: boolean;
    }
  /**
   * The user picked a different market, and every block on the grid is now
   * priced against it.
   *
   * The `<select>` speaks its own new value, so this is not that. It is the
   * consequence, which is invisible without sight of the grid: every price chip
   * on screen changed. It lives here rather than next to the selector for the
   * reason the whole module exists - one owner for every sentence the grid
   * speaks - and it is reported by `GridArea` once the grid has actually been
   * handed the new market, so it states a fact rather than an intention.
   */
  | { kind: "marketChanged"; name: string; symbol: string }
  /**
   * A saved strategy could not be loaded back into the grid, because the market
   * it was placed on is not one this app offers any more.
   *
   * The grid is deliberately left alone in that case. Every position the saved
   * strategy holds is a percentage offset from its own market's price, so
   * loading it against whatever pair happens to be selected reprices the whole
   * thing into a different order set - the corruption the market tag exists to
   * prevent, one step further out. Refusing is only safe if the refusal
   * reaches the user, and this is one half of that: a fact about a grid that
   * did *not* change, reported by the same owner that reports one that did.
   * The other half is visible, on the strategy's own card in the Active Orders
   * panel - which is where the press happened, and which is the only half that
   * carries below `lg`, where the panel this live region sits in is
   * `display: none` and so is out of the accessibility tree entirely.
   */
  | { kind: "strategyMarketUnavailable"; symbol: string }
  /**
   * A saved strategy has just been loaded back into the grid, on the market it
   * was placed on.
   *
   * One outcome rather than two, because loading one is one event with two
   * facts in it: the grid now holds a strategy it did not hold, and it may be
   * priced against a different market than the one the user was looking at.
   * Reporting a market change and then a load would be two live-region writes
   * in quick succession, which is the shape this module exists to prevent - the
   * first is cut off by the second. `marketChanged` says which way the second
   * fact went, because a strategy reloaded on the market already selected has
   * not moved the user anywhere.
   *
   * It cannot be derived from a market change alone. Loading a strategy
   * remounts the whole assembly panel - `loadConfig` bumps the key it is
   * rendered with - so the fresh `GridArea` starts already holding the new
   * symbol and has nothing to compare against. The fact is carried in by `App`,
   * which is what survives that remount.
   */
  | {
      kind: "strategyLoaded";
      name: string;
      symbol: string;
      marketChanged: boolean;
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

// One sentence per input device, naming the gesture that device actually has.
// A mouse user told to "tap" is being addressed as somebody else, and a mouse
// is the one device that can also be told the block is following the cursor,
// because on a mouse it is.
const CARRY_HELP: Record<ActivationOrigin, string> = {
  keyboard:
    "Use the arrow keys to choose a cell, Enter to place, Escape to cancel.",
  mouse:
    "It follows the cursor. Click a highlighted cell to place it, or click the block again to put it back.",
  touch:
    "Tap a highlighted cell to place it, or tap the block again to put it back.",
};

/**
 * Where a block that was not placed has ended up, as a verb phrase.
 *
 * It deliberately does NOT read `source.origin`. Only a grid source carries
 * that field, it is stamped once when the gesture starts and is never
 * refreshed, and the grid can be rewritten while that gesture is still live,
 * so the snapshot can name a cell the block has since left. `at` is the answer
 * the grid gave when the hold ended, and its absence is itself an answer: the
 * grid no longer holds this block.
 *
 * This is the module's own invariant, that no sentence names a location the
 * grid has not just confirmed, and the module was found breaking it here after
 * writing it down. A claim you authored is the hardest one to audit, so the
 * rule is enforced by the shape of this function rather than by remembering
 * it: there is nothing stale in scope for it to reach for.
 */
const restingPlace = (
  source: CommandSource,
  pattern: StrategyPattern,
  at?: CellPosition,
): string => {
  if (source.kind === "provider") return "returned to the palette";
  // Saying less because the grid genuinely cannot confirm more is honest.
  return at ? `left in ${describeCell(at, pattern)}` : "is no longer on the grid";
};

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

/**
 * A list of names, as English rather than as a comma-joined dump. Two items get
 * "and"; more get an Oxford list. It exists for the cell-clearing sentence,
 * which is the one place the grid ever names more than one order at a time.
 */
const describeList = (items: string[]): string => {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
};

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
    // The defect this branch exists for: a drop inside the block's own cell.
    // The grid rightly changed nothing, and saying the cell refused the order
    // contradicts the block sitting in it.
    //
    // "created" above already describes something happening to this very
    // block, so a released-carry clause there would be noise. This branch,
    // "refused" and "gone" below describe nothing happening to it, which is
    // where a user who was carrying that block needs telling that they no
    // longer are - and where silence actively misleads, because the sibling
    // `cellRefused` outcome says "Still carrying X." whenever the carry does
    // survive. That convention teaches that no news is good news, so saying
    // nothing here reads as "you are still holding it".
    case "unchanged":
      return `${describeSource(source)} stayed in ${describeCell(cell, pattern)}${carryReleased(releasedCarry)}.`;
    case "refused":
      // Two different refusals, and wording them the same is what made the one
      // below unreadable. A placed block is not refused BY a cell - no cell
      // will take it, because a placed block does not change cells at all
      // (decision D9) - so naming the cell would send the user hunting for a
      // cell that would say yes.
      // Not a refusal by the placement rules either: the cell was simply not
      // one the panel was offering, so the sentence points at the pager rather
      // than at the cell or at decision D9.
      //
      // **The instruction NAMES the column and uses no pronoun**, and it comes
      // before `wentNowhere` rather than after it. An "it" there would have the
      // interpolated sentence's noun between itself and its antecedent - "...
      // was not placed. Use the column buttons to show it first" reads as an
      // instruction to reveal the ORDER, which is not something the pager does,
      // and it is the one clause telling the user what to do next. Every other
      // sentence here keeps a pronoun adjacent to what it refers to; this one
      // has none at all, so no later composition can move its referent.
      if (result.reason === "columnNotShown") {
        return `${describeCell(cell, pattern)} is not on screen, so nothing can be placed there yet. Use the column buttons to show the ${describeColumn(
          cell.col,
        )} column first. ${wentNowhere(source, pattern, releasedCarry, result.at)}`;
      }
      if (result.reason === "staysInCell") {
        return `${describeSource(source)} stays in the cell it was placed in, so it was not moved to ${describeCell(
          cell,
          pattern,
        )}. To put this order somewhere else, remove it and place a new one. ${wentNowhere(
          source,
          pattern,
          releasedCarry,
          result.at,
        )}`;
      }
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
 * One sentence per reason a carry ended, and no sentence any reason merely
 * falls into.
 *
 * A `switch` over the whole union rather than a chain of guards, and hoisted
 * here so its exhaustiveness is the compiler's job: a fourth `CarryEndReason`
 * leaves this function without an ending return, which its declared `string`
 * fails the typecheck on. The chain this replaced let the newest member of the
 * union inherit the last branch's words - a wrong sentence with nothing to
 * announce it, which is exactly what `mapOrderType` refuses to do with an order
 * type and what this file means by "a new message means a new outcome".
 *
 * What the user should do next is what separates them: a cancellation was
 * theirs, a supersession was the drag they are still holding, and a grid
 * replacement was neither - the cells the carry offered are simply not on offer
 * any more, and saying "cancelled" there would blame the user for something the
 * grid did.
 */
const describeCarryEnd = (reason: CarryEndReason, resting: string): string => {
  switch (reason) {
    case "cancelled":
      return `Cancelled. ${resting}.`;
    case "superseded":
      return `${resting}: a drag took over.`;
    case "gridReplaced":
      return `${resting}: the grid changed underneath it.`;
  }
};

/**
 * Several settled facts about **one** event, as the single thing the live
 * region is told.
 *
 * A live region holds one message, so two writes in one event are one message:
 * the second replaces the first before a screen reader has read it. That is
 * the shape `strategyLoaded` already avoids by carrying its two facts in one
 * outcome - but it can only do that because one caller knows both. A dismissal
 * click does not: `releaseBlockInHand` ends every mechanism holding a block and
 * each reports its own outcome, so the facts arrive separately and joining them
 * is this module's job rather than any caller's.
 *
 * Reading order is the order the facts were reported, because each sentence is
 * already complete on its own and nothing here is entitled to decide that one
 * of them matters less. The joining rule is only that they arrive as one write.
 *
 * A single outcome is worded exactly as `describeOutcome` words it, so a caller
 * that reports once is unaffected by ever having gone through here.
 */
export const describeOutcomes = (
  outcomes: GridOutcome[],
  pattern: StrategyPattern,
): string =>
  outcomes.map((outcome) => describeOutcome(outcome, pattern)).join(" ");

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

    // Both refusals now end in the same correction, because both blocks now
    // have it: Delete removes any placed block, whichever drag hook its cell
    // wired. Only the first clause differs, and it is the affordance the render
    // really offers - a block on a price axis has the arrow keys as well, and a
    // block in a cell that draws no axis has nothing else to be told about.
    case "moveRefused":
      return outcome.reason === "onPriceAxis"
        ? `${outcome.label} is priced on this axis and cannot be moved to another cell. Use the arrow keys to change its price, or Delete to remove it and place a new one.`
        : `${outcome.label} stays in the cell it was placed in. To put this order somewhere else, press Delete to remove it and place a new one.`;

    case "targetChanged":
      return `${describeCell(outcome.target, pattern)}, ready to place.`;

    case "noTargetThatWay":
      return "No cell available in that direction.";

    // The carry survives a refused cell, and only this sentence says so: the
    // highlight that shows it is not available to a screen-reader user.
    case "cellRefused":
      return `${describeCell(outcome.cell, pattern)} cannot take this order. Still carrying ${describeSource(outcome.source)}.`;

    // One sentence per reason, in `describeCarryEnd` above, where the compiler
    // holds the union to it.
    case "carryEnded":
      return describeCarryEnd(
        outcome.reason,
        `${describeSource(outcome.source)} ${restingPlace(outcome.source, pattern, outcome.at)}`,
      );

    case "placement":
      return describePlacement(
        outcome.source,
        outcome.cell,
        outcome.result,
        outcome.via,
        pattern,
        outcome.releasedCarry,
      );

    // The cell, because a removal is the one outcome with nothing left on screen
    // to say which block it was about: a bulk cell can hold two Limits, and
    // "Removed Limit block from the grid" names neither of them. `origin` is
    // safe to read here where `carryEnded` may not read it - the removal looks
    // the block up in the grid it is about to write, so the cell is one the grid
    // confirmed a moment ago rather than one snapshotted at pick-up time.
    //
    // The leg for the same reason one step further in: the two legs of a
    // dual-axis order share a label AND a cell, so the cell tells them apart no
    // better than the label does.
    case "removed":
      return `Removed ${describeSource(
        outcome.leg
          ? { ...outcome.source, label: `${outcome.source.label} ${outcome.leg}` }
          : outcome.source,
      )} from ${describeCell(outcome.source.origin, pattern)}.`;

    // The cell first, because the cell is what the control the user pressed is
    // named for, and it is the fact that is true whatever the cell held. The
    // orders follow it, each label named once and carrying its count where the
    // cell held more than one order of that label: the two legs of a dual-axis
    // order share a label and are ONE order, while two independent orders in a
    // bulk cell can share one too and are TWO. The plural is taken from the
    // total, because that is the number of orders the user just destroyed.
    case "cellCleared": {
      const cellName = describeCell(outcome.cell, pattern);
      if (outcome.orders.length === 0) return `Cleared ${cellName}.`;

      const total = outcome.orders.reduce((sum, order) => sum + order.count, 0);
      const named = outcome.orders.map((order) =>
        order.count > 1 ? `${order.count} ${order.label}` : order.label,
      );

      return `Cleared ${cellName}. Removed ${describeList(named)}${
        total === 1 ? " order" : " orders"
      }.`;
    }

    case "dragEnded":
      return outcome.reason === "offGrid"
        ? `Released outside the grid. ${wentNowhere(outcome.source, pattern, outcome.releasedCarry)}`
        : `Drag cancelled. ${wentNowhere(outcome.source, pattern, outcome.releasedCarry)}`;

    case "marketChanged":
      return `Market changed to ${outcome.name}. Every block on the grid is now priced from the ${outcome.symbol} market price.`;

    case "strategyMarketUnavailable":
      return `This strategy was placed on ${outcome.symbol}, which is no longer available. It was not loaded, because its prices would mean something different on another market.`;

    case "strategyLoaded":
      return outcome.marketChanged
        ? `Saved strategy loaded onto the grid. The market changed to ${outcome.name}, so every block is now priced from the ${outcome.symbol} market price.`
        : `Saved strategy loaded onto the grid, priced from the ${outcome.symbol} market price.`;
  }
};
