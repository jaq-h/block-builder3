import { describe, it, expect } from "vitest";

import { BLOCK_TILE_SHAPE, BLOCK_TILE_SIZE_PX } from "./blockTile";

// =============================================================================
// THE TILE'S SIZE, STATED TWICE AND CHECKED ONCE
// =============================================================================
//
// `BLOCK_TILE_SHAPE` is the tile's geometry as Tailwind classes, which is what
// the DOM needs; `BLOCK_TILE_SIZE_PX` is the same measurement as a number,
// which is what the drag overlay and the drop resolver need. Tailwind cannot
// take the number and the resolver cannot take the class, so the two coexist -
// and this is the only thing stopping them from drifting apart. A tile resized
// in the class list alone would leave every drop target hit-testing the old
// edges, which is invisible on screen and wrong on every drop near a boundary.

/** Tailwind's spacing step: `w-10` is 10 * 0.25rem, at the app's 16px root. */
const TAILWIND_STEP_PX = 4;

describe("the block tile's size", () => {
  it("matches the width and height its own class list asks for", () => {
    const classes = BLOCK_TILE_SHAPE.join(" ");
    const width = classes.match(/(?:^|\s)w-(\d+)(?:\s|$)/);
    const height = classes.match(/(?:^|\s)h-(\d+)(?:\s|$)/);

    expect(width, "BLOCK_TILE_SHAPE no longer states a w-<n>").not.toBeNull();
    expect(height, "BLOCK_TILE_SHAPE no longer states an h-<n>").not.toBeNull();

    expect(Number(width![1]) * TAILWIND_STEP_PX).toBe(BLOCK_TILE_SIZE_PX);
    expect(Number(height![1]) * TAILWIND_STEP_PX).toBe(BLOCK_TILE_SIZE_PX);
  });
});
