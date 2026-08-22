// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useRef, useState, type FC } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import GridArea from "./GridArea";
import { GridDataContext } from "../contexts/GridDataContext";
import { DragContext } from "../contexts/DragContext";
import { HoverContext } from "../contexts/HoverContext";
import { StaticContext } from "../contexts/StaticContext";
import { ORDER_TYPES } from "@data/orderTypes";
import { clearGrid } from "@utils/grid";
import { BLOCK_HEIGHT, getBlockTopPx } from "@styles/grid";
import type {
  BlockData,
  CellPosition,
  GridData,
  StrategyPattern,
} from "@/types/grid";
import type { OrderConfig } from "@/types/grid";
import {
  installPointerCapture,
  type PointerCaptureTracker,
} from "@/test/pointerCapture";

// =============================================================================
// HARNESS
// =============================================================================
//
// The vertical drag is only meaningful end to end: the hook reports a pointer
// Y, GridArea turns it into a percentage, and the cell renders the block from
// that percentage. A test that stops at the hook cannot see the two halves
// disagreeing, which is exactly how a tap used to re-price an order.

const TRACK_TOP = 400;
const TRACK_HEIGHT = 181.5;
const MARKET_PRICE = 100_000;

/**
 * A Stop Loss and a Limit are stamped with OPPOSITE directions when they share
 * a bulk cell: `shouldBeDescending` keys off the order type there, and only
 * stop-loss families count as the downside zone.
 */
const placedStopLoss = (
  yPosition: number,
  id: string = "s1",
): BlockData => ({
  id,
  orderType: "stop-loss",
  label: "Stop Loss",
  abrv: "SL",
  allowedRows: [0, 1, 2],
  axis: 1,
  yPosition,
  direction: "upside",
  axes: ["trigger"],
});

const placedLimit = (
  yPosition: number,
  id: string = "b1",
): BlockData => ({
  id,
  orderType: "limit",
  label: "Limit",
  abrv: "Lmt",
  allowedRows: [0, 1, 2],
  axis: 2,
  yPosition,
  direction: "downside",
  axes: ["limit"],
});

/** A Market carries no axis at all, which is what makes the cell axis-less. */
const placedMarket = (id: string = "m1"): BlockData => ({
  id,
  orderType: "market",
  label: "Market",
  abrv: "Mkt",
  allowedRows: [0, 1, 2],
  axis: 1,
  yPosition: -1,
  direction: "upside",
  axes: [],
});

const Harness: FC<{
  initialGrid: GridData;
  pattern?: StrategyPattern;
}> = ({ initialGrid, pattern = "conditional" }) => {
  const [grid, setGrid] = useState<GridData>(initialGrid);
  const [orderConfig, setOrderConfig] = useState<OrderConfig>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingFromProvider, setDraggingFromProvider] = useState<
    string | null
  >(null);
  const [hoverCell, setHoverCell] = useState<CellPosition | null>(null);
  const [hoveredProviderId, setHoveredProviderId] = useState<string | null>(
    null,
  );
  const [hoveredGridCell, setHoveredGridCell] = useState<CellPosition | null>(
    null,
  );
  const blockCounterRef = useRef(0);

  return (
    <GridDataContext.Provider
      value={{
        grid,
        orderConfig,
        strategyPattern: pattern,
        setGrid,
        setOrderConfig,
        setStrategyPattern: vi.fn(),
        clearAll: vi.fn(),
        reverseBlocks: vi.fn(),
      }}
    >
      <DragContext.Provider
        value={{
          draggingId,
          draggingFromProvider,
          hoverCell,
          setDraggingId,
          setDraggingFromProvider,
          setHoverCell,
        }}
      >
        <HoverContext.Provider
          value={{
            hoveredProviderId,
            hoveredGridCell,
            setHoveredProviderId,
            setHoveredGridCell,
          }}
        >
          <StaticContext.Provider
            value={{
              providerBlocks: ORDER_TYPES,
              baseId: "t",
              blockCounterRef,
            }}
          >
            <GridArea currentPrice={MARKET_PRICE} tickerError={null} />
          </StaticContext.Provider>
        </HoverContext.Provider>
      </DragContext.Provider>
    </GridDataContext.Provider>
  );
};

const stubRect = (element: Element, top: number, height: number) => {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 60,
    width: 60,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
};

