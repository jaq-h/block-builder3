// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBlockCommand } from "./useBlockCommand";
import { useGridAnnouncer } from "./useGridAnnouncer";
import { clearGrid, removeBlockFromGrid } from "@utils/grid";
import { createBlocksFromOrderType } from "@utils/blockFactory";
import { getOrderType, ORDER_TYPES } from "@data/orderTypes";
import type {
  BlockData,
  CellPosition,
  GridData,
  PlacementResult,
  StrategyPattern,
} from "@/types/grid";
import type { PickUpRefusal } from "@utils/gridAnnouncements";

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
type RefuseMove = (
  block: Pick<BlockData, "id" | "label">,
  at: CellPosition,
  reason: PickUpRefusal,
) => void;

const renderCommand = (
  grid: GridData,
  strategyPattern: StrategyPattern,
  placeProvider: (type: string, cell: { col: number; row: number }) => PlacementResult,
  onRefuse: RefuseMove = () => {},
  removeFromGrid: (id: string) => GridData = (id) =>
    removeBlockFromGrid(grid, id),
) =>
  renderHook(() => {
    const announcer = useGridAnnouncer(strategyPattern);
    const command = useBlockCommand({
      grid,
      strategyPattern,
      providerBlocks: ORDER_TYPES,
      announcer,
      placeProvider,
      removeFromGrid,
      // Wired the way `GridArea` wires it: the refusal is reported to the one
      // announcer, and the owner does whatever else it needs to with the same
      // two facts - which for `GridArea` is putting the rule on screen.
      refuseMove: (block, at, reason) => {
        onRefuse(block, at, reason);
        announcer.report({ kind: "moveRefused", label: block.label, reason });
      },
    });
    return { ...command, announcement: announcer.announcement };
  });

/**
 * The same wiring, but with the grid as a prop so it can be replaced under a
 * live carry - which is what Clear All, Reverse Blocks and a pattern switch do,
 * every one of which now ends the carry, because a new `grid` is the whole of
 * what any of them can do to this model. The `GridArea` harness stubs those
 * buttons out, so this is the honest place to drive them.
 *
 * FORMERLY this docblock ended "none of which end the carry", which was true of
 * the behaviour these helpers were written against and is the defect the
 * `gridReplaced` transition closed.
 */
