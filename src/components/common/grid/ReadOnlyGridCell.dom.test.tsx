// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ReadOnlyGridCell from "./ReadOnlyGridCell";
import type { BlockData } from "@/types/grid";

// =============================================================================
// HARNESS
// =============================================================================

const MARKET_PRICE = 100_000;

const limit = (yPosition: number): BlockData => ({
  id: "b1",
  orderType: "limit",
  label: "Limit",
  abrv: "Lmt",
  allowedRows: [0, 1, 2],
  axis: 2,
  yPosition,
  direction: "downside",
  axes: ["limit"],
});

/**
 * Sharing a bulk cell with a Limit, a Stop Loss is stamped with the opposite
 * direction: `shouldBeDescending` keys off the order type there, and only
 * stop-loss families count as the downside zone.
 */
const stopLoss = (yPosition: number): BlockData => ({
  id: "s1",
  orderType: "stop-loss",
  label: "Stop Loss",
  abrv: "SL",
  allowedRows: [0, 1, 2],
  axis: 1,
  yPosition,
  direction: "upside",
  axes: ["trigger"],
});

const priceBelowMarket = (yPosition: number) =>
  `$${(MARKET_PRICE * (1 - yPosition / 100)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// =============================================================================
// TESTS
// =============================================================================

describe("ReadOnlyGridCell", () => {
  it("describes each block by the price the panel actually shows", () => {
    render(
      <ReadOnlyGridCell
        colIndex={0}
        rowIndex={1}
        blocks={[limit(25), stopLoss(7)]}
        currentPrice={MARKET_PRICE}
      />,
    );

    // The cell draws one descending scale, taken from the Limit, so the Stop
    // Loss is priced below the market however its own `direction` is stamped.
    // A description signed the other way tells a screen-reader user the order
    // sits above the market when the panel is showing it below.
    expect(screen.getByText("-7.00%")).toBeInTheDocument();
    expect(screen.getByText(priceBelowMarket(7))).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: `Stop Loss trigger price, -7.00%, ${priceBelowMarket(7)}`,
      }),
    ).toBeInTheDocument();
  });

  it("describes a single-family cell on its own scale", () => {
    render(
      <ReadOnlyGridCell
        colIndex={0}
        rowIndex={1}
        blocks={[limit(25)]}
        currentPrice={MARKET_PRICE}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: `Limit limit price, -25.00%, ${priceBelowMarket(25)}`,
      }),
    ).toBeInTheDocument();
  });
});
