// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import PatternSelector from "./PatternSelector";
import { GridDataContext } from "../contexts/GridDataContext";
import { createEmptyGrid } from "@utils/grid";
import type { StrategyPattern } from "@/types/grid";

// The selected assembly type used to be conveyed by a border colour and a fill
// colour and nothing else - and, because the bare `button` reset in
// `src/index.css` sits outside a cascade layer and beat both utilities, by
// nothing at all as rendered. These assertions pin what replaced it: a name, a
// programmatic pressed state, a mark that survives with no colour, and the
// `data-unstyled` opt-out without which the accent border still would not paint.
// The opt-out's other half - the `:not(...)` in the stylesheet - is pinned by
// `vite/buttonResetScope.test.ts`, because jsdom cannot see a cascade.

const renderSelector = (pattern: StrategyPattern = "conditional") => {
  const setStrategyPattern = vi.fn();
  render(
    <GridDataContext.Provider
      value={{
        grid: createEmptyGrid(),
        orderConfig: {},
        strategyPattern: pattern,
        setGrid: vi.fn(),
        setOrderConfig: vi.fn(),
        setStrategyPattern,
        clearAll: vi.fn(),
        reverseBlocks: vi.fn(),
      }}
    >
      <PatternSelector />
    </GridDataContext.Provider>,
  );
  return { setStrategyPattern };
};

describe("PatternSelector", () => {
  it("names the group and both assembly types", () => {
    renderSelector();

    const group = screen.getByRole("group", { name: "Order assembly type" });
    const names = within(group)
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(names).toEqual([
      "Conditional OrderPrimary order with stop-loss/take-profit",
      "Bulk OrderMultiple independent orders",
    ]);
  });

  it("announces which assembly type is in use through aria-pressed", () => {
    renderSelector("bulk");

    expect(
      screen.getByRole("button", { name: /Conditional Order/ }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Bulk Order/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("marks the selected type with a glyph, not with colour alone", () => {
    renderSelector("bulk");

    const selected = screen.getByRole("button", { name: /Bulk Order/ });
    const unselected = screen.getByRole("button", { name: /Conditional Order/ });

    expect(selected.querySelector("svg")).not.toBeNull();
    expect(unselected.querySelector("svg")).toBeNull();
  });

  it("keeps the mark's slot on both buttons so the label does not shift", () => {
    renderSelector("bulk");

    for (const name of [/Bulk Order/, /Conditional Order/]) {
      const button = screen.getByRole("button", { name });
      // The label is the second child of the row: the marker slot is the first,
      // whether or not it currently holds the tick.
      const row = button.firstElementChild!;
      expect(row.children).toHaveLength(2);
      expect(row.children[1]!.textContent).toMatch(/Order$/);
    }
  });

  it("opts both buttons out of the unlayered button reset", () => {
    renderSelector();

    for (const name of [/Bulk Order/, /Conditional Order/]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "data-unstyled",
      );
    }
  });

  it("switches the assembly type when a button is chosen", async () => {
    const { setStrategyPattern } = renderSelector("conditional");

    await userEvent.click(screen.getByRole("button", { name: /Bulk Order/ }));

    expect(setStrategyPattern).toHaveBeenCalledWith("bulk");
  });
});
