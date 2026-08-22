// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBlockCommand } from "./useBlockCommand";
import { useGridAnnouncer } from "./useGridAnnouncer";
import { clearGrid } from "@utils/grid";
import { createBlocksFromOrderType } from "@utils/blockFactory";
import { getOrderType, ORDER_TYPES } from "@data/orderTypes";
import type {
  BlockData,
  GridData,
  PlacementResult,
  StrategyPattern,
} from "@/types/grid";

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

/**
 * The hook no longer owns the live region: `useGridAnnouncer` does, and it is
 * the single place any sentence is composed. The harness wires the two together
 * the way `GridArea` does and re-exposes the announcement, so every assertion
 * below reads what a screen reader would actually receive.
 */
const renderCommand = (
  grid: GridData,
  strategyPattern: StrategyPattern,
  placeProvider: (type: string, cell: { col: number; row: number }) => PlacementResult,
  moveBlock: (id: string, cell: { col: number; row: number }) => PlacementResult,
) =>
  renderHook(() => {
    const announcer = useGridAnnouncer(strategyPattern);
    const command = useBlockCommand({
      grid,
      strategyPattern,
      providerBlocks: ORDER_TYPES,
      announcer,
      placeProvider,
      moveBlock,
    });
    return { ...command, announcement: announcer.announcement };
  });

/**
 * The same wiring, but with the grid as a prop so it can be replaced under a
 * live carry - which is what Clear All, Reverse Blocks and a pattern switch do,
 * none of which end the carry. The `GridArea` harness stubs those buttons out,
 * so this is the honest place to drive them.
 */
const renderCommandWithReplaceableGrid = (
  initialGrid: GridData,
  moveBlock: () => PlacementResult = () => ({ status: "refused" }),
) =>
  renderHook(
    ({ grid }: { grid: GridData }) => {
      const announcer = useGridAnnouncer("conditional");
      const command = useBlockCommand({
        grid,
        strategyPattern: "conditional",
        providerBlocks: ORDER_TYPES,
        announcer,
        placeProvider: () => ({ status: "refused" }),
        moveBlock,
      });
      return { ...command, announcement: announcer.announcement };
    },
    { initialProps: { grid: initialGrid } },
  );

const setup = (
  grid: GridData = clearGrid(2, 3),
  strategyPattern: StrategyPattern = "conditional",
) => {
  const placeProvider = vi.fn(
    (): PlacementResult => ({ status: "created", blockId: "new-block-id" }),
  );
  // The grid the command model talks to reports what it did; this stands in for
  // a move that really happened, out of the cell the fixtures place blocks in.
  const moveBlock = vi.fn(
    (id: string): PlacementResult => ({ status: "moved", blockId: id }),
  );

  const view = renderCommand(grid, strategyPattern, placeProvider, moveBlock);

  return { ...view, placeProvider, moveBlock };
};

/**
 * The only kind of placed block that moves between cells at all: one the cell
 * draws without a price axis. A mouse cannot move a priced block either, so
 * the carry mechanics are exercised on this one.
 */
const axisLessBlock = (overrides: Partial<BlockData> = {}): BlockData => ({
  id: "b1",
  orderType: "market",
  label: "Market",
  abrv: "Mkt",
  allowedRows: [0, 1],
  axis: 1,
  yPosition: -1,
  direction: "upside",
  axes: [],
  ...overrides,
});

const gridWithLimit = () => {
  const grid = clearGrid(2, 3);
  grid[0][1].push(limitBlock());
  return grid;
};

const gridWithMovableBlock = () => {
  const grid = clearGrid(2, 3);
  grid[0][1].push(axisLessBlock());
  return grid;
};

/**
 * A cell holding a real order type's blocks, built by the same factory the
 * grid uses - so a dual-axis type really does put two blocks in one cell.
 */
const gridWithOrder = (type: string, col = 0, row = 1) => {
  const grid = clearGrid(2, 3);
  grid[col][row].push(...blocksFor(type, 0));
  return { grid, blocks: grid[col][row] };
};

