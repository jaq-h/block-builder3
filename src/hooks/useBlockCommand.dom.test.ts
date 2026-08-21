// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBlockCommand } from "./useBlockCommand";
import { clearGrid } from "@utils/grid";
import { ORDER_TYPES } from "@data/orderTypes";
import type { BlockData, GridData } from "@/types/grid";

// =============================================================================
// HARNESS
// =============================================================================

const limitBlock = (overrides: Partial<BlockData> = {}): BlockData => ({
  id: "b1",
  orderType: "limit",
  label: "Limit",
  abrv: "Lmt",
  allowedRows: [0, 1],
  axis: 2,
  yPosition: 25,
  direction: "upside",
  axes: ["limit"],
  ...overrides,
});

const setup = (grid: GridData = clearGrid(2, 3)) => {
  const placeProvider = vi.fn(() => "new-block-id");
  const moveBlock = vi.fn((id: string) => id);

  const view = renderHook(() =>
    useBlockCommand({
      grid,
      strategyPattern: "conditional",
      providerBlocks: ORDER_TYPES,
      placeProvider,
      moveBlock,
    }),
  );

  return { ...view, placeProvider, moveBlock };
};

const gridWithLimit = () => {
  const grid = clearGrid(2, 3);
  grid[0][1].push(limitBlock());
  return grid;
};

// =============================================================================
// TESTS
// =============================================================================

