// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ProviderColumn from "../../common/grid/ProviderColumn";
import { ORDER_TYPES } from "../../../data/orderTypes";
import { getBlockPositionerProps } from "../../../styles/grid";
import { createEmptyGrid } from "../../../utils";
import {
  columnPagerRow,
  columnsWrapper,
  contentRow,
  offPageColumn,
  pagedColumn,
  utilityRow,
} from "./strategyAssembly.styles";
import { utilitiesInAnyCondition } from "../../../test/tailwindTokens";

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
// The two grid columns are no longer part of the wrap that answered it. They
// stay side by side at every width and the panel shows one of them at a time,
// through a viewport `ColumnPager` moves; only the palette is a band below
// `sm`. What these tests hold is the pair of things that could each undo it:
// the columns' row being re-directed into a stack again, and that viewport
// being spelled as a scroller the user drives.
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

const expectNoScroller = (className: string) => {
  // A variant-prefixed scroller is the same box under some other condition, so
  // every leading `<variant>:` segment comes off first - `max-sm:` and stacked
  // ones like `sm:hover:` included - and the utility underneath is what is
  // judged. `utilitiesInAnyCondition` is the shared owner of that strip; it
  // leaves a bracketed arbitrary value intact, which a greedy one did not, so
  // `[overflow-x:auto]` reaches the matcher below rather than arriving as
  // `auto]` and matching nothing.
  for (const utility of utilitiesInAnyCondition(className)) {
    expect(utility).not.toMatch(
      /^(overflow(-x|-y)?-(auto|scroll)$|\[overflow(-x|-y)?:(auto|scroll)\])/,
    );
  }
};

