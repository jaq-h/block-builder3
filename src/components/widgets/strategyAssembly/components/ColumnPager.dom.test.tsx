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

const renderPager = (visibleColumn = 0, isCarrying = false) => {
  const onShowColumn = vi.fn();
  render(
    <ColumnPager
      visibleColumn={visibleColumn}
      isCarrying={isCarrying}
      onShowColumn={onShowColumn}
    />,
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

  it("asks for the column whose button was pressed", () => {
    const { onShowColumn } = renderPager(0);

    fireEvent.click(screen.getByRole("button", { name: "Exit" }));

    expect(onShowColumn).toHaveBeenCalledWith(1);
  });

  // ───────────────────────────────────────────────────────────────────
  // WHILE A BLOCK IS IN HAND, THESE BUTTONS TAKE NO FOCUS
  // ───────────────────────────────────────────────────────────────────
  //
  // The whole reason is on the component. In one line: focus resting here
  // during a carry is a block nobody can put down, because every carry key
  // lives on a palette tile or a block - so the control is put out of reach
  // rather than the focus being moved back afterwards.

  it("is an ordinary tab stop while nothing is carried", () => {
    renderPager(0, false);

    for (const name of ["Entry", "Exit"]) {
      expect(screen.getByRole("button", { name })).not.toHaveAttribute(
        "tabindex",
      );
    }
  });

  it("leaves the tab order while a block is in hand", () => {
    renderPager(0, true);

    for (const name of ["Entry", "Exit"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "tabindex",
        "-1",
      );
    }
  });

  it("refuses the focus a press would otherwise take, while carrying", () => {
    renderPager(0, true);

    // Preventing the `pointerdown` default is what suppresses the implicit
    // focus a press gives a button on Chrome and on every keyboard
    // activation. `fireEvent` reports back whether the default survived.
    const pressed = fireEvent.pointerDown(
      screen.getByRole("button", { name: "Exit" }),
    );

    expect(pressed).toBe(false);
  });

  it("takes the focus a press gives it while nothing is carried", () => {
    renderPager(0, false);

    const pressed = fireEvent.pointerDown(
      screen.getByRole("button", { name: "Exit" }),
    );

    expect(pressed).toBe(true);
  });

  it("still pages on a press that took no focus", () => {
    const { onShowColumn } = renderPager(0, true);
    const exit = screen.getByRole("button", { name: "Exit" });

    // Not focusable is not not operable: the press still pages, which is the
    // whole point of suppressing the focus rather than disabling the button.
    fireEvent.pointerDown(exit);
    fireEvent.pointerUp(exit);
    fireEvent.click(exit);

    expect(onShowColumn).toHaveBeenCalledWith(1);
  });
});
