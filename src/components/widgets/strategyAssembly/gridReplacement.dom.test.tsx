// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useEffect, type FC } from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";

import { StrategyAssemblyProvider } from "./StrategyAssemblyContext";
import GridArea from "./components/GridArea";
import PatternSelector from "./components/PatternSelector";
import UtilityButtons from "./components/UtilityButtons";
import { useGridData } from "./contexts/GridDataContext";
import { clearGrid } from "@utils/grid";
import type { GridDataActions } from "@/types/strategyAssembly";
import { MarketContext } from "@store/MarketContext";
import { MARKETS, findMarket } from "@data/markets";
import { BTC_USD } from "@/test/marketFixtures";

// =============================================================================
// A CARRY THE GRID IS REPLACED UNDER - THE WHOLE WRITE SURFACE, NOT THREE PATHS
// =============================================================================
//
// A carry is a promise about cells: these are the ones that will take this
// order. Every path that rewrites what the grid holds can make that promise
// untrue, and while the carry outlived one the grid went on drawing the promise
// as a highlight and reading it out as `aria-current` - inviting a drop into a
// cell the placement primitive was about to refuse.
//
// `useBlockCommand` owns the transition that ends the carry, and its own suite
// pins it against the fact rather than against any caller: a different `grid`
// prop is all any path can do to that model. **This file pins the other half:
// that the app's grid-owning context has no path which sidesteps it.**
//
// It is deliberately not three tests on Clear All, Reverse Blocks and the
// pattern switch. Those three were the paths that existed the day this was
// written, and the fourth one is always written by somebody who has not read
// this file. So the suite is driven by `GRID_WRITE_SURFACE` below, which is
// typed as a `Record` over the context's own action interface: adding an action
// to `GridDataActions` fails the TYPECHECK until it is classified here, and the
// runtime check in "the write surface is fully classified" fails if the
// provider grows an action the interface never declared. Anything classified as
// able to replace the grid is then exercised, without a test being written for
// it.

/**
 * One action on the grid-data context, and how a wholesale replacement reaches
 * the grid through it.
 *
 * `replace` is run with the live context actions while a carry is in hand; the
 * carry must not survive it. An action that genuinely cannot replace the grid
 * says so instead, and has to say why - "it is not obvious" is the answer that
 * lets the next path through.
 */
type GridWrite =
  | { replace: (actions: GridDataActions) => void; cannotReplace?: never }
  | { replace?: never; cannotReplace: string };

const GRID_WRITE_SURFACE: Record<keyof GridDataActions, GridWrite> = {
  // The raw setter GridArea's own block-level writes go through. A wholesale
  // replacement reaches the grid through it just as readily, which is exactly
  // why the transition cannot be a courtesy that `clearAll` and its two
  // siblings pay: this is the path a new feature reaches for first.
  setGrid: { replace: (actions) => actions.setGrid(clearGrid(2, 3)) },
  // Not a write to the grid at all, and still a replacement: the pattern is
  // half of what decides whether a cell will take an order, so switching it
  // rewrites the offer without touching a single block.
  setStrategyPattern: {
    replace: (actions) => actions.setStrategyPattern("bulk"),
  },
  clearAll: { replace: (actions) => actions.clearAll() },
  reverseBlocks: { replace: (actions) => actions.reverseBlocks() },
};

// =============================================================================
// HARNESS
// =============================================================================

/** The pair every price on this harness's grid is written for. */
const BTC = findMarket("BTC/USD")!;

/**
 * The real provider and the real grid, so the write surface under test is the
 * one the app actually has. `GridArea` is the only child that matters here: it
 * is what wires the command model to that provider, and what draws the
 * `aria-current` a stale carry leaves behind.
 */
