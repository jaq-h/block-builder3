import { describe, it, expect } from "vitest";

import {
  createBlocksFromOrderType,
  shouldShowPercentage,
} from "@utils/blockFactory";
import type { BlockData } from "@/types/grid";
import type { OrderTypeDefinition } from "@data/orderTypes";
import { ORDER_TYPES, getOrderType } from "@data/orderTypes";

// =============================================================================
// FIXTURES
// =============================================================================

/** Look an order type up by name and fail loudly if the catalogue changed. */
const orderType = (type: string): OrderTypeDefinition => {
  const def = getOrderType(type);
  if (!def) throw new Error(`ORDER_TYPES no longer defines "${type}"`);
  return def;
};

const context = { baseId: "sa", counter: 0 };

const block = (overrides: Partial<BlockData> = {}): BlockData => ({
  id: "sa-limit-1",
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

// =============================================================================
// BLOCK CREATION
// =============================================================================

describe("createBlocksFromOrderType", () => {
  it("creates one axis-less block for a market order, with no price level", () => {
    const { blocks, nextCounter } = createBlocksFromOrderType(
      orderType("market"),
      context,
    );

    expect(blocks).toHaveLength(1);
    expect(nextCounter).toBe(1);
    expect(blocks[0]).toMatchObject({
      id: "sa-market-1",
      orderType: "market",
      label: "Market",
      abrv: "Mkt",
      axis: 1,
      // -1 is the sentinel for "this block has no price level at all".
      yPosition: -1,
      axes: [],
    });
  });

  it("creates one limit-axis block seeded from the type's default position", () => {
    const { blocks, nextCounter } = createBlocksFromOrderType(
      orderType("limit"),
      context,
    );

    expect(blocks).toHaveLength(1);
    expect(nextCounter).toBe(1);
    expect(blocks[0]).toMatchObject({
      id: "sa-limit-1",
      orderType: "limit",
      abrv: "Lmt",
      axis: 2,
      yPosition: orderType("limit").defaults?.limit,
      axes: ["limit"],
    });
  });

  it("creates one trigger-axis block for a stop loss", () => {
    const { blocks } = createBlocksFromOrderType(
      orderType("stop-loss"),
      context,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      id: "sa-stop-loss-1",
      axis: 1,
      yPosition: orderType("stop-loss").defaults?.trigger,
      axes: ["trigger"],
    });
  });

  it("splits a dual-axis type into a trigger block and a limit block", () => {
    const def = orderType("stop-loss-limit");
    const { blocks, nextCounter } = createBlocksFromOrderType(def, context);

    expect(blocks).toHaveLength(2);
    // Both blocks come from one drag, so the counter advances twice.
    expect(nextCounter).toBe(2);

    const [trigger, limit] = blocks;

    expect(trigger).toMatchObject({
      id: "sa-stop-loss-limit-1",
      axis: 1,
      yPosition: def.defaults?.trigger,
      axes: ["trigger"],
      abrv: "SL-Lmt",
    });

    expect(limit).toMatchObject({
      id: "sa-stop-loss-limit-limit-2",
      axis: 2,
      yPosition: def.defaults?.limit,
      axes: ["limit"],
      // The limit leg is suffixed so the two legs are distinguishable in the UI.
      abrv: "SL-Lmt-L",
    });
  });

  it("continues from the counter it is handed, so ids stay unique", () => {
    const first = createBlocksFromOrderType(orderType("limit"), {
      baseId: "sa",
      counter: 7,
    });
    const second = createBlocksFromOrderType(orderType("limit"), {
      baseId: "sa",
      counter: first.nextCounter,
    });

    expect(first.blocks[0].id).toBe("sa-limit-8");
    expect(second.blocks[0].id).toBe("sa-limit-9");
    expect(second.nextCounter).toBe(9);
  });

  it("namespaces ids by baseId so two grids cannot collide", () => {
    const a = createBlocksFromOrderType(orderType("limit"), {
      baseId: "assembly",
      counter: 0,
    });
    const b = createBlocksFromOrderType(orderType("limit"), {
      baseId: "preview",
      counter: 0,
    });

    expect(a.blocks[0].id).toBe("assembly-limit-1");
    expect(b.blocks[0].id).toBe("preview-limit-1");
  });

  it("copies the type's allowed rows onto every block it produces", () => {
    const def = orderType("take-profit-limit");
    const { blocks } = createBlocksFromOrderType(def, context);

    blocks.forEach((b) => expect(b.allowedRows).toEqual(def.allowedRows));
  });

  it("starts every block on the upside so the sign is set at placement time", () => {
    ORDER_TYPES.forEach((def) => {
      createBlocksFromOrderType(def, context).blocks.forEach((b) =>
        expect(b.direction).toBe("upside"),
      );
    });
  });

  it("handles every type in the catalogue without dropping one", () => {
    ORDER_TYPES.forEach((def) => {
      const { blocks, nextCounter } = createBlocksFromOrderType(def, context);
      const expected = def.axes.length === 2 ? 2 : 1;

      expect(blocks).toHaveLength(expected);
      expect(nextCounter).toBe(expected);
      blocks.forEach((b) => expect(b.orderType).toBe(def.type));
    });
  });

  it("produces nothing for a type whose axes match none of the shapes it knows", () => {
    const { blocks, nextCounter } = createBlocksFromOrderType(
      { ...orderType("limit"), axes: ["trigger", "trigger"] },
      context,
    );

    expect(blocks).toEqual([]);
    expect(nextCounter).toBe(0);
  });
});

// =============================================================================
// ICON SELECTION
// =============================================================================

describe("icon selection", () => {
  it("gives the trigger axis of a -limit variant the base type's icon", () => {
    // A stop-loss-limit's trigger leg should read as a stop loss, not as the
    // combined stop-loss-limit glyph.
    const { blocks } = createBlocksFromOrderType(
      orderType("stop-loss-limit"),
      context,
    );

    blocks.forEach((b) => {
      expect(b.triggerIcon).toBe(orderType("stop-loss").icon);
      expect(b.providerIcon).toBe(orderType("stop-loss-limit").icon);
    });
  });

  it("gives the trigger axis of a plain type its own icon", () => {
    const { blocks } = createBlocksFromOrderType(
      orderType("take-profit"),
      context,
    );

    expect(blocks[0].triggerIcon).toBe(orderType("take-profit").icon);
  });

  it("gives every limit axis the shared limit icon, whatever the order type", () => {
    const plain = createBlocksFromOrderType(orderType("limit"), context)
      .blocks[0];
    const dual = createBlocksFromOrderType(
      orderType("trailing-stop-limit"),
      context,
    ).blocks[1];

    expect(plain.limitIcon).toBeDefined();
    expect(dual.limitIcon).toBe(plain.limitIcon);
  });

  it("leaves the trigger icon unset on a type with no trigger axis", () => {
    const { blocks } = createBlocksFromOrderType(orderType("limit"), context);

    expect(blocks[0].triggerIcon).toBeUndefined();
  });

  it("leaves the limit icon unset on a type with no limit axis", () => {
    const { blocks } = createBlocksFromOrderType(
      orderType("stop-loss"),
      context,
    );

    expect(blocks[0].limitIcon).toBeUndefined();
  });
});

// =============================================================================
// BLOCK PREDICATES
// =============================================================================

describe("shouldShowPercentage", () => {
  it("shows a percentage for a positioned block", () => {
    expect(shouldShowPercentage(block({ axes: ["limit"], yPosition: 25 }))).toBe(
      true,
    );
  });

  it("shows 0% rather than hiding it", () => {
    expect(shouldShowPercentage(block({ axes: ["limit"], yPosition: 0 }))).toBe(
      true,
    );
  });

  it("hides the percentage for a market block", () => {
    expect(shouldShowPercentage(block({ axes: [], yPosition: -1 }))).toBe(false);
  });

  it("hides the percentage for an axis-bearing block still at the -1 sentinel", () => {
    expect(shouldShowPercentage(block({ axes: ["limit"], yPosition: -1 }))).toBe(
      false,
    );
  });
});

// `isBlockVerticallyDraggable` and `buildOrderConfigEntry` were tested here and
// have moved to the block-to-price mapping owner, as `legOfBlock` and
// `orderConfigFromGrid` - see `blockMapping.test.ts`. Both answered from a
// block in isolation and both were wrong for it: the first disagreed with the
// renderer about whether a limit leg beside a Market order sits on an axis,
// and the second recorded whatever direction the block happened to carry
// rather than the one its cell draws. The leg is now a fact about the block
// alone and the direction is a fact about the cell, and one owner states both.
