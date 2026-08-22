// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import GridCell from "@common/grid/GridCell";
import { formatPrice } from "@utils/grid";
import { orderPriceLines } from "./orderPriceLines";
import type { BlockData, OrderConfig } from "@/types/grid";

// =============================================================================
// THE PRICE THE GRID SHOWS IS THE PRICE THE CHART DRAWS
// =============================================================================
//
// The acceptance check for the logarithmic price scale, and the reason it is a
// DOM test rather than another comparison of two pure functions: it reads the
// *rendered* price chip out of the real strategy-grid cell and compares it to
// the price the chart hands `createPriceLine`. If the chart ever grows a
// second derivation of "percentage offset from market" - which is exactly what
// it had before this change - the two strings stop matching here.
//
// The price scale is absent from this test on purpose. It cannot appear: the
// chart's line price is computed by `orderPriceLines`, which takes the orders
// and the market price and nothing else, and the linear/logarithmic choice
// only decides where the chart pane paints that price. There is no third value
// for a scale to disagree with.

const MARKET_PRICE = 50_000;

const noop = () => {};

const block = (overrides: Partial<BlockData> = {}): BlockData => ({
  id: "b1",
  orderType: "limit",
  label: "Limit",
  abrv: "Lmt",
  allowedRows: [0, 1, 2],
  axis: 2,
  yPosition: 25,
  direction: "downside",
  axes: ["limit"],
  ...overrides,
});

/** The chart's view of the same block, as `OrderChart` builds it. */
const chartConfig = (b: BlockData, col: number, row: number): OrderConfig => ({
  [b.id]: {
    col,
    row,
    type: b.orderType,
    axis: b.axis,
    yPosition: b.yPosition,
    direction: b.direction,
  },
});

const renderCell = (b: BlockData, col = 0, row = 1) =>
  render(
    <GridCell
      colIndex={col}
      rowIndex={row}
      blocks={[b]}
      isOver={false}
      isValidTarget={false}
      isDisabled={false}
      isCommandTarget={false}
      align="left"
      strategyPattern="conditional"
      rowLabel="Primary"
      showPrimaryWarning={false}
      currentPrice={MARKET_PRICE}
      onMouseEnter={noop}
      onMouseLeave={noop}
      onBlockDragStart={noop}
      onBlockDragEnd={noop}
      onBlockDragCancel={noop}
      onBlockDragAborted={noop}
      onBlockDragRecognised={noop}
      onBlockVerticalDrag={noop}
      onBlockActivate={noop}
      onBlockCommandMove={noop}
      onBlockCommandCancel={noop}
      onBlockAdjustPrice={noop}
      onCellActivate={noop}
      carryingBlockId={null}
      focusBlockId={null}
      onBlockFocusHandled={noop}
    />,
  );

describe("the grid's price chip and the chart's price line", () => {
  it.each([
    ["below the market", block({ yPosition: 25, direction: "downside" })],
    ["above the market", block({ yPosition: 25, direction: "upside" })],
    [
      "at a fractional offset",
      block({ yPosition: 7.25, direction: "downside" }),
    ],
    ["at the market", block({ yPosition: 0, direction: "upside" })],
    [
      "on a stop-loss trigger axis",
      block({
        orderType: "stop-loss",
        label: "Stop Loss",
        abrv: "SL",
        axis: 1,
        axes: ["trigger"],
        yPosition: 15,
        direction: "downside",
      }),
    ],
  ])("agree for a block %s", (_name, b) => {
    renderCell(b);

    const [line] = orderPriceLines(chartConfig(b, 0, 1), MARKET_PRICE);

    expect(line).toBeDefined();
    // `formatPrice` is what the cell renders; the assertion is that the chart's
    // number and the cell's number are the same number, not that they round the
    // same way.
    expect(screen.getAllByText(formatPrice(line.price)).length).toBeGreaterThan(
      0,
    );
  });
});