const Harness: FC<{ actionsOut: (actions: GridDataActions) => void }> = ({
  actionsOut,
}) => (
  <MarketContext.Provider
    value={{
      market: BTC,
      // The grid draws a price chip per placed block, so the pair's rules have
      // to be in hand for it to render at all - `ready` is the state the app is
      // in by the time a user can carry anything. See
      // `utils/priceFormatReadiness.ts` for why the readiness travels as one
      // value rather than as a precision and a settled flag.
      priceFormat: { status: "ready", market: BTC, precision: BTC_USD },
      markets: MARKETS,
      selectMarket: vi.fn(),
    }}
  >
    <StrategyAssemblyProvider>
      <ActionsProbe onActions={actionsOut} />
      {/* The three real controls that replace the grid, as siblings of
          `GridArea` in the order `StrategyAssembly` puts them - which is the
          fact the activation tests below turn on. Being siblings, they are
          outside the element `GridArea` draws as its placement surface, so a
          pointer press on one is a press the dismissal hatch hears. */}
      <PatternSelector />
      <GridArea currentPrice={100_000} tickerError={null} />
      <UtilityButtons />
    </StrategyAssemblyProvider>
  </MarketContext.Provider>
);

/** Hands the live context actions out, so a test can drive one of them. */
const ActionsProbe: FC<{ onActions: (actions: GridDataActions) => void }> = ({
  onActions,
}) => {
  const gridData = useGridData();
  useEffect(() => {
    onActions(gridData);
  });
  return null;
};

/**
 * What a screen reader would receive. `LiveAnnouncer` alternates between two
 * regions so a repeated sentence is still re-read, so the live text is
 * whichever of them is holding one.
 */
const announcement = () =>
  screen
    .getAllByRole("status")
    .map((region) => region.textContent)
    .filter(Boolean)
    .join("");

const targets = () => document.querySelectorAll("[aria-current='location']");

/**
 * A Market in the Entry primary cell and a Take Profit in hand.
 *
 * The conditional pattern is what makes the offer worth checking: with a
 * primary placed, the cells on offer are its diagonals, and every replacement
 * below takes at least one of them away. On the bulk pattern every cell is
 * legal whatever the grid holds, so a stale offer there is stale about nothing.
 */
const carryOverAPlacedPrimary = () => {
  let actions: GridDataActions | null = null;
  render(<Harness actionsOut={(next) => (actions = next)} />);

  fireEvent.keyDown(screen.getByRole("button", { name: "Add Market order" }), {
    key: "Enter",
  });
  fireEvent.keyDown(screen.getByRole("button", { name: "Add Market order" }), {
    key: "Enter",
  });
  expect(announcement()).toContain("Placed Market order");

  fireEvent.keyDown(
    screen.getByRole("button", { name: "Add Take Profit order" }),
    { key: "Enter" },
  );
  expect(announcement()).toContain("Picked up Take Profit order");
  expect(targets()).toHaveLength(1);

  if (!actions) throw new Error("the grid-data context never published itself");
  return actions as GridDataActions;
};

// =============================================================================
// TESTS
// =============================================================================

describe("the grid-data context's write surface", () => {
  // The provider is free to publish an action the interface never declared, and
  // the `Record` above cannot see one. This can.
  it("is fully classified, so a new path cannot be added without deciding", () => {
    let published: GridDataActions | null = null;
    render(<Harness actionsOut={(next) => (published = next)} />);

    const actions = published as GridDataActions | null;
    if (!actions) throw new Error("the grid-data context never published itself");

    const callable = Object.entries(actions)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key)
      .sort();

    expect(callable).toEqual(Object.keys(GRID_WRITE_SURFACE).sort());
  });

  describe.each(
    Object.entries(GRID_WRITE_SURFACE).filter(
      (entry): entry is [string, Extract<GridWrite, { replace: unknown }>] =>
        "replace" in entry[1] && entry[1].replace !== undefined,
    ),
  )("a grid replaced through %s", (_name, write) => {
    it("ends the carry rather than leaving cells advertising themselves", () => {
      const actions = carryOverAPlacedPrimary();

      // Straight through the context, with no pointer anywhere near it: the
      // dismissal hatch in `GridArea` ends a carry when the user presses
      // something outside the placement surface, and that is a boundary rather
      // than a lifecycle transition. A replacement reached any other way - a
      // keyboard press on a control, a load, an effect - never goes past it,
      // which is why this drives the action itself.
      act(() => write.replace(actions));

      expect(targets()).toHaveLength(0);
      expect(announcement()).toBe(
        "Take Profit order returned to the palette: the grid changed underneath it.",
      );
    });
  });
});