describe("useBlockCommand", () => {
  describe("picking up from the palette", () => {
    it("announces what was picked up and where it will land", () => {
      const { result } = setup();

      act(() => result.current.activateProvider("limit", "keyboard"));

      expect(result.current.carrying?.source).toEqual({
        kind: "provider",
        type: "limit",
        label: "Limit",
      });
      expect(result.current.announcement.text).toBe(
        "Picked up Limit order. Use the arrow keys to choose a cell, Enter to place, Escape to cancel. Target: Entry column, primary row.",
      );
    });

    it("gives a finger different instructions from a keyboard", () => {
      const { result } = setup();

      act(() => result.current.activateProvider("limit", "pointer"));

      expect(result.current.announcement.text).toContain(
        "Tap a highlighted cell to place it",
      );
    });

    it("refuses an order type with nowhere legal to go, and says so", () => {
      // A market order may only sit in the primary row, and both primary cells
      // are taken by the diagonal rule once a block is placed.
      const grid = clearGrid(2, 3);
      grid[0][1].push(limitBlock());
      const { result } = setup(grid);

      act(() => result.current.activateProvider("market", "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(result.current.announcement.text).toBe(
        "Market order cannot be placed anywhere in the grid right now.",
      );
    });

    it("swaps what is held when another order type is activated", () => {
      const { result } = setup();

      act(() => result.current.activateProvider("limit", "keyboard"));
      act(() => result.current.activateProvider("market", "keyboard"));

      expect(result.current.carrying?.source).toMatchObject({ type: "market" });
    });
  });

  describe("moving the target", () => {
    it("announces the new cell", () => {
      const { result } = setup();

      act(() => result.current.activateProvider("limit", "keyboard"));
      act(() => result.current.moveTarget(1, 0));

      expect(result.current.carrying?.target).toEqual({ col: 1, row: 1 });
      expect(result.current.announcement.text).toBe(
        "Exit column, primary row, ready to place.",
      );
    });

    it("says so when there is nothing that way, rather than going quiet", () => {
      const { result } = setup();

      act(() => result.current.activateProvider("limit", "keyboard"));
      act(() => result.current.moveTarget(-1, 0));

      expect(result.current.carrying?.target).toEqual({ col: 0, row: 1 });
      expect(result.current.announcement.text).toBe(
        "No cell available in that direction.",
      );
    });

    it("announces a repeated refusal a second time", () => {
      const { result } = setup();

      act(() => result.current.activateProvider("limit", "keyboard"));
      act(() => result.current.moveTarget(-1, 0));
      const first = result.current.announcement.sequence;
      act(() => result.current.moveTarget(-1, 0));

      // The sequence is what makes an unchanged message reach the live region.
      expect(result.current.announcement.sequence).toBe(first + 1);
    });

    it("does nothing while idle", () => {
      const { result } = setup();

      act(() => result.current.moveTarget(0, 1));

      expect(result.current.announcement.text).toBe("");
    });
  });

  describe("placing", () => {
    it("commits at the chosen cell and moves focus to what was placed", () => {
      const { result, placeProvider } = setup();

      act(() => result.current.activateProvider("limit", "keyboard"));
      act(() => result.current.moveTarget(1, 0));
      act(() => result.current.place());

      expect(placeProvider).toHaveBeenCalledWith("limit", { col: 1, row: 1 });
      expect(result.current.carrying).toBeNull();
      expect(result.current.focusRequest).toBe("new-block-id");
      expect(result.current.announcement.text).toBe(
        "Placed Limit order in Exit column, primary row.",
      );
    });

    it("places on Enter on the carried block", () => {
      const { result, placeProvider } = setup();

      act(() => result.current.activateProvider("limit", "keyboard"));
      act(() => result.current.activateProvider("limit", "keyboard"));

      expect(placeProvider).toHaveBeenCalledWith("limit", { col: 0, row: 1 });
    });

    it("puts the block back on a second tap instead of placing it", () => {
      const { result, placeProvider } = setup();

      act(() => result.current.activateProvider("limit", "pointer"));
      act(() => result.current.activateProvider("limit", "pointer"));

      expect(placeProvider).not.toHaveBeenCalled();
      expect(result.current.carrying).toBeNull();
      expect(result.current.announcement.text).toBe(
        "Cancelled. Limit order returned to the palette.",
      );
    });

    it("places into a tapped cell", () => {
      const { result, placeProvider } = setup();

      act(() => result.current.activateProvider("limit", "pointer"));
      act(() => result.current.activateCell({ col: 1, row: 1 }));

      expect(placeProvider).toHaveBeenCalledWith("limit", { col: 1, row: 1 });
    });

    it("refuses a tapped cell that cannot take the order", () => {
      const { result, placeProvider } = setup();

      act(() => result.current.activateProvider("limit", "pointer"));
      act(() => result.current.activateCell({ col: 0, row: 0 }));

      expect(placeProvider).not.toHaveBeenCalled();
      expect(result.current.carrying).not.toBeNull();
      expect(result.current.announcement.text).toBe(
        "Entry column, upper conditional row cannot take this order.",
      );
    });

    it("keeps focus somewhere real when the placement is rejected downstream", () => {
      const grid = clearGrid(2, 3);
      const view = renderHook(() =>
        useBlockCommand({
          grid,
          strategyPattern: "conditional",
          providerBlocks: ORDER_TYPES,
          placeProvider: () => null,
          moveBlock: () => null,
        }),
      );

      act(() => view.result.current.activateProvider("limit", "keyboard"));
      act(() => view.result.current.place());

      // Nothing was created, so focus returns to the palette entry rather than
      // being dropped on the body.
      expect(view.result.current.focusRequest).toBe("limit");
    });
  });

  describe("carrying a block that is already on the grid", () => {
    it("starts on the block's own cell", () => {
      const { result } = setup(gridWithLimit());

      act(() => result.current.activateBlock("b1", "keyboard"));

      expect(result.current.carrying?.source).toEqual({
        kind: "grid",
        id: "b1",
        label: "Limit",
        origin: { col: 0, row: 1 },
      });
      expect(result.current.carrying?.target).toEqual({ col: 0, row: 1 });
    });

    it("moves it to the diagonal the placement rule allows", () => {
      const { result, moveBlock } = setup(gridWithLimit());

      act(() => result.current.activateBlock("b1", "keyboard"));
      act(() => result.current.moveTarget(1, 0));
      act(() => result.current.place());

      // With this block in the Entry primary cell, the only other legal cell
      // is the Exit upper conditional - a diagonal.
      expect(moveBlock).toHaveBeenCalledWith("b1", { col: 1, row: 0 });
      expect(result.current.focusRequest).toBe("b1");
    });

    it("can put the block back in its own cell", () => {
      const { result, moveBlock } = setup(gridWithLimit());

      act(() => result.current.activateBlock("b1", "keyboard"));
      act(() => result.current.place());

      // Its own cell reads as occupied to the placement rules, so it has to be
      // added back deliberately - otherwise a pick-up could never be undone
      // with Enter, only with Escape.
      expect(moveBlock).toHaveBeenCalledWith("b1", { col: 0, row: 1 });
    });

    it("says where the block was left when the carry is cancelled", () => {
      const { result } = setup(gridWithLimit());

      act(() => result.current.activateBlock("b1", "keyboard"));
      act(() => result.current.cancel());

      expect(result.current.carrying).toBeNull();
      expect(result.current.focusRequest).toBe("b1");
      expect(result.current.announcement.text).toBe(
        "Cancelled. Limit block left in Entry column, primary row.",
      );
    });

    it("leaves another block alone while one is being carried", () => {
      const grid = gridWithLimit();
      grid[1][0].push(limitBlock({ id: "b2", label: "Take Profit" }));
      const { result, moveBlock } = setup(grid);

      act(() => result.current.activateBlock("b1", "keyboard"));
      act(() => result.current.activateBlock("b2", "keyboard"));

      // The cell decides where a carried block lands, not the block in it.
      expect(moveBlock).not.toHaveBeenCalled();
      expect(result.current.carrying?.source).toMatchObject({ id: "b1" });
    });
  });

  it("clears the focus request once it has been honoured", () => {
    const { result } = setup();

    act(() => result.current.activateProvider("limit", "keyboard"));
    act(() => result.current.place());
    act(() => result.current.clearFocusRequest());

    expect(result.current.focusRequest).toBeNull();
  });
});
