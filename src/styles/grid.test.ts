import { describe, it, expect } from "vitest";
import {
  BLOCK_HEIGHT,
  SCALE_CONFIG,
  getBlockPositionerProps,
  getBlockTopPx,
  positionFromPointer,
} from "./grid";

// =============================================================================
// HARNESS
// =============================================================================

const TRACK_TOP = 400;
const TRACK_HEIGHT = 181.5;

/** Every yPosition worth checking, including both ends of the axis. */
const POSITIONS = [0, 0.5, 7.25, 12.5, 25, 37.5, 49.5, SCALE_CONFIG.MAX_PERCENT];

/**
 * Where the rendered block's centre lands, in viewport coordinates: the
 * positioner's `top` is relative to the axis column, and the block is
 * BLOCK_HEIGHT tall.
 */
const renderedCentre = (yPosition: number, isDescending: boolean) =>
  TRACK_TOP +
  getBlockTopPx(yPosition, TRACK_HEIGHT, isDescending) +
  BLOCK_HEIGHT / 2;

/**
 * Resolve the positioner's generated CSS `top` for a concrete container height.
 * The declaration is the renderer's real output - the value the browser's
 * layout engine consumes - so it is parsed into its three parts rather than
 * matched as text.
 */
const resolveTop = (top: string, elementHeight: number): number => {
  const parts = /^calc\(calc\(100% - ([\d.]+)px\) \* ([\d.]+) \+ ([\d.]+)px\)$/.exec(
    top,
  );
  if (!parts) throw new Error(`unrecognised positioner top: ${top}`);
  const [, inset, percent, offset] = parts;
  return (elementHeight - Number(inset)) * Number(percent) + Number(offset);
};

// =============================================================================
// TESTS
// =============================================================================

describe("track geometry", () => {
  describe("the drag mapping is the inverse of the render mapping", () => {
    for (const isDescending of [true, false]) {
      const scale = isDescending ? "descending" : "ascending";

      it(`round-trips every position on a ${scale} axis`, () => {
        for (const yPosition of POSITIONS) {
          const centre = renderedCentre(yPosition, isDescending);
          const readBack = positionFromPointer(
            { top: TRACK_TOP, height: TRACK_HEIGHT },
            centre,
            isDescending,
          );

          // Before the two sides shared this mapping, a block drawn at 25.00%
          // and grabbed on its own centre was measured in Chrome reading back as
          // 31.98%, so every drag jumped on its first move. That number is the
          // measurement, not a derivation - do not recompute it.
          expect(readBack).toBeCloseTo(yPosition, 6);
        }
      });
    }

    it("agrees with the CSS the positioner actually emits", () => {
      for (const isDescending of [true, false]) {
        for (const yPosition of POSITIONS) {
          const { style } = getBlockPositionerProps(yPosition, isDescending);

          expect(resolveTop(String(style.top), TRACK_HEIGHT)).toBeCloseTo(
            getBlockTopPx(yPosition, TRACK_HEIGHT, isDescending),
            6,
          );
        }
      }
    });
  });

  describe("positionFromPointer", () => {
    it("clamps a pointer past either end of the track to the axis ends", () => {
      const track = { top: TRACK_TOP, height: TRACK_HEIGHT };

      expect(positionFromPointer(track, TRACK_TOP - 500, true)).toBe(0);
      expect(positionFromPointer(track, TRACK_TOP + 5000, true)).toBe(
        SCALE_CONFIG.MAX_PERCENT,
      );
      expect(positionFromPointer(track, TRACK_TOP - 500, false)).toBe(
        SCALE_CONFIG.MAX_PERCENT,
      );
      expect(positionFromPointer(track, TRACK_TOP + 5000, false)).toBe(0);
    });

    it("reports the market price itself for a track too short to draw", () => {
      // An unmounted or collapsed cell has no track to divide by.
      expect(
        positionFromPointer({ top: TRACK_TOP, height: 0 }, TRACK_TOP, true),
      ).toBe(0);
    });
  });
});

// =============================================================================
// THE POSITIONER CENTRES THE BLOCK IT PLACES, AND THAT IS LOAD-BEARING
// =============================================================================
//
// The positioner spans the whole axis column - it sets BOTH `left` and `right`,
// so it is nothing like tile-sized - and `GridCell` renders `Block` inside it.
// `Block`'s own wrapper is therefore tile-sized for exactly one reason: this
// element is a centring flex container, which makes that wrapper a shrink-
// wrapped flex item.
//
// That is what the Remove control's containment rests on in this layout. The
// control is pinned `top-0 right-0` INSIDE the tile, but those offsets resolve
// against `Block`'s wrapper, so the moment the wrapper stops being a flex item
// it becomes a block-level box filling the column and `right-0` puts a
// DESTRUCTIVE control at the column's edge - clear of the 40px tile, over the
// price label and the neighbouring axis - while every class-list token
// `blockTile.test.ts` reads and every token on the wrapper itself stays
// unchanged. `blockTile.test.ts`'s REACH paragraph names this as half 3b of the
// wrapper-equals-tile assumption; this is the half of it that lives here.
//
// It asserts the declared display and alignment, which is this function's own
// output contract. What it cannot do is measure the boxes that follow - that is
// a browser's job, and hole 4 of the same paragraph says so.

describe("the positioner centres a shrink-wrapped child", () => {
  it("declares a flex container that centres what GridCell puts in it", () => {
    const tokens = getBlockPositionerProps(25, false).className.split(/\s+/);

    expect(
      tokens,
      "the positioner is no longer a flex container, so Block's wrapper fills the axis column and the remove control leaves its tile",
    ).toContain("flex");
    expect(
      tokens,
      "the positioner no longer centres its child, so Block's wrapper is not laid out at the tile's position",
    ).toContain("justify-center");
  });

  // The span is why the centring matters: a positioner only as wide as the tile
  // would make the question moot, and this is what says it is not.
  it("spans the column rather than shrinking to the block", () => {
    const { style } = getBlockPositionerProps(25, false);

    expect(style.left).toBeDefined();
    expect(style.right).toBeDefined();
    expect(style.width).toBeUndefined();
  });
});
