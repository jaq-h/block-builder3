import { describe, it, expect } from "vitest";

import { orderPriceLines } from "./orderPriceLines";
import { priceForOffset } from "@utils/blockMapping";
import { priceAtOffset } from "@utils/price";
import type { OrderConfig } from "@/types/grid";

// =============================================================================
// THE CHART AND THE GRID AGREE ABOUT A PRICE
// =============================================================================
//
// This file exists for one reason: the chart used to inline its own copy of
// "percentage offset from market" to place its order lines, alongside the copy
// in `priceAtOffset` that the grid chip and the Kraken payload are built from.
// Two copies of one fact is the defect class this project has spent two days
// deleting, and a logarithmic price scale is only safe to ship because the
// scale cannot reach the number - so the number has to have exactly one owner.
//
// `orderPriceLines.dom.test.tsx` carries the other half: that the sentence the
// grid cell actually renders is the same price.

const MARKET = 50_000;

const config = (entries: OrderConfig): OrderConfig => entries;

describe("orderPriceLines", () => {
  it("prices a block through the same formula the grid and the mapper use", () => {
    const orders = config({
      a: { col: 0, row: 1, type: "limit", axis: 2, yPosition: 25, direction: "downside" },
      b: { col: 1, row: 1, type: "take-profit", axis: 1, yPosition: 12.5, direction: "upside" },
    });

    const lines = orderPriceLines(orders, MARKET);

    for (const line of lines) {
      const order = orders[line.id];
      expect(line.price).toBe(
        priceForOffset(MARKET, order.yPosition!, order.direction!),
      );
      expect(line.price).toBe(
        priceAtOffset(MARKET, order.yPosition!, order.direction === "downside"),
      );
    }
  });

  it("reads a yPosition of 25 as 25 percent, not 2.5 (decision D3)", () => {
    const lines = orderPriceLines(
      config({
        below: { col: 0, row: 1, type: "limit", axis: 2, yPosition: 25, direction: "downside" },
        above: { col: 1, row: 1, type: "limit", axis: 2, yPosition: 25, direction: "upside" },
      }),
      MARKET,
    );

    expect(lines.find((l) => l.id === "below")!.price).toBe(37_500);
    expect(lines.find((l) => l.id === "above")!.price).toBe(62_500);
  });

  it("takes the side of the market from the block's own direction", () => {
    // Not from the row or the column: those disagree under the bulk pattern,
    // where a Stop Loss and a Limit in one cell are stamped opposite ways.
    const lines = orderPriceLines(
      config({
        limit: { col: 0, row: 1, type: "limit", axis: 2, yPosition: 10, direction: "downside" },
        stop: { col: 0, row: 1, type: "stop-loss", axis: 1, yPosition: 10, direction: "upside" },
      }),
      MARKET,
    );

    expect(lines.find((l) => l.id === "limit")!.price).toBeCloseTo(45_000, 6);
    expect(lines.find((l) => l.id === "stop")!.price).toBeCloseTo(55_000, 6);
  });

  it("names the column, the order type and, for a dual-axis type, the leg", () => {
    const lines = orderPriceLines(
      config({
        one: { col: 0, row: 1, type: "limit", axis: 2, yPosition: 5, direction: "downside" },
        two: { col: 1, row: 2, type: "stop-loss-limit", axis: 1, yPosition: 5, direction: "downside" },
        three: { col: 1, row: 2, type: "stop-loss-limit", axis: 2, yPosition: 4, direction: "downside" },
      }),
      MARKET,
    );

    expect(lines.find((l) => l.id === "one")!.title).toBe("Entry Lmt");
    expect(lines.find((l) => l.id === "two")!.title).toBe("Exit SL-Lmt-trigger");
    expect(lines.find((l) => l.id === "three")!.title).toBe("Exit SL-Lmt-limit");
  });

  it("marks entry-column orders so they can be drawn in the entry tint", () => {
    const lines = orderPriceLines(
      config({
        entry: { col: 0, row: 1, type: "limit", axis: 2, yPosition: 5, direction: "downside" },
        exit: { col: 1, row: 1, type: "limit", axis: 2, yPosition: 5, direction: "upside" },
      }),
      MARKET,
    );

    expect(lines.find((l) => l.id === "entry")!.isEntry).toBe(true);
    expect(lines.find((l) => l.id === "exit")!.isEntry).toBe(false);
  });

  it("skips a block that has no price yet", () => {
    expect(
      orderPriceLines(
        config({ m: { col: 0, row: 0, type: "market" } }),
        MARKET,
      ),
    ).toEqual([]);
  });

  it("draws nothing before the market price has loaded", () => {
    expect(
      orderPriceLines(
        config({
          a: { col: 0, row: 1, type: "limit", axis: 2, yPosition: 25, direction: "downside" },
        }),
        null,
      ),
    ).toEqual([]);
  });

  it("draws the same lines whatever price scale it is handed", () => {
    // The whole safety case for the logarithmic option is that the scale is a
    // price-to-pixel mapping inside the chart pane and never an input to a
    // price. A scale parameter appearing here would be the eighth instance of
    // one fact derived two ways, so the guard has to be executed rather than
    // left to review.
    //
    // It is deliberately behavioural rather than an arity check.
    // `Function.prototype.length` stops counting at the first optional
    // parameter, so `expect(orderPriceLines).toHaveLength(2)` stays green for
    // exactly the regression it would exist to catch: a
    // `scale?: PriceScaleKind` third parameter, or a scale folded into a
    // trailing options object. Calling through each of those shapes is what
    // actually fails the moment a scale reaches a price.
    const orders = config({
      below: { col: 0, row: 1, type: "limit", axis: 2, yPosition: 25, direction: "downside" },
      above: { col: 1, row: 1, type: "take-profit", axis: 1, yPosition: 12.5, direction: "upside" },
    });

    const expected = orderPriceLines(orders, MARKET);
    expect(expected.map((line) => line.price)).toEqual([37_500, 56_250]);

    // The shapes a scale would most plausibly arrive in, all of which a
    // two-parameter signature simply ignores.
    const scaleShapes: unknown[] = [
      "logarithmic",
      "linear",
      { scale: "logarithmic" },
      { priceScale: "logarithmic" },
      { mode: "logarithmic" },
      { logarithmic: true },
    ];

    const callWithExtra = orderPriceLines as unknown as (
      orders: OrderConfig,
      marketPrice: number | null,
      ...rest: unknown[]
    ) => ReturnType<typeof orderPriceLines>;

    for (const shape of scaleShapes) {
      expect(callWithExtra(orders, MARKET, shape)).toEqual(expected);
    }
  });
});
