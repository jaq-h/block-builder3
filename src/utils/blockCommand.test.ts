import { describe, it, expect } from "vitest";
import {
  commandReducer,
  describeCell,
  describeSource,
  IDLE_COMMAND_STATE,
  initialTarget,
  samePosition,
  stepTarget,
  validTargetsFor,
  type CommandSource,
  type CommandState,
} from "./blockCommand";
import { clearGrid } from "./grid";
import type { BlockData, GridData } from "../types/grid";

// =============================================================================
// HARNESS
// =============================================================================

const block = (overrides: Partial<BlockData> = {}): BlockData => ({
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

/** A grid with one block already placed, so diagonal placement is in play. */
const gridWith = (col: number, row: number, b = block()): GridData => {
  const grid = clearGrid(2, 3);
  grid[col][row].push(b);
  return grid;
};

const providerSource: CommandSource = {
  kind: "provider",
  type: "limit",
  label: "Limit",
};

const gridSource: CommandSource = {
  kind: "grid",
  id: "b1",
  label: "Limit",
  origin: { col: 0, row: 1 },
};

const carrying = (
  source: CommandSource,
  target = { col: 0, row: 1 },
  targets = [
    { col: 0, row: 1 },
    { col: 1, row: 1 },
  ],
): CommandState => ({ carrying: { source, target, targets } });

// =============================================================================
// TARGET SELECTION
// =============================================================================

describe("validTargetsFor", () => {
  it("offers only the primary row while the grid is empty", () => {
    const targets = validTargetsFor([0, 1], clearGrid(2, 3), "conditional");

    expect(targets).toEqual([
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ]);
  });

  it("offers the diagonals of an occupied cell once one block is placed", () => {
    const targets = validTargetsFor([0, 1, 2], gridWith(0, 1), "conditional");

    expect(targets).toEqual([
      { col: 1, row: 0 },
      { col: 1, row: 2 },
    ]);
  });

  it("respects the order type's allowed rows", () => {
    // A take-profit may not sit in the bottom row, so only one diagonal remains.
    const targets = validTargetsFor([0, 1], gridWith(0, 1), "conditional");

    expect(targets).toEqual([{ col: 1, row: 0 }]);
  });

  it("offers every cell in the bulk pattern, which has no row rules", () => {
    expect(validTargetsFor([1], clearGrid(2, 3), "bulk")).toHaveLength(6);
  });
});

describe("initialTarget", () => {
  it("prefers the block's own cell when it is still a legal target", () => {
    const targets = [
      { col: 0, row: 0 },
      { col: 1, row: 2 },
    ];

    expect(initialTarget(targets, { col: 1, row: 2 })).toEqual({
      col: 1,
      row: 2,
    });
  });

  it("falls back to the first legal cell when the preferred one is not one", () => {
    const targets = [{ col: 1, row: 0 }];

    expect(initialTarget(targets, { col: 0, row: 1 })).toEqual({
      col: 1,
      row: 0,
    });
  });

  it("is null when the block cannot be placed anywhere", () => {
    expect(initialTarget([], { col: 0, row: 1 })).toBeNull();
  });
});

describe("stepTarget", () => {
  const targets = [
    { col: 0, row: 0 },
    { col: 0, row: 2 },
    { col: 1, row: 1 },
  ];

  it("skips illegal cells rather than landing on one", () => {
    // (0,1) is not a legal target, so moving down from (0,0) reaches (0,2).
    expect(stepTarget(targets, { col: 0, row: 0 }, 0, 1)).toEqual({
      col: 0,
      row: 2,
    });
  });

  it("stays put when there is nothing legal in that direction", () => {
    expect(stepTarget(targets, { col: 0, row: 0 }, 0, -1)).toEqual({
      col: 0,
      row: 0,
    });
  });

  it("takes the nearest cell that way when nothing is straight ahead", () => {
    // Nothing sits to the right of (0,2) in its own row, so the step lands on
    // the nearest legal cell in the next column instead of doing nothing.
    expect(stepTarget(targets, { col: 0, row: 2 }, 1, 0)).toEqual({
      col: 1,
      row: 1,
    });
  });

  it("reaches a diagonal, which is the only shape the placement rule leaves", () => {
    // A block in the Entry primary cell leaves one legal target: the diagonal.
    // A strictly orthogonal step could never get there.
    const diagonal = [
      { col: 0, row: 1 },
      { col: 1, row: 0 },
    ];

    expect(stepTarget(diagonal, { col: 0, row: 1 }, 1, 0)).toEqual({
      col: 1,
      row: 0,
    });
    expect(stepTarget(diagonal, { col: 0, row: 1 }, 0, -1)).toEqual({
      col: 1,
      row: 0,
    });
  });

  it("is a no-op for a zero step", () => {
    const current = { col: 1, row: 1 };
    expect(stepTarget(targets, current, 0, 0)).toBe(current);
  });
});

// =============================================================================
// STATE MACHINE: PICK UP, MOVE, PLACE, CANCEL
// =============================================================================

describe("commandReducer", () => {
  describe("pick up", () => {
    it("starts carrying at the preferred cell", () => {
      const targets = [
        { col: 0, row: 1 },
        { col: 1, row: 1 },
      ];

      const next = commandReducer(IDLE_COMMAND_STATE, {
        type: "pickUp",
        source: gridSource,
        targets,
        preferred: { col: 1, row: 1 },
      });

      expect(next.carrying).toEqual({
        source: gridSource,
        target: { col: 1, row: 1 },
        targets,
      });
    });

    it("starts at the first legal cell when nothing is preferred", () => {
      const next = commandReducer(IDLE_COMMAND_STATE, {
        type: "pickUp",
        source: providerSource,
        targets: [
          { col: 1, row: 0 },
          { col: 1, row: 2 },
        ],
      });

      expect(next.carrying?.target).toEqual({ col: 1, row: 0 });
    });

    it("refuses to pick up a block that has nowhere legal to go", () => {
      // Otherwise the user ends up holding something they cannot put down.
      const next = commandReducer(IDLE_COMMAND_STATE, {
        type: "pickUp",
        source: providerSource,
        targets: [],
      });

      expect(next).toBe(IDLE_COMMAND_STATE);
    });

    it("replaces what is already being carried", () => {
      const next = commandReducer(carrying(providerSource), {
        type: "pickUp",
        source: gridSource,
        targets: [{ col: 1, row: 2 }],
      });

      expect(next.carrying?.source).toEqual(gridSource);
      expect(next.carrying?.target).toEqual({ col: 1, row: 2 });
    });
  });

  describe("move", () => {
    it("moves the target to the next legal cell", () => {
      const next = commandReducer(carrying(providerSource), {
        type: "moveTarget",
        dCol: 1,
        dRow: 0,
      });

      expect(next.carrying?.target).toEqual({ col: 1, row: 1 });
    });

    it("returns the same state object when nothing moves", () => {
      // Identity is what tells the caller to announce "no cell that way"
      // instead of announcing a cell the user is already on.
      const state = carrying(providerSource);

      expect(
        commandReducer(state, { type: "moveTarget", dCol: -1, dRow: 0 }),
      ).toBe(state);
    });

    it("does nothing while idle", () => {
      expect(
        commandReducer(IDLE_COMMAND_STATE, {
          type: "moveTarget",
          dCol: 0,
          dRow: 1,
        }),
      ).toBe(IDLE_COMMAND_STATE);
    });

    it("keeps the source and the legal targets across a move", () => {
      const state = carrying(providerSource);

      const next = commandReducer(state, {
        type: "moveTarget",
        dCol: 1,
        dRow: 0,
      });

      expect(next.carrying?.source).toBe(state.carrying?.source);
      expect(next.carrying?.targets).toBe(state.carrying?.targets);
    });
  });

  describe("place and cancel", () => {
    it("returns to idle on place", () => {
      expect(
        commandReducer(carrying(gridSource), { type: "place" }).carrying,
      ).toBeNull();
    });

    it("returns to idle on cancel", () => {
      expect(
        commandReducer(carrying(gridSource), { type: "cancel" }).carrying,
      ).toBeNull();
    });

    it("is a no-op when nothing is being carried", () => {
      expect(commandReducer(IDLE_COMMAND_STATE, { type: "place" })).toBe(
        IDLE_COMMAND_STATE,
      );
      expect(commandReducer(IDLE_COMMAND_STATE, { type: "cancel" })).toBe(
        IDLE_COMMAND_STATE,
      );
    });
  });

  it("survives a full pick up, move, place cycle", () => {
    let state = commandReducer(IDLE_COMMAND_STATE, {
      type: "pickUp",
      source: providerSource,
      targets: [
        { col: 0, row: 1 },
        { col: 1, row: 1 },
      ],
    });
    state = commandReducer(state, { type: "moveTarget", dCol: 1, dRow: 0 });
    expect(state.carrying?.target).toEqual({ col: 1, row: 1 });

    state = commandReducer(state, { type: "place" });
    expect(state.carrying).toBeNull();
  });
});

// =============================================================================
// DESCRIPTIONS
// =============================================================================

describe("descriptions", () => {
  it("names conditional cells by column and row role", () => {
    expect(describeCell({ col: 0, row: 1 })).toBe("Entry column, primary row");
    expect(describeCell({ col: 1, row: 2 })).toBe(
      "Exit column, lower conditional row",
    );
  });

  it("names bulk cells by number, because the rows carry no role there", () => {
    expect(describeCell({ col: 1, row: 0 }, "bulk")).toBe("Exit column, row 1");
  });

  it("distinguishes a palette entry from a placed block", () => {
    expect(describeSource(providerSource)).toBe("Limit order");
    expect(describeSource(gridSource)).toBe("Limit block");
  });
});

describe("samePosition", () => {
  it("compares by value", () => {
    expect(samePosition({ col: 1, row: 2 }, { col: 1, row: 2 })).toBe(true);
    expect(samePosition({ col: 1, row: 2 }, { col: 1, row: 0 })).toBe(false);
  });

  it("is false for anything missing", () => {
    expect(samePosition(null, { col: 0, row: 0 })).toBe(false);
    expect(samePosition({ col: 0, row: 0 }, undefined)).toBe(false);
  });
});
