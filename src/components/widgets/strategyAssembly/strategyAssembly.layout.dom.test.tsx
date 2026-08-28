// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ProviderColumn from "../../common/grid/ProviderColumn";
import { ORDER_TYPES } from "../../../data/orderTypes";
import { createEmptyGrid } from "../../../utils";
import {
  columnsWrapper,
  contentRow,
  utilityRow,
} from "./strategyAssembly.styles";

// =============================================================================
// THE GRID PANE'S THREE LANES, AND WHAT HAPPENS WHEN THEY DO NOT FIT
// =============================================================================
//
// The order palette, the Entry column and the Exit column give the row a
// min-content width of 542px - the palette's 90px min-width (`sm:min-w-22.5`,
// not its 110px preferred `sm:w-27.5`), two columns that cannot go under
// `min-w-[220px]` without clipping their own price chips, and two 6px gaps.
// Below `lg` the panel is the viewport less 32px, so the row stops fitting at a
// 574px viewport. It used to be drawn anyway: measured in Chrome at 320, 360
// and 390 the lanes collapsed to that 542px - the palette squeezed 20px below
// its preferred width - and the Exit column sat at x 347..549 in all three,
// entirely outside the viewport and reachable only through a scroller with no
// visible bar. A conditional strategy needs both an Entry and an Exit leg, so
// the app's core task could not be completed on a phone at all.
//
// WHAT THESE TESTS ARE: assertions about the utilities the components ask for.
// jsdom applies no author stylesheet and does no layout, so none of them can
// see a media query resolve or a box get drawn. The pixel evidence is browser
// measurement, recorded in the commit message and in `AGENTS.md`.
//
// WHAT THEY DO NOT PROVE: anything about what the browser draws. They would go
// red on a behaviour-preserving rewrite - a different breakpoint, or the same
// two forms expressed in a stylesheet - and they would stay green if the panel
// regressed for a reason outside these constants.
//
// They stay because they are the only executable guard that the thing this
// change deliberately ruled out cannot come back: answering a row that does not
// fit with a horizontal scroller rather than with a wrap.

const expectNoScroller = (classes: string[]) => {
  // A variant-prefixed scroller is the same box under some other condition, so
  // every leading `<variant>:` segment comes off first - `max-sm:` and stacked
  // ones like `sm:hover:` included - and the utility underneath is what is
  // judged.
  for (const cls of classes) {
    expect(cls.replace(/^.*:/, "")).not.toMatch(
      /^overflow(-x|-y)?-(auto|scroll)$/,
    );
  }
};

describe("the assembly grid's lanes", () => {
  it("stacks the three lanes when the panel is too narrow for them", () => {
    const classes = contentRow.split(/\s+/);

    expect(classes).toContain("flex-col");
    expect(classes).toContain("sm:flex-row");
    // The app's chrome wraps and never scrolls: a horizontal scrollport is a
    // box whose height depends on the platform's scrollbar, and it clips the
    // focus rings of the controls inside it. See `AGENTS.md`.
    expectNoScroller(classes);
  });

  it("stacks the Entry and Exit columns with them", () => {
    const classes = columnsWrapper.split(/\s+/);

    expect(classes).toContain("flex-col");
    expect(classes).toContain("sm:flex-row");
    // Stacked, the two columns take their height from their cells. A `flex-1`
    // that applied in the column direction too would give them a `0%` basis in
    // a height nothing above has fixed.
    expect(classes).toContain("sm:flex-1");
    expect(classes).not.toContain("flex-1");
    expectNoScroller(classes);
  });

  it("wraps the action bar rather than clipping Execute Trade", () => {
    const classes = utilityRow.split(/\s+/);

    // Clear All and Reverse come to 219px beside a 203px Execute Trade, against
    // 326px of bar at a 390px viewport. Unwrapped, Execute Trade was drawn at
    // x 267.5..470.8 and the panel's `overflow-hidden` clipped the last 80.8px
    // of it: the button that submits the strategy could not be pressed.
    expect(classes).toContain("flex-wrap");
    expectNoScroller(classes);
  });
});

describe("the order palette", () => {
  const renderPalette = () =>
    render(
      <ProviderColumn
        providerBlocks={ORDER_TYPES}
        hoveredGridCell={null}
        isDragging={false}
        grid={createEmptyGrid()}
        strategyPattern="conditional"
        onProviderDragStart={vi.fn()}
        onProviderDragEnd={vi.fn()}
        onProviderDragCancel={vi.fn()}
        onProviderDragAborted={vi.fn()}
        onProviderDragRecognised={vi.fn()}
        onProviderMouseEnter={vi.fn()}
        onProviderMouseLeave={vi.fn()}
        onProviderActivate={vi.fn()}
        onCommandMove={vi.fn()}
        onCommandCancel={vi.fn()}
        carryingType={null}
        focusType={null}
        onFocusHandled={vi.fn()}
      />,
    );

  /** The element the order tiles are laid out in. */
  const tileLayout = () => {
    const palette = screen.getByRole("group", { name: "Order types" });
    const layout = palette.lastElementChild;
    expect(layout).not.toBeNull();
    return (layout as HTMLElement).className.split(/\s+/);
  };

  it("lays the orders out across the panel when the lanes are stacked", () => {
    renderPalette();
    const classes = tileLayout();

    // Stacked, the palette is a band the panel's width rather than the
    // left-hand lane, so its tiles run across it. A column of nine would push
    // the Entry column most of a phone screen down before it started.
    expect(classes).toContain("grid");
    expect(classes.some((c) => c.startsWith("grid-cols-[repeat(auto-fill"))).toBe(
      true,
    );
    // The scroll belongs to the lane form alone: stacked, the palette's height
    // is its content's, so a scrollport would have nothing to scroll and would
    // only clip the tiles' focus rings.
    expect(classes).not.toContain("overflow-auto");
    expect(classes).toContain("sm:overflow-auto");
  });

  it("is the left-hand lane again once the panel is wide enough", () => {
    renderPalette();
    const classes = tileLayout();

    expect(classes).toContain("sm:flex");
    expect(classes).toContain("sm:flex-col");
  });
});
