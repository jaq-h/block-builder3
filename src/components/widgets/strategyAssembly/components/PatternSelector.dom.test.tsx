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
// `src/index.css` sat outside a cascade layer and beat both utilities, by
// nothing at all as rendered. These assertions pin what replaced it: a name, a
// programmatic pressed state, and a mark that survives with no colour.
//
// The reset is inside `@layer base` now, so the accent border paints on its own
// and the `data-unstyled` opt-out this component used to carry is gone. That the
// stylesheet keeps it layered is pinned by `vite/buttonResetLayer.test.ts`,
// because jsdom applies no author stylesheet and cannot see a cascade.

const renderSelector = (pattern: StrategyPattern = "conditional") => {
  const setStrategyPattern = vi.fn();
  render(
    <GridDataContext.Provider
      value={{
        grid: createEmptyGrid(),
        orderConfig: {},
        strategyPattern: pattern,
        setGrid: vi.fn(),
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

  it("hangs the label between two equal slots, on both buttons", () => {
    renderSelector("bulk");

    // Two properties at once, and the selected and unselected button are both
    // here: the label sits between a slot and its mirror, with nothing outside
    // them, so it does not move when the tick appears in the leading slot and it
    // keeps the row's centre line rather than riding to one side of it.
    for (const name of [/Bulk Order/, /Conditional Order/]) {
      const row = screen.getByRole("button", { name }).firstElementChild!;
      const label = Array.from(row.children).find((child) =>
        /Order$/.test(child.textContent ?? ""),
      );

      expect(label).toBeDefined();
      const leading = label!.previousElementSibling;
      const trailing = label!.nextElementSibling;

      expect(leading).not.toBeNull();
      expect(trailing).not.toBeNull();
      expect(leading!.previousElementSibling).toBeNull();
      expect(trailing!.nextElementSibling).toBeNull();
      expect(trailing!.className).toBe(leading!.className);
      expect(leading!.textContent).toBe("");
      expect(trailing!.textContent).toBe("");
    }
  });

  it("switches the assembly type when a button is chosen", async () => {
    const { setStrategyPattern } = renderSelector("conditional");

    await userEvent.click(screen.getByRole("button", { name: /Bulk Order/ }));

    expect(setStrategyPattern).toHaveBeenCalledWith("bulk");
  });
});
