// @vitest-environment jsdom
//
// What is left of grid.ts that needs a document. `findCellAtPosition` was
// tested here and is gone: it asked whether the POINTER was inside a cell's
// rect, which is not what a user aims. Which cell a released block lands in is
// `utils/dropTarget.ts` now, tested in `dropTarget.test.ts` (pure, in node) and
// end to end in `GridArea.dom.test.tsx`.
//
// `findCellAndPositionData` was tested here before that and is also gone. It
// read a cell, an axis and a slider position off one drop, and two of those
// three were wrong: the position came from `calculateYPosition` on a 0-100
// scale while the axis runs to 50, and the axis was taken from which half of
// the cell the pointer was in without touching the block's matching `axes`. A
// drop resolves a cell and nothing else; the tests that pinned the other two
// are recorded in `grid.test.ts` under "POSITION MATHS".
import { describe, it, expect } from "vitest";

describe("grid.ts", () => {
  it("keeps no DOM-reading helper of its own", async () => {
    const grid = await import("@utils/grid");

    // The grid module owns the grid's structure - what is where, and which
    // cells will take an order. Hit-testing a pointer or a block against the
    // rendered page belongs to `dropTarget.ts`, and a second copy here is how
    // the target highlight and the drop came to disagree in the first place.
    expect(Object.keys(grid)).not.toContain("findCellAtPosition");
    expect(Object.keys(grid)).not.toContain("findCellAndPositionData");
  });
});