describe("the assembly grid's lanes", () => {
  it("puts the palette above the columns when the panel is too narrow", () => {
    const classes = contentRow.split(/\s+/);

    expect(classes).toContain("flex-col");
    expect(classes).toContain("sm:flex-row");
    // The app's chrome wraps and never scrolls: a horizontal scrollport is a
    // box whose height depends on the platform's scrollbar, and it clips the
    // focus rings of the controls inside it. See `AGENTS.md`.
    expectNoScroller(contentRow);
  });

  it("keeps the Entry and Exit columns side by side at every width", () => {
    const classes = columnsWrapper.split(/\s+/);

    // Never re-directed. The pair is what the user is being shown one of, and
    // a column of two is not a pair beside each other - it is the stack this
    // replaced, which put the Exit column a phone screen below the palette.
    expect(classes).toContain("flex-row");
    expect(classes).not.toContain("flex-col");
    expect(classes).not.toContain("sm:flex-col");
    // Above `sm` both fit, and the row is a flex item sharing the pane.
    expect(classes).toContain("sm:flex-1");
    expect(classes).not.toContain("flex-1");
  });

  it("pages the columns with a viewport the user cannot scroll", () => {
    const classes = columnsWrapper.split(/\s+/);

    // `hidden` and not `auto`: a scroll container the user cannot drive draws
    // no scrollbar on any platform, so it can neither grow by a classic bar's
    // gutter nor be scrolled to a column the pager does not know about. That is
    // what gives "which column is on screen" one owner. `expectNoScroller` is
    // the other half and is asserted rather than assumed here.
    //
    // Both axes, and `overflow-x-hidden` is specifically not enough: one axis
    // set to anything but `visible` makes the other's `visible` compute to
    // `auto`, so naming only the axis that pages leaves a real vertical
    // scrollport whose bar would eat width from the paged column the day
    // anything bounds this box's height. `expectNoScroller` cannot catch that -
    // it judges the utilities written, and the computed axis is not one.
    expect(classes).toContain("overflow-hidden");
    expect(classes).not.toContain("overflow-x-hidden");
    expect(classes).toContain("sm:overflow-visible");
    expectNoScroller(columnsWrapper);
  });

  it("gives each column the viewport's whole width while it is paged", () => {
    const classes = pagedColumn.split(/\s+/);

    // Refusing to shrink is what makes the pair overflow the viewport rather
    // than squeezing into it - two 220px columns and a gap need 446px against a
    // 288px panel at 320, and a squeezed column clips its own price chip. It
    // gives that up from `sm`, where both fit and the row shares itself out.
    expect(classes).toContain("shrink-0");
    expect(classes).toContain("sm:shrink");
  });

  it("takes the off-page column out of reach while still drawing it", () => {
    const classes = offPageColumn.split(/\s+/);

    // The peeking column is DRAWN - 20% of it shows past the viewport's edge as
    // a cue that there is more to view - so "can the user see it" and "may a
    // drop land in it" are no longer one fact, and this is the one that answers
    // the second. `pointer-events: none` takes it out of hit testing, is
    // inherited so one computed read per cell covers the whole column, and is
    // written by a breakpoint so it says nothing above `sm`, where both columns
    // are drawn and reachable. `cellBoxesFromDom` reads exactly this.
    expect(classes).toContain("pointer-events-none");
    expect(classes).toContain("sm:pointer-events-auto");

    // It must NOT hide the column. A hidden element cannot hold focus, so the
    // pager would drop focus to `<body>` whenever it hid the column the focused
    // element lived in - the defect the focus hand-offs failed to close, which
    // drawing the column is what removes.
    expect(classes).not.toContain("invisible");
    expect(classes).not.toContain("hidden");
  });

  it("withholds the whole off-page column, not only the box the class is on", () => {
    // Inheritance carries `pointer-events: none` to everything that declares
    // nothing of its own, which is every cell - and one thing that is not.
    // `getBlockPositionerProps` draws a block on a price axis inside a strip
    // that is `pointer-events-none` with `*:pointer-events-auto` opting the
    // tile back in, and an explicit declaration beats an inherited value: the
    // tile stayed tappable and draggable inside the peeking sliver, so a press
    // there reached a block in the column the panel is not showing. Only direct
    // interaction with a block leaked - `cellBoxesFromDom` reads the CELL,
    // which does inherit - which is why the guard is written against these two
    // constants together rather than against the drop resolver.
    const offPage = offPageColumn.split(/\s+/);
    const positioner = getBlockPositionerProps(25).className.split(/\s+/);

    // The opt-in this has to beat. If it ever goes, the rule below is no longer
    // answering anything and this test should be revisited rather than deleted.
    expect(positioner).toContain("*:pointer-events-auto");

    // `:is(&)` repeats the class in the compound, so the subtree rule lands at
    // (0,2,0) against the opt-in's (0,1,0) and wins by specificity. A plain
    // `[&_*]` would tie and be settled by whichever utility Tailwind emitted
    // second, which is not a rule at all.
    expect(offPage).toContain("max-sm:[&:is(&)_*]:pointer-events-none");

    // And no `sm:` counterpart, ever. Reversing a subtree rule declares `auto`
    // on every descendant, which at that specificity would beat the
    // positioner's own `pointer-events-none` and make a strip spanning each
    // cell a hit target at every width above `sm`.
    for (const utility of offPage) {
      expect(utility).not.toMatch(/^sm:\[.*_\*\]:pointer-events-/);
    }
  });

  it("insets the pager so its focus rings are inside the pane that clips them", () => {
    const classes = columnPagerRow.split(/\s+/);

    // The grid pane carries no horizontal padding, so a lane is flush with the
    // panel's content edge - and the panel clips there. A lane's own focusable
    // children are inset within it; a `flex-1` button in a flush row is not.
    // Measured at 390 with the Exit button focused, its box ended at x 374
    // against a clip at 374 and the ring's whole right segment (2px outline at
    // a 2px offset, so x 376..378) was drawn nowhere.
    expect(classes).toContain("px-2");
    // Not a flex item of `contentRow` at all above `sm`, which is what keeps
    // the desktop row the two-lane row it has always been, to the pixel.
    expect(classes).toContain("sm:hidden");
  });

  it("wraps the action bar rather than clipping Execute Trade", () => {
    const classes = utilityRow.split(/\s+/);

    // Clear All and Reverse come to 219px beside a 203px Execute Trade, against
    // 326px of bar at a 390px viewport. Unwrapped, Execute Trade was drawn at
    // x 267.5..470.8 and the panel's `overflow-hidden` clipped the last 80.8px
    // of it: the button that submits the strategy could not be pressed.
    expect(classes).toContain("flex-wrap");
    expectNoScroller(utilityRow);
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

  it("lays the orders out across the panel when it is a band", () => {
    renderPalette();
    const classes = tileLayout();

    // Below `sm` the palette is a band the panel's width rather than the
    // left-hand lane, so its tiles run across it. A column of nine would push
    // the Entry column most of a phone screen down before it started.
    expect(classes).toContain("grid");
    expect(
      classes.some((c) => c.startsWith("grid-cols-[repeat(auto-fill")),
    ).toBe(true);
    // The scroll belongs to the lane form alone: as a band, the palette's height
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
