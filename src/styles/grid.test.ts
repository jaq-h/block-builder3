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
          // read back as 31.96%, so every drag jumped on its first move.
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
