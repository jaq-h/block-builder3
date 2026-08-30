// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

import ColumnPager from "./ColumnPager";

// The control that moves the user to the other grid column below `sm`, where
// the panel cannot draw both. What it does to a carry is `GridArea`'s to state
// and is pinned there, under "the column pager"; this file pins the control
// itself - the same three cues `PatternSelector` carries, because a selected
// state may never be drawn in colour alone.
//
// jsdom applies no author stylesheet, so nothing here sees the accent border.
// That is the cue this file cannot check and the other two are why it does not
// need to.

const renderPager = (visibleColumn = 0) => {
  const onShowColumn = vi.fn();
  render(
    <ColumnPager visibleColumn={visibleColumn} onShowColumn={onShowColumn} />,
  );
  return { onShowColumn };
};

const group = () => screen.getByRole("group", { name: "Grid column shown" });

describe("ColumnPager", () => {
  it("names the group and both columns", () => {
    renderPager();

    expect(
      within(group())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Entry", "Exit"]);
  });

  it("says which column is on screen through aria-pressed", () => {
    renderPager(1);

    expect(screen.getByRole("button", { name: "Entry" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Exit" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("marks the column on screen with a glyph, not with colour alone", () => {
    renderPager(1);

    expect(
      screen.getByRole("button", { name: "Exit" }).querySelector("svg"),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Entry" }).querySelector("svg"),
    ).toBeNull();
  });

  it("hangs the label between two equal slots, on both buttons", () => {
    renderPager(1);

    // The leading slot is what stops the label shifting as the tick appears;
    // the mirror is what keeps the label on the button's own centre line. Both
    // buttons carry both, so neither the selected nor the unselected one moves.
    for (const name of ["Entry", "Exit"]) {
      const button = screen.getByRole("button", { name });
      const [leading, trailing] = [
        button.firstElementChild!,
        button.lastElementChild!,
      ];

      expect(leading).not.toBe(trailing);
      expect(trailing.className).toBe(leading.className);
      expect(trailing.textContent).toBe("");
    }
  });

  it("asks for the column whose button was pressed, and hands over that button", () => {
    const { onShowColumn } = renderPager(0);
    const exit = screen.getByRole("button", { name: "Exit" });

    fireEvent.click(exit);

    // The element travels because the panel may have to put focus on it: a
    // press that takes the other column off screen has to leave focus
    // somewhere visible, and this button is where a browser that focuses what
    // it activates would have put it. See `GridArea`.
    expect(onShowColumn).toHaveBeenCalledWith(1, exit);
  });
});