const pointerAt = (type: string, x: number, y: number) => {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    isPrimary: { value: true },
    pointerType: { value: "touch" },
    clientX: { value: x },
    clientY: { value: y },
  });
  return event;
};

const pointer = (type: string, y: number) => pointerAt(type, 30, y);

/**
 * Render a grid holding one Limit at `yPosition` and give the axis column and
 * the block the geometry a browser would, since jsdom lays nothing out. The
 * block's rect is placed exactly where the renderer's own mapping puts it.
 */
const renderPlacedLimit = (yPosition: number) => {
  const grid = clearGrid(2, 3);
  grid[0][1].push(placedLimit(yPosition));
  render(<Harness initialGrid={grid} />);

  const track = document.querySelector('[data-axis-track="0-1-2"]');
  if (!track) throw new Error("the axis column was not rendered");
  stubRect(track, TRACK_TOP, TRACK_HEIGHT);

  const slider = screen.getByRole("slider");
  const blockTop = TRACK_TOP + getBlockTopPx(yPosition, TRACK_HEIGHT, true);
  stubRect(slider, blockTop, BLOCK_HEIGHT);

  return { slider, centre: blockTop + BLOCK_HEIGHT / 2 };
};

/** The price the cell renders for a Limit on its descending scale. */
const limitPrice = (yPosition: number) =>
  `$${(MARKET_PRICE * (1 - yPosition / 100)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** The block's centre, derived from the percentage the grid now holds. */
const renderedCentre = (): number => {
  const value = Number(screen.getByRole("slider").getAttribute("aria-valuenow"));
  return (
    TRACK_TOP + getBlockTopPx(Math.abs(value), TRACK_HEIGHT, true) + BLOCK_HEIGHT / 2
  );
};

let capture: PointerCaptureTracker;

beforeEach(() => {
  capture = installPointerCapture();
});

afterEach(() => {
  capture.restore();
  vi.restoreAllMocks();
});

// =============================================================================
// TESTS
// =============================================================================

describe("GridArea, pricing a block on its axis", () => {
  it("renders the block at the percentage it holds", () => {
    renderPlacedLimit(25);

    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "-25");
    expect(screen.getByText("-25.00%")).toBeInTheDocument();
  });

  it("does not re-price the order when a tap grabs the block off centre", () => {
    const { slider, centre } = renderPlacedLimit(25);

    // A finger lands 12px below the block's centre and releases without
    // travelling. Nothing about the order has changed, so nothing about its
    // price may either - this used to drop it from -25.00% to -32.76%.
    fireEvent(slider, pointer("pointerdown", centre + 12));
    fireEvent(slider, pointer("pointermove", centre + 12));
    fireEvent(slider, pointer("pointerup", centre + 12));

    expect(slider).toHaveAttribute("aria-valuenow", "-25");
  });

  it("does not re-price the order when a tap jitters inside the slop", () => {
    const { slider, centre } = renderPlacedLimit(25);

    // A finger never holds still. 3px of travel is under TAP_SLOP_PX, so the
    // release is a pick-up rather than a drag - but 3px of this track is 1.35
    // percentage points, about $1,345 at this market price, and the user is
    // told only that the block was picked up.
    fireEvent(slider, pointer("pointerdown", centre + 12));
    fireEvent(slider, pointer("pointermove", centre + 15));
    fireEvent(slider, pointer("pointerup", centre + 15));

    expect(slider).toHaveAttribute("aria-valuenow", "-25");
    expect(screen.getByText("-25.00%")).toBeInTheDocument();
    expect(screen.getByText(limitPrice(25))).toBeInTheDocument();
  });

  it("keeps the travel spent inside the slop once a drag leaves it", () => {
    const { slider, centre } = renderPlacedLimit(25);

    // The same 3px of jitter, but this time the finger goes on to drag. The
    // block must end up under the point it was grabbed at, with the early
    // travel counted rather than dropped and with no jump as the slop is left.
    fireEvent(slider, pointer("pointerdown", centre + 12));
    fireEvent(slider, pointer("pointermove", centre + 15));
    fireEvent(slider, pointer("pointermove", centre + 32));
    fireEvent(slider, pointer("pointerup", centre + 32));

    expect(renderedCentre()).toBeCloseTo(centre + 20, 1);
  });

  it("carries the block by the point it was grabbed at", () => {
    const { slider, centre } = renderPlacedLimit(25);

    fireEvent(slider, pointer("pointerdown", centre + 12));
    fireEvent(slider, pointer("pointermove", centre + 62));
    fireEvent(slider, pointer("pointerup", centre + 62));

    // The pointer travelled 50px, so the block's centre does too: it keeps its
    // position under the pointer rather than jumping to it.
    expect(renderedCentre()).toBeCloseTo(centre + 50, 1);
    expect(slider).not.toHaveAttribute("aria-valuenow", "-25");
  });

  it("prices a block grabbed dead centre by the pointer alone", () => {
    const { slider, centre } = renderPlacedLimit(10);

    fireEvent(slider, pointer("pointerdown", centre));
    fireEvent(slider, pointer("pointermove", centre + 30));
    fireEvent(slider, pointer("pointerup", centre + 30));

    expect(renderedCentre()).toBeCloseTo(centre + 30, 1);
  });

  it("clamps a drag past the end of the axis instead of overshooting", () => {
    const { slider, centre } = renderPlacedLimit(25);

    fireEvent(slider, pointer("pointerdown", centre));
    fireEvent(slider, pointer("pointermove", centre + 1000));
    fireEvent(slider, pointer("pointerup", centre + 1000));

    expect(slider).toHaveAttribute("aria-valuenow", "-50");
  });
});

// =============================================================================
// TAP TO PICK UP - the click the browser appends to every tap
// =============================================================================
//
// A real tap is `pointerdown`, `pointerup`, and then a `click` the browser
// synthesises and dispatches from the same element. That click bubbles out of
// the block and into the cell holding it, which is a live placement target the
// instant something is carried. Dispatching only the pointer events, as the
// tests above do, never sees it - which is how a tap that picked a block up
// and immediately put it back down went unnoticed.

/**
 * Two Market blocks in different cells, so one can be tapped onto the other.
 * They are axis-less on purpose: a block drawn on a price axis does not move
 * between cells by any input method, so it can never be carried.
 */
const renderTwoBlocks = () => {
  const grid = clearGrid(2, 3);
  grid[0][1].push(placedMarket("b1"));
  grid[1][0].push(placedMarket("b2"));
  render(<Harness initialGrid={grid} pattern="bulk" />);

  const [first, second] = screen.getAllByRole("button", {
    name: /^Market order,/,
  });
  return { first, second };
};

/** Pointer down, up, and the click a browser appends - in that order. */
const tap = (element: Element) => {
  fireEvent(element, pointer("pointerdown", 0));
  fireEvent(element, pointer("pointerup", 0));
  fireEvent.click(element, { bubbles: true });
};

const cell = (col: number, row: number) =>
  document.querySelector(`[data-col="${col}"][data-row="${row}"]`)!;

const announcement = () =>
  screen
    .getAllByRole("status")
    .map((region) => region.textContent)
    .filter(Boolean)
    .join("");

describe("GridArea, tapping a placed block", () => {
  it("picks the block up and keeps it carried through the trailing click", () => {
    const { first } = renderTwoBlocks();

    tap(first);

    expect(announcement()).toContain("Picked up Market block");
    expect(announcement()).not.toContain("Placed");
    // The cell the block would land in if placed now: proof a carry is live.
    expect(cell(0, 1)).toHaveAttribute("aria-current", "location");
  });

  it("puts the block back down on a second tap, once", () => {
    const { first } = renderTwoBlocks();

    tap(first);
    tap(first);

    expect(announcement()).toBe(
      "Cancelled. Market block left in Entry column, row 2.",
    );
    expect(cell(0, 1)).not.toHaveAttribute("aria-current");
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, Market");
  });

  it("places the carried block when a block in another cell is tapped", () => {
    const { first, second } = renderTwoBlocks();

    tap(first);
    // A tap on a block that is not the carried one falls through to its cell,
    // which is what decides where the carried block lands.
    tap(second);

    expect(announcement()).toBe(
      "Placed Market block in Exit column, row 1.",
    );
    expect(cell(1, 0)).toHaveAttribute(
      "aria-label",
      "Exit column, row 1, Market, Market",
    );
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, empty");
  });

  it("places the carried block when an empty cell is tapped", () => {
    const { first } = renderTwoBlocks();

    tap(first);
    fireEvent.click(cell(1, 2));

    expect(cell(1, 2)).toHaveAttribute("aria-label", "Exit column, row 3, Market");
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, empty");
  });

  it("refuses to carry a block drawn on a price axis, and still prices it", () => {
    const { slider, centre } = renderPlacedLimit(25);

    tap(slider);

    // A mouse cannot drag this block to another cell either, so the tap must
    // not either. The refusal names the affordance this render does wire.
    expect(announcement()).toContain(
      "Limit is priced on this axis and cannot be moved to another cell",
    );
    expect(cell(0, 1)).not.toHaveAttribute("aria-current");
    expect(slider).toHaveAttribute("aria-valuenow", "-25");

    fireEvent(slider, pointer("pointerdown", centre));
    fireEvent(slider, pointer("pointermove", centre + 30));
    fireEvent(slider, pointer("pointerup", centre + 30));

    expect(renderedCentre()).toBeCloseTo(centre + 30, 1);
  });
});

// =============================================================================
// A BULK CELL HOLDING TWO ORDER FAMILIES
// =============================================================================
//
// One cell draws one scale - one market line, one percentage ruler - but in the
// bulk pattern the blocks sharing it can be stamped with opposite directions.
// Everything that maps between a block and a price has to read the scale the
// cell actually drew, or the sign announced contradicts the price shown.

/** A Limit ("downside") placed first, then a Stop Loss ("upside"), in one cell. */
const renderMixedCell = (limitY: number, stopLossY: number) => {
  const grid = clearGrid(2, 3);
  grid[0][1].push(placedLimit(limitY), placedStopLoss(stopLossY));
  render(<Harness initialGrid={grid} pattern="bulk" />);

  const track = document.querySelector('[data-axis-track="0-1-1"]');
  if (!track) throw new Error("the trigger axis column was not rendered");
  stubRect(track, TRACK_TOP, TRACK_HEIGHT);

  // The cell draws descending, from the Limit it took its scale from.
  const stopLoss = screen.getByRole("slider", { name: /Stop Loss/ });
  const blockTop = TRACK_TOP + getBlockTopPx(stopLossY, TRACK_HEIGHT, true);
  stubRect(stopLoss, blockTop, BLOCK_HEIGHT);

  return { stopLoss, centre: blockTop + BLOCK_HEIGHT / 2 };
};

/** The price the cell renders next to the Stop Loss block. */
const stopLossPrice = (yPosition: number) =>
  `$${(MARKET_PRICE * (1 - yPosition / 100)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

describe("GridArea, a bulk cell holding two order families", () => {
  it("signs the announced value the way the price and the visible label do", () => {
    const { stopLoss } = renderMixedCell(25, 7);

    // The block is drawn on the cell's descending scale, so its price is BELOW
    // the market. Announcing "+7.00%" against a price 7% down is the wrong sign
    // for the money, and it is all a screen-reader user gets.
    expect(screen.getByText("-7.00%")).toBeInTheDocument();
    expect(screen.getByText(stopLossPrice(7))).toBeInTheDocument();
    expect(stopLoss).toHaveAttribute("aria-valuenow", "-7");
    expect(stopLoss).toHaveAttribute(
      "aria-valuetext",
      `-7.00%, ${stopLossPrice(7)}`,
    );
    expect(stopLoss).toHaveAttribute("aria-valuemin", "-50");
    expect(stopLoss).toHaveAttribute("aria-valuemax", "0");
  });

  it("steps the arrow keys towards the higher price as drawn", () => {
    const { stopLoss } = renderMixedCell(25, 7);

    fireEvent.keyDown(stopLoss, { key: "ArrowUp" });

    // Up the descending scale is closer to the market, so a higher price.
    expect(screen.getByText("-6.00%")).toBeInTheDocument();
    expect(screen.getByText(stopLossPrice(6))).toBeInTheDocument();
    expect(stopLoss).toHaveAttribute("aria-valuenow", "-6");
  });

  it("keeps a block's drawn price when the block beside it is activated", () => {
    renderMixedCell(25, 15);

    // The cell's scale is its FIRST block's direction, so moving the Limit out
    // would flip the Stop Loss left behind from -15.00% ($85,000.00) to
    // +15.00% ($115,000.00) - a $30,000 swing in an order nobody touched.
    // Nothing drawn on an axis moves between cells, so the sequence stops at
    // the first Enter.
    const limit = screen.getByRole("slider", { name: /Limit/ });
    fireEvent.keyDown(limit, { key: "Enter" });
    fireEvent.keyDown(limit, { key: "ArrowRight" });
    fireEvent.keyDown(limit, { key: "Enter" });

    expect(announcement()).toContain(
      "Limit is priced on this axis and cannot be moved to another cell",
    );
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Limit, Stop Loss",
    );
    expect(screen.getByText("-15.00%")).toBeInTheDocument();
    expect(screen.getByText(stopLossPrice(15))).toBeInTheDocument();
  });

  it("drags along the axis the cell drew instead of jumping to its far end", () => {
    const { stopLoss, centre } = renderMixedCell(25, 7);

    fireEvent(stopLoss, pointer("pointerdown", centre));
    fireEvent(stopLoss, pointer("pointermove", centre + 20));
    fireEvent(stopLoss, pointer("pointerup", centre + 20));

    // 20px down a descending track is a larger offset below the market, not a
    // flip to the opposite end of the axis.
    const moved = Number(stopLoss.getAttribute("aria-valuenow"));
    expect(moved).toBeLessThan(-7);
    expect(moved).toBeGreaterThan(-20);
    expect(
      TRACK_TOP +
        getBlockTopPx(Math.abs(moved), TRACK_HEIGHT, true) +
        BLOCK_HEIGHT / 2,
    ).toBeCloseTo(centre + 20, 1);
  });
});

// =============================================================================
// A BLOCK DRAWN IN AN AXIS COLUMN ITS OWN `axis` FIELD DOES NOT NAME
// =============================================================================
//
// A bulk cell holding a Market renders without an axis, so the Limit sharing it
// free-drags. Dropping it in the left half of an empty cell stamps `axis: 1`,
// and a cell holding only a Limit draws its blocks in the limit column. The
// block's field and the column it is drawn in then disagree, and the drag has
// to price it anyway: arrow keys still work there, so an order that cannot be
// dragged is dead only for the mouse and the finger.

/** The price the cell renders for a block on its ascending scale. */
const upsidePrice = (yPosition: number) =>
  `$${(MARKET_PRICE * (1 + yPosition / 100)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

describe("GridArea, a block drawn in a column its axis field does not name", () => {
  it("still prices the order on a pointer drag", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket(), placedLimit(25, "b1"));
    render(<Harness initialGrid={grid} pattern="bulk" />);

    // Free-drag the Limit into empty cell (1,1), releasing in the LEFT half:
    // that is what writes `axis: 1` onto a block the cell draws as a Limit.
    stubRect(cell(1, 1), 400, 300);
    const limit = within(cell(0, 1) as HTMLElement).getByRole("button", {
      name: /Limit/,
    });
    fireEvent(limit, pointerAt("pointerdown", 30, 100));
    fireEvent(limit, pointerAt("pointermove", 10, 572));
    fireEvent(limit, pointerAt("pointerup", 10, 572));

    // The state under test: the cell drew a limit column, and nothing is keyed
    // to the axis the block itself now claims.
    const track = document.querySelector('[data-axis-track="1-1-2"]');
    expect(track).not.toBeNull();
    expect(document.querySelector('[data-axis-track="1-1-1"]')).toBeNull();

    stubRect(track!, TRACK_TOP, TRACK_HEIGHT);
    const slider = screen.getByRole("slider");
    const before = Number(slider.getAttribute("aria-valuenow"));
    const blockTop = TRACK_TOP + getBlockTopPx(before, TRACK_HEIGHT, false);
    stubRect(slider, blockTop, BLOCK_HEIGHT);
    const centre = blockTop + BLOCK_HEIGHT / 2;

    fireEvent(slider, pointer("pointerdown", centre));
    fireEvent(slider, pointer("pointermove", centre + 30));
    fireEvent(slider, pointer("pointerup", centre + 30));

    // Dragged 30px down an ascending track: a smaller offset above the market,
    // read back through the same mapping the cell drew it with.
    const after = Number(slider.getAttribute("aria-valuenow"));
    expect(after).toBeLessThan(before);
    expect(
      TRACK_TOP + getBlockTopPx(after, TRACK_HEIGHT, false) + BLOCK_HEIGHT / 2,
    ).toBeCloseTo(centre + 30, 1);
    expect(screen.getByText(`+${after.toFixed(2)}%`)).toBeInTheDocument();
    expect(screen.getByText(upsidePrice(after))).toBeInTheDocument();
  });
});
