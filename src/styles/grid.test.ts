import { describe, it, expect } from "vitest";
import {
  BLOCK_HEIGHT,
  SCALE_CONFIG,
  getAxisColumnProps,
  getBlockPositionerProps,
  getBlockTopPx,
  positionFromPointer,
  sliderArea,
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

// =============================================================================
// THE AXIS COLUMN'S HEIGHT COMES FROM STRETCH, NEVER FROM A PERCENTAGE
// =============================================================================
//
// Everything the price axis draws is positioned against the axis column and
// nothing else: the track and the percentage scale are `top`/`bottom` insets on
// it, and `getBlockPositionerProps` lays a block out at
// `calc((100% - TRACK_INSETpx) * percent)` within it. So one collapsed height
// is not one defect, it is the whole axis at once.
//
// It carried `h-full`, and a percentage height needs a definite height to
// resolve against. The chain above it is only definite while the grid columns
// are flex items of a ROW; stacked below `sm` for the phone layout they are
// items of a column with no definite height, because below `lg` the shell is
// deliberately content-sized. `height: 100%` resolved to 0, and since every
// child of this box is absolutely positioned there was no content to fall back
// on. Measured in Chrome with a Limit in the Entry primary cell: the axis
// column and the track stood at 150px/80px at 640 and above, and at 0px/0px at
// 320, 360, 390 and 414 - no track to grab, the scale clumped into 60px, and
// the offset mapped onto a NEGATIVE 70px range, which drew the block above the
// market line and ran it the wrong way.
//
// `align-items: stretch` sizes it now. It is the default for a flex item and
// `sliderArea` is a `flex-row` whose cross axis IS this height, so it needs no
// definite parent height and holds in both forms of the layout.
//
// The fact has TWO owners, so both are guarded below: the child must not state
// a height or opt out of the stretch, and `sliderArea` must stay the flex row
// that supplies one. A column parent, or a parent that stopped being a flex
// container, collapses this box exactly as `h-full` did.
//
// WHAT THESE TESTS ARE: assertions about the utilities the two owners ask for.
// jsdom applies no author stylesheet and lays nothing out, so none of them can
// watch a height resolve; the pixel evidence is the browser measurement above.
// What they CAN hold is that the token whose collapse caused this cannot come
// back under any variant, that no pixel height is substituted for it - the axis
// is a proportion of whatever height the cell has, so a number here would be a
// second owner of `CELL_MIN_HEIGHT`'s job - and that the parent still stretches
// its children along the axis that IS this height.
//
// WHAT THEY DO NOT REACH: the third half of the invariant, that the axis column
// is `sliderArea`'s DIRECT child. Wrapping `renderAxisContent`'s output in an
// extra div inside `GridCell` or `ReadOnlyGridCell` puts an unstretched box
// between the two and re-collapses the axis with both owners' class lists
// untouched. That is a component-structure fact no token test can see, and
// since jsdom draws nothing no rendering test can see the collapse either, so
// nothing here pretends to cover it. They would also go red on a
// behaviour-preserving rewrite - the same two boxes expressed in a stylesheet -
// and stay green if the axis collapsed for a reason outside these constants.

/**
 * A variant-prefixed utility is the same declaration under some other
 * condition, so every leading `<variant>:` segment comes off before the utility
 * underneath is judged - `sm:h-full`, `lg:min-h-0` and stacked ones like
 * `sm:hover:h-full` included. This follows `expectNoScroller` in
 * `strategyAssembly.layout.dom.test.tsx`, which strips them for the same
 * reason.
 */
const utilitiesOf = (className: string) =>
  className.split(/\s+/).map((token) => token.replace(/^.*:/, ""));

describe("the axis column's height", () => {
  // Both shapes: a single-axis order type gets `flex-1`, a dual-axis leg gets
  // `flex-none w-1/2`. Neither may state a height.
  for (const isSingleAxis of [true, false]) {
    const shape = isSingleAxis ? "single-axis" : "dual-axis";

    it(`takes no height of its own in the ${shape} form`, () => {
      for (const utility of utilitiesOf(getAxisColumnProps(isSingleAxis))) {
        // `size-*` sets a height as well as a width, so it collapses this box
        // identically while sliding past a height-only matcher.
        expect(
          utility,
          "the axis column is asking for a height again; a percentage collapses to 0 wherever the grid columns are stacked, which takes the track, the scale and the block position with it",
        ).not.toMatch(/^((min|max)-)?(h|size)-/);
      }
    });

    it(`stays a flex item its parent can stretch in the ${shape} form`, () => {
      // `sliderArea` is a `flex-row`, so stretch is what supplies the height.
      // A `self-start`/`self-end`/`self-center` here would opt out of it and
      // collapse the box just as `h-full` did.
      for (const utility of utilitiesOf(getAxisColumnProps(isSingleAxis))) {
        expect(
          utility,
          "the axis column has opted out of the stretch that gives it its height",
        ).not.toMatch(/^(place-)?self-(start|end|center|baseline)$/);
      }
    });
  }
});

describe("the box that stretches the axis column", () => {
  it("stays a flex row, so its cross axis is the height it supplies", () => {
    const utilities = utilitiesOf(sliderArea);

    // Stretch only supplies a height while the cross axis IS the height. As a
    // column, or as no flex container at all, `sliderArea` gives the axis
    // column nothing to be stretched to and the whole axis reads zero again.
    expect(
      utilities,
      "sliderArea is no longer a flex container, so it stretches nothing and the price axis has no height",
    ).toContain("flex");
    expect(
      utilities,
      "sliderArea is no longer a row, so its cross axis is the width and the price axis has no height",
    ).toContain("flex-row");
    for (const utility of utilities) {
      expect(
        utility,
        "sliderArea has been turned into a column; stretch then supplies a width and the price axis collapses to 0",
      ).not.toMatch(/^flex-col(-reverse)?$/);
    }
  });

  it("does not opt its children out of the stretch", () => {
    for (const utility of utilitiesOf(sliderArea)) {
      expect(
        utility,
        "sliderArea has aligned its children instead of stretching them, which takes the price axis' height away just as h-full did",
      ).not.toMatch(/^items-(start|end|center|baseline)$/);
    }
  });
});
