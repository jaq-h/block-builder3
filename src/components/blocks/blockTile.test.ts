import { describe, it, expect } from "vitest";

import { BLOCK_TILE_SHAPE, REMOVE_CONTROL_SHAPE } from "./blockTile";
import { BLOCK_HEIGHT } from "@styles/grid";

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
// THE REMOVE CONTROL STAYS INSIDE THE TILE IT BELONGS TO
// =============================================================================
//
// A destructive control may never extend past the tile a user can see. While it
// hung 8px out at `-top-2 -right-2` it covered a NEIGHBOUR in both layouts, and
// a press on the visible face of one block removed a different one: measured in
// Chrome, `elementFromPoint` returned the wrong block's control both between
// two flush Market tiles in a bulk cell and between two Limits 16px apart on a
// price axis, and the click that followed destroyed the block the user was not
// aiming at. Spacing answered the first layout only - on a price axis a block's
// position IS its price, so there is none to give - so the invariant is
// containment, one geometry for both.
//
// This is the same contract `BLOCK_TILE_SHAPE` and `BLOCK_HEIGHT` are held to
// above, and for the same reason: jsdom computes no layout, so the two class
// lists that own these boxes are compared against each other here, and the
// geometry they produce is checked in a real browser. Both axes, because the
// control was offset on both. A negative offset on either, or a control grown
// past the tile, fails this.

/** The signed `<side>-<n>` inset a class list states, in pixels. */
const inset = (classes: string[], side: "top" | "right") => {
  const all = classes.join(" ");
  const match = all.match(new RegExp(`(?:^|\\s)(-?)${side}-(\\d+)(?:\\s|$)`));
  expect(match, `REMOVE_CONTROL_SHAPE no longer states a ${side}-<n>`).not.toBeNull();
  return (match![1] === "-" ? -1 : 1) * Number(match![2]) * TAILWIND_STEP_PX;
};

/** The `w-<n>`/`h-<n>` a class list states, in pixels. */
const size = (classes: string[], axis: "w" | "h") => {
  const match = classes.join(" ").match(new RegExp(`(?:^|\\s)${axis}-(\\d+)(?:\\s|$)`));
  expect(match, `no ${axis}-<n> in the class list`).not.toBeNull();
  return Number(match![1]) * TAILWIND_STEP_PX;
};

describe("the remove control's box against its own tile's box", () => {
  it("sits entirely inside the tile, on both axes", () => {
    const tileWidth = size(BLOCK_TILE_SHAPE, "w");
    const tileHeight = size(BLOCK_TILE_SHAPE, "h");
    const controlWidth = size(REMOVE_CONTROL_SHAPE, "w");
    const controlHeight = size(REMOVE_CONTROL_SHAPE, "h");
    const fromTop = inset(REMOVE_CONTROL_SHAPE, "top");
    const fromRight = inset(REMOVE_CONTROL_SHAPE, "right");

    expect(
      fromTop,
      "the remove control now hangs above the tile it belongs to, where it can cover the block above",
    ).toBeGreaterThanOrEqual(0);
    expect(
      fromRight,
      "the remove control now hangs past the right of the tile it belongs to, where it can cover the block beside it",
    ).toBeGreaterThanOrEqual(0);
    expect(
      fromTop + controlHeight,
      "the remove control now reaches below the tile it belongs to",
    ).toBeLessThanOrEqual(tileHeight);
    expect(
      fromRight + controlWidth,
      "the remove control now reaches past the left of the tile it belongs to",
    ).toBeLessThanOrEqual(tileWidth);
  });

  // The containment above is satisfied by a control of no size at all, and a
  // 24px target is the other half of what this affordance is: WCAG 2.2 SC 2.5.8
  // is what `w-6 h-6` is there for, and shrinking the control to buy back tile
  // was rejected.
  it("is still the 24px target the affordance was built around", () => {
    expect(size(REMOVE_CONTROL_SHAPE, "w")).toBe(24);
    expect(size(REMOVE_CONTROL_SHAPE, "h")).toBe(24);
  });
});
