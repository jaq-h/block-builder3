import { useAnnouncer, type Announcement } from "./useAnnouncer";
import { describeOutcome, type GridOutcome } from "../utils/gridAnnouncements";
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
}

export const useGridAnnouncer = (pattern: StrategyPattern): GridAnnouncer => {
  const { announcement, announce } = useAnnouncer();

  return {
    announcement,
    report: (outcome: GridOutcome) =>
      announce(describeOutcome(outcome, pattern)),
  };
};
