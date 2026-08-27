import { useRef } from "react";
import { useAnnouncer, type Announcement } from "./useAnnouncer";
import {
  describeOutcome,
  describeOutcomes,
  type GridOutcome,
} from "../utils/gridAnnouncements";
import type { StrategyPattern } from "../types/grid";

// =============================================================================
// USE GRID ANNOUNCER - the one voice of the strategy grid
// =============================================================================
//
// `useAnnouncer` owns the live region's mechanics; `gridAnnouncements` owns the
// words. This joins them and is the only thing in the grid that may speak.
//
// It deliberately exposes `report` and not `announce`: a caller states what
// happened and has no way to hand over a sentence of its own. That is what
// stops the wording drifting apart between the carry and the pointer paths,
// which is how the pointer drag came to say "Placed" where the keyboard said
// "Moved" for the same fact.

export interface GridAnnouncer {
  announcement: Announcement;
  /** Say what just happened. The wording is not the caller's to choose. */
  report: (outcome: GridOutcome) => void;
  /**
   * Everything reported while `run` executes describes one event, and is
   * spoken as one live-region write.
   *
   * It exists for the one operation that ends several things at once:
   * `releaseBlockInHand`, which puts down every mechanism holding a block. Each
   * of those reports its own outcome, and each is a settled fact - but the live
   * region holds one message, so left alone the last write replaces the earlier
   * ones before a screen reader reaches them. The facts are joined rather than
   * ranked, in `gridAnnouncements`; nothing here composes a sentence.
   *
   * A `run` that reports once announces exactly what it would have announced
   * without this, so wrapping a call is safe whether or not it turns out to
   * report more than once.
   */
  asOneEvent: (run: () => void) => void;
}

export const useGridAnnouncer = (pattern: StrategyPattern): GridAnnouncer => {
  const { announcement, announce } = useAnnouncer();

  // The outcomes of the event currently being collected, or `null` when a
  // report is its own event. A ref rather than state: collection opens and
  // closes inside one synchronous call and must never wait for a render.
  const collectingRef = useRef<GridOutcome[] | null>(null);

  const report = (outcome: GridOutcome) => {
    const collecting = collectingRef.current;
    if (collecting) {
      collecting.push(outcome);
      return;
    }
    announce(describeOutcome(outcome, pattern));
  };

  const asOneEvent = (run: () => void) => {
    // Already inside one: an event does not become two by being nested.
    if (collectingRef.current) {
      run();
      return;
    }
    const collected: GridOutcome[] = [];
    collectingRef.current = collected;
    try {
      run();
    } finally {
      // Whatever `run` did, the next report is a new event.
      collectingRef.current = null;
    }
    if (collected.length > 0) announce(describeOutcomes(collected, pattern));
  };

  return { announcement, report, asOneEvent };
};
