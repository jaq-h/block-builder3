import { describe, it, expect } from "vitest";

import { BLOCK_TILE_SHAPE } from "./blockTile";
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
