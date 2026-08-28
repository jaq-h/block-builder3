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
      say({ kind: "pickedUp", source: palette, target: cell, origin: "touch" }),
    ).toContain("Tap a highlighted cell to place it");
  });

  it("gives a mouse the instructions a mouse can follow", () => {
    // A mouse user told to "tap" is being addressed as somebody else, and the
    // block really is on their cursor - which no other device can be told.
    const said = say({
      kind: "pickedUp",
      source: palette,
      target: cell,
      origin: "mouse",
    });
    expect(said).toContain("It follows the cursor");
    expect(said).toContain("Click a highlighted cell to place it");
    expect(said).not.toContain("Tap");
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
      "Limit is priced on this axis and cannot be moved to another cell. Use the arrow keys to change its price, or Delete to remove it and place a new one.",
    );
  });

  // FORMERLY the "dualAxisPartner" refusal, which read "Stop Loss Limit cannot
  // be moved on its own: its trigger and limit must stay in the same cell."
  // That special case is gone with the move it guarded: under decision D9 no
  // placed block changes cells, so the general rule already covers a dual-axis
  // leg, and a block in a cell with no price axis has no arrow keys to be
  // offered instead - only "remove it and place a new one".
  it("says how to correct a misplaced order when there is no axis to offer", () => {
    expect(
      say({ kind: "moveRefused", label: "Market", reason: "staysInCell" }),
    ).toBe(
      "Market stays in the cell it was placed in. To put this order somewhere else, press Delete to remove it and place a new one.",
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
    expect(
      say({
        kind: "carryEnded",
        source: placed,
        reason: "cancelled",
        at: { col: 0, row: 1 },
      }),
    ).toBe("Cancelled. Market block left in Entry column, primary row.");
  });

  it("says a drag took the interaction over rather than the user cancelling", () => {
    // Not a cancellation: the user did not ask for it, and telling them they
    // cancelled something would misdescribe their own gesture.
    expect(say({ kind: "carryEnded", source: palette, reason: "superseded" })).toBe(
      "Market order returned to the palette: a drag took over.",
    );
    expect(
      say({
        kind: "carryEnded",
        source: placed,
        reason: "superseded",
        at: { col: 0, row: 1 },
      }),
    ).toBe("Market block left in Entry column, primary row: a drag took over.");
  });

  it("names the cell the grid confirmed, never the pick-up snapshot", () => {
    // `placed.origin` is Entry/primary. Reverse Blocks moves the block to the
    // other column while it is carried, and the grid's answer wins.
    expect(
      say({
        kind: "carryEnded",
        source: placed,
        reason: "cancelled",
        at: { col: 1, row: 1 },
      }),
    ).toBe("Cancelled. Market block left in Exit column, primary row.");
  });

  it("names no cell when the grid can no longer find the block", () => {
    // Clear All. Both reasons have to stay grammatical with the cell-less
    // clause substituted in, since both frame it differently.
    const cancelled = say({
      kind: "carryEnded",
      source: placed,
      reason: "cancelled",
    });
    expect(cancelled).toBe("Cancelled. Market block is no longer on the grid.");
    expect(cancelled).not.toContain("column");

    const superseded = say({
      kind: "carryEnded",
      source: placed,
      reason: "superseded",
    });
    expect(superseded).toBe(
      "Market block is no longer on the grid: a drag took over.",
    );
    expect(superseded).not.toContain("column");
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

  it("leaves a placement to speak for itself, since it names the block already", () => {
    // "created" and "removed" already describe something happening to the very
    // block that was carried, so repeating that it is no longer in hand is
    // noise rather than news. The "moved" outcome used to be the third of
    // these; decision D9 removed the capability, so the variant went with it.
    expect(
      say({
        kind: "placement",
        source: palette,
        cell,
        result: { status: "created", blockId: "b1" },
        via: "drag",
        releasedCarry: true,
      }),
    ).toBe("Placed Market order in Exit column, upper conditional row.");
    expect(say({ kind: "removed", source: placed, releasedCarry: true })).toBe(
      "Removed Market block from Entry column, primary row.",
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
      "Removed Market block from Entry column, primary row.",
    );
  });

  // The two legs of a dual-axis order type share a label AND a cell, so neither
  // names the one that went. The leg is the only thing left, and it is the same
  // leg the block's own remove control is named with.
  it("names the leg a removed block was drawn on, where its cell drew one", () => {
    const stopLossLimit = { ...placed, label: "Stop Loss Limit" };

    expect(say({ kind: "removed", source: stopLossLimit, leg: "trigger" })).toBe(
      "Removed Stop Loss Limit trigger block from Entry column, primary row.",
    );
    expect(say({ kind: "removed", source: stopLossLimit, leg: "limit" })).toBe(
      "Removed Stop Loss Limit limit block from Entry column, primary row.",
    );
  });

  // A cell that draws no axis has no leg to give, and the sentence must not
  // invent one: `legInCell` answers `null` there and the block keeps its name.
  it("names no leg for a block whose cell draws no axis", () => {
    expect(say({ kind: "removed", source: placed, leg: null })).toBe(
      "Removed Market block from Entry column, primary row.",
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

describe("describeOutcome, a market change", () => {
  // The `<select>` speaks its own new value, so this sentence is deliberately
  // not about the control. It is about the consequence, which is invisible
  // without sight of the grid: every price chip on screen just changed.
  it("says what changed about the grid, not what the control now reads", () => {
    expect(say({ kind: "marketChanged", name: "Solana", symbol: "SOL/USD" })).toBe(
      "Market changed to Solana. Every block on the grid is now priced from the SOL/USD market price.",
    );
  });

  // It lives in this module, and only this module, for the same reason every
  // other sentence does: a second announcer next to the selector is exactly the
  // shape the owner rule exists to prevent.
  it("is one of the outcomes the announcer owns, not a message a caller wrote", () => {
    expect(
      say({ kind: "marketChanged", name: "Arbitrum", symbol: "ARB/USD" }),
    ).toMatch(/^Market changed to Arbitrum\./);
  });
});

describe("describeOutcome, a strategy that did load", () => {
  // One sentence for one press of Edit. The strategy came back and it may have
  // brought a different market with it, and reporting those as two outcomes is
  // two live-region writes in quick succession - the shape whose first write
  // this module's own history records being cut off by the second.
  it("says both facts in one sentence when the market moved with it", () => {
    const said = say({
      kind: "strategyLoaded",
      name: "Arbitrum",
      symbol: "ARB/USD",
      marketChanged: true,
    });

    expect(said).toBe(
      "Saved strategy loaded onto the grid. The market changed to Arbitrum, so every block is now priced from the ARB/USD market price.",
    );
  });

  // A strategy reloaded on the pair already selected has not moved the user
  // anywhere, and claiming a market change that did not happen is the kind of
  // sentence-next-to-the-action defect this module replaced.
  it("claims no market change when the strategy came back on the selected pair", () => {
    const said = say({
      kind: "strategyLoaded",
      name: "Bitcoin",
      symbol: "BTC/USD",
      marketChanged: false,
    });

    expect(said).toContain("Saved strategy loaded onto the grid");
    expect(said).toContain("BTC/USD");
    expect(said).not.toContain("changed");
  });
});

describe("describeOutcome, a strategy that would not load", () => {
  // A saved strategy holds percentage offsets from *its own* market's price, so
  // loading it against a different pair reprices the whole thing into another
  // order set. The builder refuses, and a refusal nobody hears is barely better
  // than the silent repricing it replaced - so it names the market and says the
  // grid was left alone.
  it("names the market and says the strategy was not loaded", () => {
    const said = say({
      kind: "strategyMarketUnavailable",
      symbol: "ARB/USD",
    });

    expect(said).toContain("ARB/USD");
    expect(said).toContain("was not loaded");
  });
});
