import { describe, it, expect } from "vitest";
import { describeOutcome, type GridOutcome } from "@utils/gridAnnouncements";
import type { CommandSource } from "@utils/blockCommand";
import type { PlacementResult } from "@/types/grid";

// =============================================================================
// GRID ANNOUNCEMENTS
// =============================================================================
//
// Every sentence the strategy grid can speak is reachable from here, without a
// DOM, because one pure function writes all of them. That is the point of the
// module: a wording change has exactly one place to happen and one place to be
// checked, instead of being spread across the carry, the drop handler and the
// palette drag handler as three near-copies that drifted.

const palette: CommandSource = {
  kind: "provider",
  type: "market",
  label: "Market",
};

const placed: CommandSource = {
  kind: "grid",
  id: "b1",
  label: "Market",
  origin: { col: 0, row: 1 },
};

const cell = { col: 1, row: 0 };

const say = (outcome: GridOutcome) => describeOutcome(outcome, "conditional");

describe("describeOutcome, picking a block up", () => {
  it("names the target and the keys that reach it", () => {
    expect(
      say({ kind: "pickedUp", source: palette, target: cell, origin: "keyboard" }),
    ).toBe(
      "Picked up Market order. Use the arrow keys to choose a cell, Enter to place, Escape to cancel. Target: Exit column, upper conditional row.",
    );
  });

  it("gives a finger the instructions a finger can follow", () => {
    expect(
      say({ kind: "pickedUp", source: palette, target: cell, origin: "pointer" }),
    ).toContain("Tap a highlighted cell to place it");
  });

  it("says when there is nowhere to put the order at all", () => {
    expect(say({ kind: "pickUpRefused", source: palette, reason: "noTargets" })).toBe(
      "Market order cannot be placed anywhere in the grid right now.",
    );
  });

  it("says the block already in hand survived a refused pick-up", () => {
    // Reaching for a second order type is a swap, and a refused swap leaves the
    // first order still carried. The same words `cellRefused` uses, because two
    // forms for one fact is how the wording drifted apart in the first place.
    expect(
      say({
        kind: "pickUpRefused",
        source: { kind: "provider", type: "take-profit", label: "Take Profit" },
        reason: "noTargets",
        carrying: placed,
      }),
    ).toBe(
      "Take Profit order cannot be placed anywhere in the grid right now. Still carrying Market block.",
    );
  });

  it("names the affordance a priced block does wire", () => {
    expect(
      say({ kind: "moveRefused", label: "Limit", reason: "onPriceAxis" }),
    ).toBe(
      "Limit is priced on this axis and cannot be moved to another cell. Use the arrow keys to change its price.",
    );
  });

  it("promises no arrow keys when refusing a dual-axis leg", () => {
    expect(
      say({ kind: "moveRefused", label: "Stop Loss Limit", reason: "dualAxisPartner" }),
    ).toBe(
      "Stop Loss Limit cannot be moved on its own: its trigger and limit must stay in the same cell.",
    );
  });
});

describe("describeOutcome, choosing a cell", () => {
  it("names the cell the arrows landed on", () => {
    expect(say({ kind: "targetChanged", target: cell })).toBe(
      "Exit column, upper conditional row, ready to place.",
    );
  });

  it("says so rather than going quiet at the edge of the grid", () => {
    expect(say({ kind: "noTargetThatWay" })).toBe(
      "No cell available in that direction.",
    );
  });

  it("says the carry survived a refused cell", () => {
    // The highlight that shows a live carry is not available to a screen-reader
    // user, so a bare refusal leaves them unable to tell whether the block is
    // still in hand.
    expect(say({ kind: "cellRefused", source: palette, cell })).toBe(
      "Exit column, upper conditional row cannot take this order. Still carrying Market order.",
    );
  });
});

describe("describeOutcome, a carry that ends without a placement", () => {
  it("sends a palette order back to the palette", () => {
    expect(say({ kind: "carryEnded", source: palette, reason: "cancelled" })).toBe(
      "Cancelled. Market order returned to the palette.",
    );
  });

  it("names the cell a placed block was left in", () => {
    expect(say({ kind: "carryEnded", source: placed, reason: "cancelled" })).toBe(
      "Cancelled. Market block left in Entry column, primary row.",
    );
  });

  it("says a drag took the interaction over rather than the user cancelling", () => {
    // Not a cancellation: the user did not ask for it, and telling them they
    // cancelled something would misdescribe their own gesture.
    expect(say({ kind: "carryEnded", source: palette, reason: "superseded" })).toBe(
      "Market order returned to the palette: a drag took over.",
    );
    expect(say({ kind: "carryEnded", source: placed, reason: "superseded" })).toBe(
      "Market block left in Entry column, primary row: a drag took over.",
    );
  });
});