const renderCommandWithReplaceableGrid = (initialGrid: GridData) =>
  renderHook(
    ({ grid }: { grid: GridData }) => {
      const announcer = useGridAnnouncer("conditional");
      const command = useBlockCommand({
        grid,
        strategyPattern: "conditional",
        providerBlocks: ORDER_TYPES,
        announcer,
        placeProvider: () => ({ status: "refused" }),
        removeFromGrid: (id) => removeBlockFromGrid(grid, id),
        refuseMove: () => {},
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
  // A placed block never leaves its cell (decision D9), so the only thing the
  // command model can do with one is refuse and say so. The owner is what puts
  // that refusal on screen as well as into the live region, which is why it is
  // a callback rather than an announcement composed here.
  const refuseMove = vi.fn<RefuseMove>();
  // The grid's half of a removal: `GridArea` writes the block out and clears
  // every link that named it, and hands back what it wrote. The command model
  // owns the operation - who asked, what is said, where focus lands - and reads
  // that grid to decide whether a carry in the user's other hand can survive it.
  // The real write, not a stub returning anything: the carry's fate turns on it.
  const removeFromGrid = vi.fn<(id: string) => GridData>((id) =>
    removeBlockFromGrid(grid, id),
  );

  const view = renderCommand(
    grid,
    strategyPattern,
    placeProvider,
    refuseMove,
    removeFromGrid,
  );

  return { ...view, placeProvider, refuseMove, removeFromGrid };
};

/**
 * A placed block the cell draws without a price axis - a Market order. Nothing
 * placed moves between cells any more (decision D9); this is the fixture for
 * the refusal that has no arrow keys to offer instead.
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

      act(() => result.current.activateProvider("limit", "touch"));

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

      act(() => result.current.activateProvider("limit", "touch"));
      act(() => result.current.activateProvider("limit", "touch"));

      expect(placeProvider).not.toHaveBeenCalled();
      expect(result.current.carrying).toBeNull();
      expect(result.current.announcement.text).toBe(
        "Cancelled. Limit order returned to the palette.",
      );
    });

    it("places into a tapped cell", () => {
      const { result, placeProvider } = setup();

      act(() => result.current.activateProvider("limit", "touch"));
      act(() => result.current.activateCell({ col: 1, row: 1 }));

      expect(placeProvider).toHaveBeenCalledWith("limit", { col: 1, row: 1 });
    });

    it("refuses a tapped cell that cannot take the order", () => {
      const { result, placeProvider } = setup();

      act(() => result.current.activateProvider("limit", "touch"));
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

    // Two tests stood here that drove a *placed* block's carry to a refusal and
    // to a "gone" grid, to check which cell each sentence named. Both went with
    // the carry itself: a placed block is never picked up any more (decision
    // D9), so the only result the command model can reach for one is the
    // refusal below. The equivalent wording for a drag - which is what still
    // reaches a placed block - is pinned in `GridArea.dom.test.tsx`.

    it("keeps focus somewhere real when the placement is rejected downstream", () => {
      const grid = clearGrid(2, 3);
      const view = renderCommand(
        grid,
        "conditional",
        () => ({ status: "refused" }),
      );

      act(() => view.result.current.activateProvider("limit", "keyboard"));
      act(() => view.result.current.activateProvider("limit", "keyboard"));

      // Nothing was created, so focus returns to the palette entry rather than
      // being dropped on the body.
      expect(view.result.current.focusRequest).toBe("limit");
    });
  });

  // The "a carry the grid changes under" suite stood here: it picked a placed
  // block up, replaced the grid under it the way Clear All and Reverse Blocks
  // do, and checked that the sentence named the cell the grid had just
  // confirmed rather than the pick-up snapshot. There is no placed-block carry
  // left to outlive a grid (decision D9), and a palette carry names no cell at
  // all, so the staleness those tests guarded against is unreachable rather
  // than merely untested. `renderCommandWithReplaceableGrid` is kept for the
  // palette carry, which still has to survive a grid being swapped under it.

  // FORMERLY "survives the grid being replaced, and still returns to the
  // palette". It did survive, and that was the defect: a carry is a promise
  // about *cells*, and Clear All, Reverse Blocks and a pattern switch all make
  // that promise untrue while the grid goes on drawing it as a highlight and
  // reading it out as `aria-current`. The carry now ends with the grid it was
  // offered against.
  //
  // Nothing here names a caller, and that is the point of the suite: the
  // replacement arrives as a different `grid` prop, which is all any path -
  // named, unnamed, or not written yet - can do to this model.
  describe("a palette carry the grid changes under", () => {
    it("ends the carry, and says the grid changed rather than blaming the user", () => {
      const view = renderCommandWithReplaceableGrid(gridWithMovableBlock());

      act(() => view.result.current.activateProvider("limit", "keyboard"));
      expect(view.result.current.carrying?.source).toMatchObject({
        type: "limit",
      });

      view.rerender({ grid: clearGrid(2, 3) });

      expect(view.result.current.carrying).toBeNull();
      expect(view.result.current.announcement.text).toBe(
        "Limit order returned to the palette: the grid changed underneath it.",
      );
      // A palette order is nowhere on the grid to begin with, so the sentence
      // has no cell to get wrong.
      expect(view.result.current.announcement.text).not.toContain("column");
    });

    // Focus is not handed back, for the same reason the dismissal hatch does
    // not hand it back: the user pressed a control somewhere else, and the
    // grid pulling them to the palette entry they left takes the keyboard off
    // them mid-task.
    it("leaves focus where the user was, rather than dragging it to the palette", () => {
      const view = renderCommandWithReplaceableGrid(gridWithMovableBlock());

      act(() => view.result.current.activateProvider("limit", "keyboard"));
      view.rerender({ grid: clearGrid(2, 3) });

      expect(view.result.current.focusRequest).toBeNull();
    });

    // A grid the carry's offer survives is not a replacement, whatever else
    // changed in it. Nudging a block along its price axis rewrites the grid on
    // every arrow press, and a carry that ended there would be unusable.
    it("survives a grid change that leaves the same cells on offer", () => {
      const view = renderCommandWithReplaceableGrid(gridWithMovableBlock());

      act(() => view.result.current.activateProvider("limit", "keyboard"));
      const offered = view.result.current.carrying?.targets;

      // The same grid, rebuilt: a new array holding the same block in the same
      // cell, which is what a re-priced block looks like from here.
      const repriced = clearGrid(2, 3);
      repriced[0][1].push(axisLessBlock({ yPosition: 12 }));
      view.rerender({ grid: repriced });

      expect(view.result.current.carrying?.targets).toEqual(offered);
      expect(view.result.current.announcement.text).not.toContain(
        "the grid changed",
      );
    });
  });

  describe("a placed block, which never leaves its cell", () => {
    // Decision D9, and the suite this replaces is the clearest case in the file
    // of tests that would have quietly certified the old behaviour. It asserted
    // that Enter on a placed block picked it up, that the arrow keys walked it
    // to a diagonal and `moveBlock` was called with the new cell, and that a
    // second Enter put it back - the whole cross-cell move, for every input
    // method. That capability is gone: once a block is placed and priced, its
    // cell is where it lives, with no per-block-type carve-out. What is left to
    // check is that the refusal is a refusal rather than a silence, and that it
    // names something the user can actually do next.

    it("refuses a block drawn on a price axis, and offers the arrow keys", () => {
      const { grid, blocks } = gridWithOrder("stop-loss-limit");
      const { result, refuseMove } = setup(grid);

      expect(blocks).toHaveLength(2);

      act(() => result.current.activateBlock(blocks[0].id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(refuseMove).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Stop Loss Limit" }),
        { col: 0, row: 1 },
        "onPriceAxis",
      );
      expect(result.current.announcement.text).toBe(
        "Stop Loss Limit is priced on this axis and cannot be moved to another cell. Use the arrow keys to change its price, or Delete to remove it and place a new one.",
      );
    });

    it("refuses a lone block on a price axis the same way", () => {
      const { result, refuseMove } = setup(gridWithLimit());

      act(() => result.current.activateBlock("b1", "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(refuseMove).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Limit" }),
        { col: 0, row: 1 },
        "onPriceAxis",
      );
    });

    it("promises no arrow keys in a cell that draws no axis", () => {
      // A bulk cell holding any axis-less block draws every block in it without
      // an axis, so nothing wires the arrow keys there. Refusing the move and
      // then naming an affordance that is not present would leave a
      // screen-reader user reaching for a control this render never built.
      // `cellDrawsPriceAxis` is the one owner of that question, shared with the
      // renderer, so the two cannot disagree about it.
      const grid = clearGrid(2, 3);
      grid[0][1].push(...blocksFor("stop-loss-limit", 0));
      grid[0][1].push(...blocksFor("market", 10));
      const { result, refuseMove } = setup(grid);

      act(() => result.current.activateBlock(grid[0][1][0].id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(refuseMove).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Stop Loss Limit" }),
        { col: 0, row: 1 },
        "staysInCell",
      );
      expect(result.current.announcement.text).toBe(
        "Stop Loss Limit stays in the cell it was placed in. To put this order somewhere else, press Delete to remove it and place a new one.",
      );
    });

    // FORMERLY "still picks up a market order, which has no axis at all". A
    // Market order was the one placed block the model would carry, on the
    // reasoning that a mouse could free-drag it. Decision D9 was asked exactly
    // that question - every block, or only the priced ones - and answered every
    // block, so this now refuses too.
    it("refuses a market order, which used to be the one block it would carry", () => {
      const { grid, blocks } = gridWithOrder("market");
      const { result, refuseMove } = setup(grid);

      act(() => result.current.activateBlock(blocks[0].id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(refuseMove).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Market" }),
        { col: 0, row: 1 },
        "staysInCell",
      );
    });

    // FORMERLY "moves one of two independent same-type orders sharing a bulk
    // cell", which asserted `moveBlock` was called with the diagonal. Two
    // independent Market orders really are independent, but D9 has no carve-out
    // for that either.
    it("refuses one of two independent same-type orders sharing a bulk cell", () => {
      const grid = clearGrid(2, 3);
      grid[0][1].push(...blocksFor("market", 0), ...blocksFor("market", 10));
      const first = grid[0][1][0];
      const { result, refuseMove } = setup(grid, "bulk");

      expect(grid[0][1]).toHaveLength(2);

      act(() => result.current.activateBlock(first.id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(refuseMove).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Market" }),
        { col: 0, row: 1 },
        "staysInCell",
      );
    });

    it("refuses a priced block by tap as well as by keyboard", () => {
      // Placed away from the default cell on purpose: the cell handed to
      // `refuseMove` is the one the block is actually in, and the note the
      // owner draws from it is taken down as soon as the block is not there
      // any more.
      const { grid, blocks } = gridWithOrder("take-profit-limit", 1, 2);
      const { result, refuseMove } = setup(grid);

      act(() => result.current.activateBlock(blocks[1].id, "touch"));

      expect(result.current.carrying).toBeNull();
      expect(refuseMove).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Take Profit Limit" }),
        { col: 1, row: 2 },
        "onPriceAxis",
      );
    });

    it("refuses a priced block sharing a bulk cell with a different family", () => {
      // The sequence that could silently re-price the block left behind, back
      // when a move re-stamped the direction from the target cell.
      const grid = clearGrid(2, 3);
      grid[0][1].push(...blocksFor("limit", 0), ...blocksFor("stop-loss", 10));
      const limit = grid[0][1][0];
      const { result, refuseMove } = setup(grid, "bulk");

      act(() => result.current.activateBlock(limit.id, "keyboard"));

      expect(result.current.carrying).toBeNull();
      expect(refuseMove).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Limit" }),
        { col: 0, row: 1 },
        "onPriceAxis",
      );
    });

    it("leaves a placed block alone while a palette order is carried", () => {
      const { result, placeProvider } = setup(gridWithMovableBlock());

      act(() => result.current.activateProvider("limit", "keyboard"));
      act(() => result.current.activateBlock("b1", "keyboard"));

      // The cell decides where a carried order lands, not the block in it - so
      // a press on some other block is neither a placement nor a refusal.
      expect(placeProvider).not.toHaveBeenCalled();
      expect(result.current.carrying?.source).toMatchObject({ type: "limit" });
    });
  });

  describe("abandoning a carry", () => {
    // Escape and a second tap both put the block back and want focus with it,
    // so the palette entry the user left is where they carry on from.
    it("hands focus back to the palette entry the carry started on", () => {
      const { result } = setup();

      act(() => result.current.activateProvider("limit", "keyboard"));
      act(() => result.current.cancel());

      expect(result.current.carrying).toBeNull();
      expect(result.current.focusRequest).toBe("limit");
    });

    // Tab is the one that must not. The browser has already moved focus on by
    // the time the request would be honoured, so restoring it drags the user
    // back to the entry they just left and swallows the Tab - a focus trap on
    // the palette. `Block` passes `restoreFocus: false` for exactly this, and
    // without a test here the branch could be made unconditional and the whole
    // suite would still pass.
    it("leaves focus alone when the carry is abandoned by Tab", () => {
      const { result } = setup();

      act(() => result.current.activateProvider("limit", "keyboard"));
      act(() => result.current.cancel({ restoreFocus: false }));

      expect(result.current.carrying).toBeNull();
      expect(result.current.focusRequest).toBeNull();
      expect(result.current.announcement.text).toBe(
        "Cancelled. Limit order returned to the palette.",
      );
    });
  });

  it("clears the focus request once it has been honoured", () => {
    const { result } = setup();

    act(() => result.current.activateProvider("limit", "keyboard"));
    act(() => result.current.activateProvider("limit", "keyboard"));
    act(() => result.current.clearFocusRequest());

    expect(result.current.focusRequest).toBeNull();
  });

  // ===========================================================================
  // REMOVAL
  // ===========================================================================
  //
  // One operation with one owner. It used to be a branch of the free drag's
  // release handler, which is why it did not exist at all for a block whose
  // cell draws a price axis - `block.tsx` wires the vertical price drag for
  // those, so no free drag ever ended and no removal ever fired.

  describe("removing a placed block", () => {
    it("hands the write to the grid and says what went, and from where", () => {
      const { result, removeFromGrid } = setup(gridWithLimit());

      act(() => result.current.removeBlock("b1"));

      expect(removeFromGrid).toHaveBeenCalledWith("b1");
      expect(result.current.announcement.text).toBe(
        "Removed Limit limit block from Entry column, primary row.",
      );
    });

    // The leg, because the cell cannot separate what shares it: a dual-axis
    // order type puts two blocks in one cell under one label, so "Removed Stop
    // Loss Limit block from Entry column, primary row" was said identically for
    // either leg and the survivor is half an order. `legInCell` is asked of the
    // block's own cell rather than derived here, so the sentence names the same
    // leg the control the user pressed was named with.
    it("names which leg of a dual-axis order went", () => {
      const { grid, blocks } = gridWithOrder("stop-loss-limit");
      const { result } = setup(grid);
      const trigger = blocks.find((block) => block.axes.includes("trigger"))!;
      const limit = blocks.find((block) => block.axes.includes("limit"))!;

      act(() => result.current.removeBlock(trigger.id));
      expect(result.current.announcement.text).toBe(
        "Removed Stop Loss Limit trigger block from Entry column, primary row.",
      );

      act(() => result.current.removeBlock(limit.id));
      expect(result.current.announcement.text).toBe(
        "Removed Stop Loss Limit limit block from Entry column, primary row.",
      );
    });

    // A cell that draws no axis has no leg to name, and `legInCell` answers
    // nothing for one. The sentence must not invent a leg from the block's own
    // `axes`, which is the second derivation `blockMapping` exists to prevent.
    it("names no leg for a block in a cell that draws no axis", () => {
      const { result } = setup(gridWithMovableBlock());

      act(() => result.current.removeBlock("b1"));

      expect(result.current.announcement.text).toBe(
        "Removed Market block from Entry column, primary row.",
      );
    });

    // The element that was focused is the one being removed, so leaving focus
    // alone drops it to `<body>` and the next Tab restarts at the top of the
    // document. The palette entry is where decision D9's other half begins.
    it("asks for focus on the palette entry the order came from", () => {
      const { result } = setup(gridWithLimit());

      act(() => result.current.removeBlock("b1"));

      expect(result.current.focusRequest).toBe("limit");
    });

    // A grid can be replaced under a gesture - Clear All, Reverse Blocks, a
    // strategy load - and a sentence about a block that is not there would name
    // a cell the grid has not confirmed, which is the one claim this module
    // refuses to make.
    it("says nothing, and writes nothing, about a block the grid does not hold", () => {
      const { result, removeFromGrid } = setup(gridWithLimit());

      act(() => result.current.removeBlock("never-placed"));

      expect(removeFromGrid).not.toHaveBeenCalled();
      expect(result.current.announcement.text).toBe("");
      expect(result.current.focusRequest).toBeNull();
    });

    // FORMERLY "leaves a palette order still in hand", on the grounds that a
    // removal and a carry are unrelated. They are related, though not the way
    // "a removal frees a cell" suggests: conditional validity is diagonal
    // adjacency to an OCCUPIED cell, so removing this Limit DELETES the
    // diagonals it was supplying, and the freed cell is the smaller half. The
    // carry was offered the Exit upper conditional and is not offered it any
    // more.
    //
    // The old rule is kept wherever it is meaningful: the removal does not end
    // the carry, the offer changing does. See the sibling test below for a
    // removal that changes nothing and leaves the carry exactly where it was.
    it("ends the carry when the removal takes the offered cells away", () => {
      const { result } = setup(gridWithLimit());

      act(() => result.current.activateProvider("limit", "keyboard"));
      act(() => result.current.removeBlock("b1"));

      expect(result.current.carrying).toBeNull();
      // One press, one live-region write: reported separately, the second
      // replaces the first before it has been read, and for a removal that
      // loses the only sentence saying which block went.
      expect(result.current.announcement.text).toBe(
        "Removed Limit limit block from Entry column, primary row. Limit order returned to the palette: the grid changed underneath it.",
      );
    });

    // The other half of the same rule, and the removal lane's decision intact
    // where it holds. In the bulk pattern every cell takes every order whatever
    // the grid holds, so nothing a removal does can take a cell away from a
    // carry - and the carry is left exactly where it was, with the removal's
    // sentence the only thing said.
    it("leaves a carry alone when the removal takes no cell away from it", () => {
      const grid = clearGrid(2, 3);
      grid[0][1].push(limitBlock());
      const { result } = setup(grid, "bulk");

      act(() => result.current.activateProvider("limit", "keyboard"));
      const offered = result.current.carrying?.targets;
      act(() => result.current.removeBlock("b1"));

      expect(result.current.carrying?.source.type).toBe("limit");
      expect(result.current.carrying?.targets).toEqual(offered);
      expect(result.current.announcement.text).toBe(
        "Removed Limit limit block from Entry column, row 2.",
      );
    });
  });
});
