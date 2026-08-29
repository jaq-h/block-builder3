import { describe, it, expect } from "vitest";

import { BLOCK_TILE_SHAPE, REMOVE_CONTROL_SHAPE } from "./blockTile";
import { BLOCK_HEIGHT, centeredContainer } from "@styles/grid";

// =============================================================================
// THE TILE'S SIZE, STATED TWICE AND CHECKED ONCE
// =============================================================================
//
// `BLOCK_TILE_SHAPE` is the tile's geometry as Tailwind classes, which is what
// the DOM needs; `BLOCK_HEIGHT` is the same measurement as a number, which is
// what the price-axis layout, the drag overlay's centring and the drop
// resolver's hit-test box all need. Tailwind cannot take the number and those
// three cannot take the class, so the two coexist - and this is the only thing
// stopping them from drifting apart.
//
// Both axes are asserted, because the tile is square while the surviving
// constant is named for its height alone. A tile resized in the class list
// alone would draw every axis block off-centre and leave every drop
// hit-testing the old edges, neither of which shows up on screen as anything
// but a drag that jumps.

/** Tailwind's spacing step: `w-10` is 10 * 0.25rem, at the app's 16px root. */
const TAILWIND_STEP_PX = 4;

describe("the block tile's size", () => {
  it("matches the width and height its own class list asks for", () => {
    const classes = BLOCK_TILE_SHAPE.join(" ");
    const width = classes.match(/(?:^|\s)w-(\d+)(?:\s|$)/);
    const height = classes.match(/(?:^|\s)h-(\d+)(?:\s|$)/);

    expect(width, "BLOCK_TILE_SHAPE no longer states a w-<n>").not.toBeNull();
    expect(height, "BLOCK_TILE_SHAPE no longer states an h-<n>").not.toBeNull();

    expect(Number(width![1]) * TAILWIND_STEP_PX).toBe(BLOCK_HEIGHT);
    expect(Number(height![1]) * TAILWIND_STEP_PX).toBe(BLOCK_HEIGHT);
  });
});

// =============================================================================
// THE CONTROL'S OVERHANG AGAINST THE GAP THAT HAS TO CLEAR IT
// =============================================================================
//
// The Remove control is pinned at `-right-2`, so it hangs 8px past the right
// edge of the 40px tile it belongs to. A cell that draws no price axis lays its
// blocks out in `centeredContainer`, and while that set no gap sibling tiles
// were flush: the control sat over the NEXT tile's top-left corner and above it
// in the stacking order, so a click or a tap aimed at one block removed the
// block beside it. Measured in Chrome at 1440 with two Market orders in one
// bulk cell, `elementFromPoint` 3px inside the second tile returned the FIRST
// block's control, and clicking there destroyed that first block.
//
// Two numbers, one fact: the gap has to be at least the overhang. Neither can
// be read from jsdom, which computes no layout, so the two class lists that own
// them are compared here instead - the same contract `BLOCK_TILE_SHAPE` and
// `BLOCK_HEIGHT` are held to above. The behaviour they produce is pinned where
// it can be: "removes the block its own control belongs to" in
// `GridArea.dom.test.tsx` for the wiring, and a real browser for the geometry.

const spacing = (classes: string[], pattern: RegExp) => {
  const match = classes.join(" ").match(pattern);
  expect(match, `no ${pattern} in ${classes.join(" ")}`).not.toBeNull();
  return Number(match![1]) * TAILWIND_STEP_PX;
};

describe("the gap between two tiles in one cell", () => {
  it("clears the overhang the remove control states for itself", () => {
    const overhang = spacing(REMOVE_CONTROL_SHAPE, /(?:^|\s)-right-(\d+)(?:\s|$)/);
    const gap = spacing([centeredContainer], /(?:^|\s)gap-(\d+)(?:\s|$)/);

    expect(overhang).toBeGreaterThan(0);
    expect(
      gap,
      "the remove control now hangs further past its tile than the gap between two tiles clears, so it covers the neighbour a user aims at",
    ).toBeGreaterThanOrEqual(overhang);
  });
});