describe("describeOutcome, what the grid actually did", () => {
  const placement = (result: PlacementResult, via: "carry" | "drag") =>
    say({ kind: "placement", source: placed, cell, result, via });

  it("says a new block was placed", () => {
    expect(
      say({
        kind: "placement",
        source: palette,
        cell,
        result: { status: "created", blockId: "b9" },
        via: "carry",
      }),
    ).toBe("Placed Market order in Exit column, upper conditional row.");
  });

  it("says an existing block moved, the same way for a tap and for a drag", () => {
    const moved: PlacementResult = { status: "moved", blockId: "b1" };
    expect(placement(moved, "carry")).toBe(
      "Moved Market block to Exit column, upper conditional row.",
    );
    expect(placement(moved, "drag")).toBe(placement(moved, "carry"));
  });

  it("says a block that went nowhere stayed where it is", () => {
    // The defect this module was built for: a release inside the block's own
    // cell. Nothing changed, and the cell holding the block did not refuse it.
    expect(
      say({
        kind: "placement",
        source: placed,
        cell: { col: 0, row: 1 },
        result: { status: "unchanged", blockId: "b1" },
        via: "drag",
      }),
    ).toBe("Market block stayed in Entry column, primary row.");
  });

  it("says where a refused block still is, and does not say it moved", () => {
    expect(placement({ status: "refused" }, "drag")).toBe(
      "Exit column, upper conditional row cannot take this order. Market block stayed in Entry column, primary row.",
    );
  });

  it("says a palette order that was refused does not exist", () => {
    expect(
      say({
        kind: "placement",
        source: palette,
        cell,
        result: { status: "refused" },
        via: "drag",
      }),
    ).toBe(
      "Exit column, upper conditional row cannot take this order. Market order was not placed.",
    );
  });

  it("says a same-cell release also took the block out of the user's hand", () => {
    // Carrying a block and then nudging that same block is one gesture with two
    // consequences, and the second one is invisible: the carry is gone, so the
    // next tap on a cell will do nothing. One sentence says both, because two
    // live-region writes in a row can cut the first one off.
    expect(
      say({
        kind: "placement",
        source: placed,
        cell: { col: 0, row: 1 },
        result: { status: "unchanged", blockId: "b1" },
        via: "drag",
        releasedCarry: true,
      }),
    ).toBe(
      "Market block stayed in Entry column, primary row, and is no longer picked up.",
    );
  });

  it("says a refused release also took the block out of the user's hand", () => {
    expect(
      say({
        kind: "placement",
        source: placed,
        cell,
        result: { status: "refused" },
        via: "drag",
        releasedCarry: true,
      }),
    ).toBe(
      "Exit column, upper conditional row cannot take this order. Market block stayed in Entry column, primary row, and is no longer picked up.",
    );
  });

  it("leaves a move to speak for itself, since it names the block already", () => {
    // "created", "moved" and "removed" already describe something happening to
    // the very block that was carried, so repeating that it is no longer in
    // hand is noise rather than news.
    const moved: PlacementResult = { status: "moved", blockId: "b1" };
    expect(
      say({
        kind: "placement",
        source: placed,
        cell,
        result: moved,
        via: "drag",
        releasedCarry: true,
      }),
    ).toBe("Moved Market block to Exit column, upper conditional row.");
    expect(say({ kind: "removed", source: placed, releasedCarry: true })).toBe(
      "Removed Market block from the grid.",
    );
  });

  it("names the cell the grid confirmed rather than the pick-up snapshot", () => {
    // `source.origin` is where the block was when it was picked up. Reverse
    // Blocks can mirror it into the other column while it is carried, and the
    // refusal must not name the cell it left.
    expect(placement({ status: "refused", at: { col: 1, row: 1 } }, "carry")).toBe(
      "Exit column, upper conditional row cannot take this order any more. Market block stayed in Exit column, primary row.",
    );
  });

  it("names no cell for a block that is no longer on the grid", () => {
    // The one case where there is no true cell to give: the grid was replaced
    // under the carry. Any location here would be a claim nothing supports.
    const gone = say({
      kind: "placement",
      source: placed,
      cell,
      result: { status: "gone" },
      via: "carry",
    });
    expect(gone).toBe("Market block is no longer on the grid.");
    expect(gone).not.toContain("column");

    expect(
      say({
        kind: "placement",
        source: placed,
        cell,
        result: { status: "gone" },
        via: "drag",
        releasedCarry: true,
      }),
    ).toBe("Market block is no longer on the grid, and is no longer picked up.");
  });

  it("says 'any more' only for a carry, whose targets were offered", () => {
    // The arrow keys walk cells the grid offered at pick-up time, so a refusal
    // there means the grid has changed since. A drag can be released over any
    // cell, and most were never on offer.
    expect(placement({ status: "refused" }, "carry")).toContain(
      "cannot take this order any more.",
    );
  });
});

describe("describeOutcome, a drag that ends without a placement", () => {
  it("says a block dragged off the grid was removed", () => {
    expect(say({ kind: "removed", source: placed })).toBe(
      "Removed Market block from the grid.",
    );
  });

  it("says a palette drag released off the grid created nothing", () => {
    expect(say({ kind: "dragEnded", source: palette, reason: "offGrid" })).toBe(
      "Released outside the grid. Market order was not placed.",
    );
  });

  it("says where a block is after the browser cancels the drag", () => {
    expect(say({ kind: "dragEnded", source: placed, reason: "aborted" })).toBe(
      "Drag cancelled. Market block stayed in Entry column, primary row.",
    );
  });

  it("says a drag that ended nowhere still cost the user their carry", () => {
    expect(
      say({
        kind: "dragEnded",
        source: placed,
        reason: "aborted",
        releasedCarry: true,
      }),
    ).toBe(
      "Drag cancelled. Market block stayed in Entry column, primary row, and is no longer picked up.",
    );
    expect(
      say({
        kind: "dragEnded",
        source: palette,
        reason: "offGrid",
        releasedCarry: true,
      }),
    ).toBe(
      "Released outside the grid. Market order was not placed, and is no longer picked up.",
    );
  });
});

describe("describeOutcome, the pattern it is speaking about", () => {
  it("names bulk rows by number, because they have no roles", () => {
    expect(
      describeOutcome({ kind: "targetChanged", target: cell }, "bulk"),
    ).toBe("Exit column, row 1, ready to place.");
  });
});