// =============================================================================
// WHICH MECHANISM OWNS WHICH ACTIVATION
// =============================================================================
//
// Two things end a carry when one of these three controls is used, and **which
// one gets there first depends on the input method, not on the control**. Both
// are correct and neither is a fix for the other:
//
//   - A real POINTER press is heard by `GridArea`'s dismissal hatch, on
//     `pointerdown` in the capture phase, before the pressed button's own click
//     handler has replaced anything. The three controls are siblings of
//     `GridArea` rather than children of it, so they are genuinely outside the
//     placement surface and the user genuinely did press something else -
//     "Cancelled." is the truth about what they did. The replacement that
//     follows then finds no carry to be stale about.
//   - A KEYBOARD or assistive-technology activation dispatches a click with no
//     pointer event before it, so the hatch never hears it and the grid is
//     replaced with the carry still live. That is the `gridReplaced` transition's
//     case, and it says so - the cells stopped being on offer, which is not
//     something to blame the user for.
//
// The sentence is the whole of what separates them: both end the carry and both
// clear the highlight, so an assertion about either alone stays green through a
// change that silently swaps which mechanism wins. That is why each case below
// asserts the literal string, for each of the three controls rather than for one
// representative - the hatch and the transition are wired once but reached three
// ways, and a control that drifted out of the sibling arrangement would change
// only its own sentence.

/** A `pointerdown` with nothing on it but its type: the hatch reads no more. */
const pointerDownOn = (control: Element) =>
  fireEvent(
    control,
    new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
  );

const clearAll = () => screen.getByRole("button", { name: /Clear All/ });
const reverse = () => screen.getByRole("button", { name: /Reverse/ });

/**
 * The pattern button that is not the one already in force - `aria-pressed` is
 * how the control itself says which that is, so this cannot drift out of step
 * with the selector's own idea of its state.
 *
 * Switching INTO bulk is a genuine replacement of the offer, which is what
 * makes this case worth a test: a conditional carry is offered its primary's
 * diagonals, and in bulk every cell takes every order. (Clear All *within* bulk
 * is the opposite case, and deliberately leaves the carry standing.)
 */
const otherPattern = () =>
  screen
    .getAllByRole("button", { pressed: false })
    .find((button) =>
      screen
        .getByRole("group", { name: "Order assembly type" })
        .contains(button),
    )!;

const OUTSIDE_CONTROLS: [string, () => Element][] = [
  ["Clear All", clearAll],
  ["Reverse", reverse],
  ["the pattern selector", otherPattern],
];

describe.each(OUTSIDE_CONTROLS)("a pointer press on %s", (_name, find) => {
  it("ends the carry as a cancellation, because the press was outside the placement surface", () => {
    carryOverAPlacedPrimary();

    // The order a browser sends, and the order that decides this: the hatch's
    // capture-phase `pointerdown` runs before the button's own click handler.
    const control = find();
    pointerDownOn(control);
    fireEvent.click(control);

    expect(announcement()).toBe(
      "Cancelled. Take Profit order returned to the palette.",
    );
    expect(targets()).toHaveLength(0);
  });
});

describe.each(OUTSIDE_CONTROLS)("a keyboard press on %s", (_name, find) => {
  it("ends the carry as a grid replacement, because no pointer went down anywhere", () => {
    carryOverAPlacedPrimary();

    // What Enter or Space on a focused button produces: a click, and no pointer
    // event at all. Nothing the hatch can hear, so the carry is still live when
    // the grid is replaced under it.
    fireEvent.click(find());

    expect(announcement()).toBe(
      "Take Profit order returned to the palette: the grid changed underneath it.",
    );
    expect(targets()).toHaveLength(0);
  });
});