const blocksFor = (type: string, counter: number) => {
  const definition = getOrderType(type);
  if (!definition) throw new Error(`unknown order type: ${type}`);
  return createBlocksFromOrderType(definition, { baseId: "t", counter }).blocks;
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
      act(() => result.current.activateProvider("limit", "keyboard"));

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
      // A refused cell leaves the carry live, and the highlight that shows it
      // is not available to a screen-reader user - so the sentence says it.
      expect(result.current.announcement.text).toBe(
        "Entry column, upper conditional row cannot take this order. Still carrying Limit order.",
      );
    });

    it("says the order was not placed when the grid refuses it downstream", () => {
      const grid = clearGrid(2, 3);
      const view = renderCommand(
        grid,
        "conditional",
        () => ({ status: "refused" }),
        () => ({ status: "refused" }),
      );

      act(() => view.result.current.activateProvider("limit", "keyboard"));
      act(() => view.result.current.activateProvider("limit", "keyboard"));

      // The targets are a snapshot from pick-up time, so the live grid can
      // still refuse. Announcing "Placed" then would be a lie to the one user
      // who has nothing but the announcement to go on.
      expect(view.result.current.announcement.text).toBe(
        "Entry column, primary row cannot take this order any more. Limit order was not placed, and is no longer picked up.",
      );
      expect(view.result.current.carrying).toBeNull();
    });

    it("names the cell the grid just confirmed, not the one picked up from", () => {
      // Reverse Blocks mirrors a placed block into the other column while it is
      // being carried. The carry's own `origin` is a snapshot from pick-up
      // time, so a refusal composed from it names a cell the block left. The
      // grid knows better, and says so on the result it returns.
      const view = renderCommand(
        gridWithMovableBlock(),
        "conditional",
        () => ({ status: "refused" }),
        () => ({ status: "refused", at: { col: 1, row: 1 } }),
      );

      act(() => view.result.current.activateBlock("b1", "keyboard"));
      act(() => view.result.current.activateBlock("b1", "keyboard"));

      expect(view.result.current.announcement.text).toBe(
        "Entry column, primary row cannot take this order any more. Market block stayed in Exit column, primary row, and is no longer picked up.",
      );
      expect(view.result.current.carrying).toBeNull();
    });

    it("names no cell at all when the block is no longer on the grid", () => {
      // Clear All replaces the grid without ending the carry. The block is in
      // no cell, so any sentence naming one would be false.
      const view = renderCommand(
        gridWithMovableBlock(),
        "conditional",
        () => ({ status: "refused" }),
        () => ({ status: "gone" }),
      );

      act(() => view.result.current.activateBlock("b1", "keyboard"));
      act(() => view.result.current.activateBlock("b1", "keyboard"));

      expect(view.result.current.announcement.text).toBe(
        "Market block is no longer on the grid, and is no longer picked up.",
      );
      expect(view.result.current.carrying).toBeNull();
      // A focus request naming a block that does not exist is never honoured,
      // and would sit waiting for some later block to answer it.
      expect(view.result.current.focusRequest).toBeNull();
    });

    it("keeps focus somewhere real when the placement is rejected downstream", () => {
      const grid = clearGrid(2, 3);
      const view = renderCommand(
        grid,
        "conditional",
        () => ({ status: "refused" }),
        () => ({ status: "refused" }),
      );

      act(() => view.result.current.activateProvider("limit", "keyboard"));
      act(() => view.result.current.activateProvider("limit", "keyboard"));

      // Nothing was created, so focus returns to the palette entry rather than
      // being dropped on the body.
      expect(view.result.current.focusRequest).toBe("limit");
    });
  });

  describe("a carry the grid changes under", () => {
    /** Where Reverse Blocks leaves the same block: the mirrored column. */
    const gridWithBlockMoved = () => {
      const grid = clearGrid(2, 3);
      grid[1][1].push(axisLessBlock());
      return grid;
    };

    it("names the cell the block is in now when the carry is cancelled", () => {
      const view = renderCommandWithReplaceableGrid(gridWithMovableBlock());

      act(() => view.result.current.activateBlock("b1", "keyboard"));
      expect(view.result.current.carrying?.source).toMatchObject({
        origin: { col: 0, row: 1 },
      });

      view.rerender({ grid: gridWithBlockMoved() });
      act(() => view.result.current.cancel());

      expect(view.result.current.announcement.text).toBe(
        "Cancelled. Market block left in Exit column, primary row.",
      );
    });

    it("names no cell at all when the grid no longer holds the block", () => {
      const view = renderCommandWithReplaceableGrid(gridWithMovableBlock());

      act(() => view.result.current.activateBlock("b1", "keyboard"));
      view.rerender({ grid: clearGrid(2, 3) });
      act(() => view.result.current.cancel());

      expect(view.result.current.announcement.text).toBe(
        "Cancelled. Market block is no longer on the grid.",
      );
      expect(view.result.current.announcement.text).not.toContain("column");
    });

    it("does the same when a drag supersedes the carry", () => {
      const moved = renderCommandWithReplaceableGrid(gridWithMovableBlock());

      act(() => moved.result.current.activateBlock("b1", "keyboard"));
      moved.rerender({ grid: gridWithBlockMoved() });
      // A different subject, so this release speaks for itself.
      act(() => {
        moved.result.current.releaseForDrag("limit");
      });

      expect(moved.result.current.announcement.text).toBe(
        "Market block left in Exit column, primary row: a drag took over.",
      );

      const cleared = renderCommandWithReplaceableGrid(gridWithMovableBlock());

      act(() => cleared.result.current.activateBlock("b1", "keyboard"));
      cleared.rerender({ grid: clearGrid(2, 3) });
      act(() => {
        cleared.result.current.releaseForDrag("limit");
      });

      expect(cleared.result.current.announcement.text).toBe(
        "Market block is no longer on the grid: a drag took over.",
      );
      expect(cleared.result.current.announcement.text).not.toContain("column");
    });
  });

  describe("carrying a block that is already on the grid", () => {
    it("starts on the block's own cell", () => {
      const { result } = setup(gridWithMovableBlock());

      act(() => result.current.activateBlock("b1", "keyboard"));

      expect(result.current.carrying?.source).toEqual({
        kind: "grid",
        id: "b1",
        label: "Market",
        origin: { col: 0, row: 1 },
      });
      expect(result.current.carrying?.target).toEqual({ col: 0, row: 1 });
    });

    it("moves it to the diagonal the placement rule allows", () => {
      const { result, moveBlock } = setup(gridWithMovableBlock());

      act(() => result.current.activateBlock("b1", "keyboard"));
      act(() => result.current.moveTarget(1, 0));
      act(() => result.current.activateBlock("b1", "keyboard"));

      // With this block in the Entry primary cell, the only other legal cell
      // is the Exit upper conditional - a diagonal.
      expect(moveBlock).toHaveBeenCalledWith("b1", { col: 1, row: 0 });
      expect(result.current.focusRequest).toBe("b1");
    });

    it("can put the block back in its own cell", () => {
      const { result, moveBlock } = setup(gridWithMovableBlock());

      act(() => result.current.activateBlock("b1", "keyboard"));
      act(() => result.current.activateBlock("b1", "keyboard"));

      // Its own cell reads as occupied to the placement rules, so it has to be
      // added back deliberately - otherwise a pick-up could never be undone
      // with Enter, only with Escape.
      expect(moveBlock).toHaveBeenCalledWith("b1", { col: 0, row: 1 });
    });

    it("says where the block was left when the carry is cancelled", () => {
      const { result } = setup(gridWithMovableBlock());

      act(() => result.current.activateBlock("b1", "keyboard"));
      act(() => result.current.cancel());

      expect(result.current.carrying).toBeNull();
      expect(result.current.focusRequest).toBe("b1");
      expect(result.current.announcement.text).toBe(
        "Cancelled. Market block left in Entry column, primary row.",
      );
    });

    it("refuses to move a block drawn on a price axis, and says why", () => {
      const { grid, blocks } = gridWithOrder("stop-loss-limit");
      const { result, moveBlock } = setup(grid);

      // The trigger and the limit share a cell; moving one alone would submit
      // them as two orders on opposite sides of the market. The cell draws
      // both on an axis, though, so the reason the user is given is the one
      // that applies to every block in such a cell - and it names the arrow
      // keys, which this render really does wire.
      expect(blocks).toHaveLength(2);

      act(() => result.current.activateBlock(blocks[0].id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(moveBlock).not.toHaveBeenCalled();
      expect(result.current.announcement.text).toBe(
        "Stop Loss Limit is priced on this axis and cannot be moved to another cell. Use the arrow keys to change its price.",
      );
    });

    it("refuses a lone block on a price axis, which has no partner at all", () => {
      const { result, moveBlock } = setup(gridWithLimit());

      act(() => result.current.activateBlock("b1", "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(moveBlock).not.toHaveBeenCalled();
      expect(result.current.announcement.text).toBe(
        "Limit is priced on this axis and cannot be moved to another cell. Use the arrow keys to change its price.",
      );
    });

    it("promises no arrow keys in a cell that draws no axis", () => {
      // A bulk cell holding any axis-less block draws every block in it
      // without an axis, so nothing wires the arrow keys there. Refusing the
      // move and then naming an affordance that is not present would leave a
      // screen-reader user reaching for a control this render never built.
      const grid = clearGrid(2, 3);
      grid[0][1].push(...blocksFor("stop-loss-limit", 0));
      grid[0][1].push(...blocksFor("market", 10));
      const { result, moveBlock } = setup(grid);

      act(() => result.current.activateBlock(grid[0][1][0].id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(moveBlock).not.toHaveBeenCalled();
      expect(result.current.announcement.text).toBe(
        "Stop Loss Limit cannot be moved on its own: its trigger and limit must stay in the same cell.",
      );
    });

    it("refuses a priced block by tap as well as by keyboard", () => {
      const { grid, blocks } = gridWithOrder("take-profit-limit");
      const { result, moveBlock } = setup(grid);

      act(() => result.current.activateBlock(blocks[1].id, "pointer"));

      expect(result.current.carrying).toBeNull();
      expect(moveBlock).not.toHaveBeenCalled();
      expect(result.current.announcement.text).toContain(
        "Take Profit Limit is priced on this axis",
      );
    });

    it("refuses a single-leg axis order, which a mouse cannot move either", () => {
      const { grid, blocks } = gridWithOrder("stop-loss");
      const { result, moveBlock } = setup(grid);

      expect(blocks).toHaveLength(1);

      act(() => result.current.activateBlock(blocks[0].id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(moveBlock).not.toHaveBeenCalled();
      expect(result.current.announcement.text).toBe(
        "Stop Loss is priced on this axis and cannot be moved to another cell. Use the arrow keys to change its price.",
      );
    });

    it("still picks up a market order, which has no axis at all", () => {
      const { grid, blocks } = gridWithOrder("market");
      const { result } = setup(grid);

      act(() => result.current.activateBlock(blocks[0].id, "keyboard"));

      expect(result.current.carrying?.source).toMatchObject({
        id: blocks[0].id,
      });
    });

    it("moves one of two independent same-type orders sharing a bulk cell", () => {
      // The bulk pattern is "multiple independent orders", so two Market orders
      // can share a cell. Neither is half of the other, and a mouse can move
      // them, so the keyboard must be able to as well.
      const grid = clearGrid(2, 3);
      grid[0][1].push(...blocksFor("market", 0), ...blocksFor("market", 10));
      const first = grid[0][1][0];
      const { result, moveBlock } = setup(grid, "bulk");

      expect(grid[0][1]).toHaveLength(2);

      act(() => result.current.activateBlock(first.id, "keyboard"));
      expect(result.current.carrying?.source).toMatchObject({ id: first.id });

      act(() => result.current.moveTarget(1, 0));
      act(() => result.current.activateBlock(first.id, "keyboard"));

      expect(moveBlock).toHaveBeenCalledWith(first.id, { col: 1, row: 1 });
    });

    it("refuses two independent limit orders in a bulk cell for the right reason", () => {
      // Neither is half of the other, so the refusal must not claim a trigger
      // and a limit they do not have. They are drawn on the cell's axis, and
      // that is what stops the move.
      const grid = clearGrid(2, 3);
      grid[0][1].push(...blocksFor("limit", 0), ...blocksFor("limit", 10));
      const second = grid[0][1][1];
      const { result, moveBlock } = setup(grid, "bulk");

      act(() => result.current.activateBlock(second.id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(moveBlock).not.toHaveBeenCalled();
      expect(result.current.announcement.text).toBe(
        "Limit is priced on this axis and cannot be moved to another cell. Use the arrow keys to change its price.",
      );
    });

    it("refuses a priced block sharing a bulk cell with a different family", () => {
      // The sequence that could silently re-price the block left behind: a
      // cell's scale is its first block's direction, and these two disagree.
      const grid = clearGrid(2, 3);
      grid[0][1].push(...blocksFor("limit", 0), ...blocksFor("stop-loss", 10));
      const limit = grid[0][1][0];
      const { result, moveBlock } = setup(grid, "bulk");

      act(() => result.current.activateBlock(limit.id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(moveBlock).not.toHaveBeenCalled();
      expect(result.current.announcement.text).toContain(
        "Limit is priced on this axis",
      );
    });

    it("still refuses a dual-axis leg sharing a bulk cell", () => {
      const grid = clearGrid(2, 3);
      grid[0][1].push(...blocksFor("stop-loss-limit", 0));
      const trigger = grid[0][1][0];
      const { result, moveBlock } = setup(grid, "bulk");

      act(() => result.current.activateBlock(trigger.id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(moveBlock).not.toHaveBeenCalled();
    });

    it("does not hand focus back when the carry is abandoned by Tab", () => {
      const { result } = setup(gridWithMovableBlock());

      act(() => result.current.activateBlock("b1", "keyboard"));
      act(() => result.current.cancel({ restoreFocus: false }));

      // Tab has already moved focus on by the time a focus request would be
      // honoured; restoring it would drag the user back and swallow the Tab.
      expect(result.current.carrying).toBeNull();
      expect(result.current.focusRequest).toBeNull();
      expect(result.current.announcement.text).toBe(
        "Cancelled. Market block left in Entry column, primary row.",
      );
    });

    it("leaves another block alone while one is being carried", () => {
      const grid = gridWithMovableBlock();
      grid[1][0].push(axisLessBlock({ id: "b2", label: "Take Profit" }));
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
    act(() => result.current.activateProvider("limit", "keyboard"));
    act(() => result.current.clearFocusRequest());

    expect(result.current.focusRequest).toBeNull();
  });
});
