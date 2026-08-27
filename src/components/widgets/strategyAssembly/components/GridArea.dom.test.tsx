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
import { MarketContext } from "@store/MarketContext";
import { MARKETS, findMarket } from "@data/markets";
import { ARB_USD, BTC_USD } from "@/test/marketFixtures";
import type { Market, MarketPrecision } from "@/types/markets";
import {
  getSnapshot as dragOverlaySnapshot,
  startDragOverlay,
  stopDragOverlay,
} from "@common/dragOverlayStore";

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
  /**
   * Renders a control that replaces the grid wholesale, the way Clear All,
   * Reverse Blocks and a pattern switch do. None of those touch the carry, so
   * this is how a carry comes to outlive the block it names.
   */
  gridReplacement?: GridData;
  /**
   * Renders a control that selects a different market, the way the market
   * selector does. Switching re-prices every block on the grid, so the grid has
   * to say so and has to redraw its chips at the new pair's precision.
   */
  switchTo?: { market: Market; precision: MarketPrecision };
  /**
   * Renders a control that reports a strategy the builder refused to load,
   * the way `App` does when the market an order was placed on is no longer in
   * the catalogue. The grid is what did *not* change, and it has one voice.
   */
  refuseStrategyOn?: string;
  /**
   * A strategy that has just been loaded into this grid, the way `App` reports
   * one. It is a prop rather than something this component notices, because the
   * real load remounts it - so a fresh mount holding one is the shape under
   * test, not an edge case.
   */
  strategyLoaded?: {
    symbol: string;
    name: string;
    marketChanged: boolean;
  } | null;
  /**
   * A control that sits beside `GridArea` rather than inside it, the way the
   * pattern selector and Clear All do. It is outside the placement surface, so
   * clicking it is one of the things that puts a carried block down.
   */
  outsideControl?: boolean;
}> = ({
  initialGrid,
  pattern = "conditional",
  gridReplacement,
  switchTo,
  refuseStrategyOn,
  strategyLoaded,
  outsideControl,
}) => {
  const [selected, setSelected] = useState<{
    market: Market;
    precision: MarketPrecision;
  }>({ market: findMarket("BTC/USD")!, precision: BTC_USD });
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
  const [refused, setRefused] = useState<{
    symbol: string;
    attempt: number;
  } | null>(null);
  // Held in state rather than read from the prop, so the grid can clear it the
  // way `App` does once it has spoken.
  const [loaded, setLoaded] = useState(strategyLoaded ?? null);

  return (
    <MarketContext.Provider
      value={{
        market: selected.market,
        precision: selected.precision,
        activeMarket: {
          market: selected.market,
          precision: selected.precision,
        },
        markets: MARKETS,
        selectMarket: vi.fn(),
        metadataError: null,
        metadataSettled: true,
      }}
    >
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
            <GridArea
              currentPrice={MARKET_PRICE}
              tickerError={null}
              strategyMarketUnavailable={refused}
              strategyLoaded={loaded}
              onStrategyLoadAnnounced={() => setLoaded(null)}
            />
            {gridReplacement && (
              <button onClick={() => setGrid(gridReplacement)}>
                replace the grid
              </button>
            )}
            {switchTo && (
              <button onClick={() => setSelected(switchTo)}>
                switch market
              </button>
            )}
            {refuseStrategyOn && (
              <button
                onClick={() =>
                  setRefused((prev) => ({
                    symbol: refuseStrategyOn,
                    attempt: (prev?.attempt ?? 0) + 1,
                  }))
                }
              >
                refuse a strategy
              </button>
            )}
            {outsideControl && <button>a control beside the grid</button>}
          </StaticContext.Provider>
        </HoverContext.Provider>
      </DragContext.Provider>
    </GridDataContext.Provider>
    </MarketContext.Provider>
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

/**
 * The pressed-button bitmask a real pointer carries for this event type: 1
 * while the button is held, 0 once it is up. `usePointerGesture` reads a move
 * carrying 0 as proof of a release it never heard, so a helper leaving it at
 * jsdom's default would model a pointer that is never pressed. A test that
 * needs that stale case states `buttons` itself.
 */
const buttonsFor = (type: string): number =>
  type === "pointerdown" || type === "pointermove" ? 1 : 0;

const pointerAt = (
  type: string,
  x: number,
  y: number,
  {
    buttons = buttonsFor(type),
    pointerType = "touch",
  }: { buttons?: number; pointerType?: string } = {},
) => {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    isPrimary: { value: true },
    pointerType: { value: pointerType },
    clientX: { value: x },
    clientY: { value: y },
    buttons: { value: buttons },
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
// The harness renders on BTC/USD, and Kraken prices that pair to ONE decimal
// (`pair_decimals: 1`), so the grid draws "$75,000.0" rather than the flat two
// decimals it used to draw for every market. That is the point: the price on
// screen is at the precision the payload is sent at.
const limitPrice = (yPosition: number) =>
  `$${(MARKET_PRICE * (1 - yPosition / 100)).toLocaleString("en-US", {
    minimumFractionDigits: BTC_USD.priceDecimals,
    maximumFractionDigits: BTC_USD.priceDecimals,
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

/**
 * The same gesture on a mouse. `pointerAt` defaults to a finger, and the device
 * is what decides whether the carry that follows is worded as a click, follows
 * the cursor, and tracks the cell under it - so a mouse test has to say so.
 */
const clickBlock = (element: Element) => {
  fireEvent(element, pointerAt("pointerdown", 40, 30, { pointerType: "mouse" }));
  fireEvent(element, pointerAt("pointerup", 40, 30, { pointerType: "mouse" }));
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

    // The same fact - a placed block changed cells - however the user reached
    // it. This said "Placed ... in" while a drag of the same block said
    // "Moved ... to"; the wording now comes from what the grid did, so the tap
    // path and the drag path cannot describe one event two ways.
    expect(announcement()).toBe(
      "Moved Market block to Exit column, row 1.",
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

  it("releases the carry when a drag starts on another block", () => {
    const { first, second } = renderTwoBlocks();

    tap(first);
    expect(cell(0, 1)).toHaveAttribute("aria-current", "location");

    // A nudge drag on the OTHER block, released inside its own cell, with the
    // click a browser appends to every gesture. That click bubbles into a cell
    // that is a live placement target while anything is carried - so without
    // the drag releasing the carry, dragging this block moves the other one.
    stubRect(cell(1, 0), 100, 200);
    fireEvent(second, pointerAt("pointerdown", 30, 150));
    fireEvent(second, pointerAt("pointermove", 30, 160));
    fireEvent(second, pointerAt("pointerup", 30, 160));
    fireEvent.click(second, { bubbles: true });

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, Market");
    expect(cell(1, 0)).toHaveAttribute("aria-label", "Exit column, row 1, Market");
    expect(cell(0, 1)).not.toHaveAttribute("aria-current");
    // The last thing said has to be the outcome of the gesture the user made:
    // the dragged block went nowhere, and nothing was placed anywhere.
    expect(announcement()).toBe(
      "Market block stayed in Exit column, row 1.",
    );
  });

  it("releases the carry when the carried block itself is dragged away", () => {
    const { first } = renderTwoBlocks();

    tap(first);

    stubRect(cell(1, 2), 500, 200);
    fireEvent(first, pointerAt("pointerdown", 30, 150));
    fireEvent(first, pointerAt("pointermove", 30, 550));
    fireEvent(first, pointerAt("pointerup", 30, 550));
    fireEvent.click(first, { bubbles: true });

    expect(cell(1, 2)).toHaveAttribute("aria-label", "Exit column, row 3, Market");
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, empty");
    // A carry left live would still point its target highlight at the cell the
    // block has just been dragged out of.
    expect(cell(0, 1)).not.toHaveAttribute("aria-current");
    // And the announcement has to name the cell the block is actually in. This
    // assertion used to say the block had been left in the cell it just left.
    expect(announcement()).toBe("Moved Market block to Exit column, row 3.");
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
// WHAT A COMPLETED DRAG SAYS
// =============================================================================
//
// A drag is the gesture a finger reaches for first, and it used to say nothing
// at all - so a screen-reader user dragging on touch got either silence or, once
// a drag started releasing an active carry, a cancellation naming a resting
// place the same gesture was about to invalidate. Each outcome now speaks for
// itself, in the words the keyboard path uses.

describe("GridArea, what a completed drag says", () => {
  it("says the block was removed when the drag ends off the grid", () => {
    const { first } = renderTwoBlocks();

    // No cell rect is stubbed, so every cell measures empty and this release
    // lands outside all of them - the drop that deletes.
    fireEvent(first, pointerAt("pointerdown", 30, 150));
    fireEvent(first, pointerAt("pointermove", 900, 900));
    fireEvent(first, pointerAt("pointerup", 900, 900));

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, empty");
    expect(announcement()).toBe("Removed Market block from the grid.");
  });

  it("names the cell a palette drag placed the order in", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} pattern="bulk" />);
    stubRect(cell(1, 0), 100, 200);

    const palette = screen.getByRole("button", { name: "Add Market order" });
    fireEvent(palette, pointerAt("pointerdown", 30, 20));
    fireEvent(palette, pointerAt("pointermove", 30, 150));
    fireEvent(palette, pointerAt("pointerup", 30, 150));

    expect(cell(1, 0)).toHaveAttribute("aria-label", "Exit column, row 1, Market");
    expect(announcement()).toBe("Placed Market order in Exit column, row 1.");
  });

  it("does not claim a placement the grid refused", () => {
    // Conditional pattern: the first block must go in the primary row, so a
    // drag into an upper conditional cell is refused and nothing is created.
    render(<Harness initialGrid={clearGrid(2, 3)} />);
    stubRect(cell(0, 0), 100, 200);

    const palette = screen.getByRole("button", { name: "Add Market order" });
    fireEvent(palette, pointerAt("pointerdown", 30, 20));
    fireEvent(palette, pointerAt("pointermove", 30, 150));
    fireEvent(palette, pointerAt("pointerup", 30, 150));

    expect(cell(0, 0)).toHaveAttribute(
      "aria-label",
      "Entry column, upper conditional row, empty",
    );
    expect(announcement()).toBe(
      "Entry column, upper conditional row cannot take this order. Market order was not placed.",
    );
  });

  it("says the palette order was not placed when the drag lands off the grid", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} />);

    // No cell rect is stubbed, so this release resolves to no cell at all. It
    // used to be the one completed drag that said nothing whatsoever.
    const palette = screen.getByRole("button", { name: "Add Market order" });
    fireEvent(palette, pointerAt("pointerdown", 30, 20));
    fireEvent(palette, pointerAt("pointermove", 900, 900));
    fireEvent(palette, pointerAt("pointerup", 900, 900));

    expect(announcement()).toBe(
      "Released outside the grid. Market order was not placed.",
    );
  });

  it("says where the block still is when the browser cancels the drag", () => {
    const { first } = renderTwoBlocks();

    fireEvent(first, pointerAt("pointerdown", 30, 150));
    fireEvent(first, pointerAt("pointermove", 900, 900));
    fireEvent(first, pointerAt("pointercancel", 900, 900));

    // The gesture failed rather than succeeded, and only this distinguishes the
    // two for someone who cannot see the block snap back.
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, Market");
    expect(announcement()).toBe(
      "Drag cancelled. Market block stayed in Entry column, row 2.",
    );
  });

  it("stays silent when a cancel interrupts what was still only a tap", () => {
    const { first } = renderTwoBlocks();

    // Below the tap slop, so no drag was ever recognised and nothing happened
    // that a user needs an account of.
    fireEvent(first, pointerAt("pointerdown", 30, 150));
    fireEvent(first, pointerAt("pointercancel", 30, 150));

    expect(announcement()).toBe("");
  });
});

// =============================================================================
// EVERY RELEASE ENDS THE GESTURE
// =============================================================================
//
// The tests above all let go of the pointer on the block itself, which is what
// capture normally arranges. These let go somewhere the block never hears about
// - the shape a release takes whenever the capture is not in force - and assert
// the two things that made the builder unusable when the gesture stayed alive:
// the ghost stayed welded to the cursor, and the outcome went unsaid. Both come
// from the same place, so both are checked together: `stopDragOverlay` runs off
// `onUp`, and so does the only `announcer.report` for this gesture.
//
// The release TARGET is the point. A drop can land on a valid cell, a cell that
// refuses it, the palette, another panel, or nothing at all, and not one of
// those may decide whether the gesture finishes.

describe("GridArea, a release the dragged block never receives", () => {
  afterEach(() => {
    stopDragOverlay();
  });

  /**
   * Drag from `block`, and let go at a point the block itself is never told
   * about - `document.body` stands in for whatever the pointer is actually
   * over: another panel, the page background, or nothing, off the window.
   */
  const dragAndReleaseElsewhere = (block: Element, x: number, y: number) => {
    fireEvent(block, pointerAt("pointerdown", 30, 20));
    fireEvent(document.body, pointerAt("pointermove", x, y));
    fireEvent(document.body, pointerAt("pointerup", x, y));
  };

  it("puts a palette order down in the cell the pointer was over", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} pattern="bulk" />);
    stubRect(cell(1, 0), 100, 200);

    dragAndReleaseElsewhere(palette("Add Market order"), 30, 150);

    expect(cell(1, 0)).toHaveAttribute("aria-label", "Exit column, row 1, Market");
    expect(announcement()).toBe("Placed Market order in Exit column, row 1.");
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("says the cell refused the order rather than going silent", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} />);
    stubRect(cell(0, 0), 100, 200);

    dragAndReleaseElsewhere(palette("Add Market order"), 30, 150);

    expect(announcement()).toBe(
      "Entry column, upper conditional row cannot take this order. Market order was not placed.",
    );
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("says a palette order released off the grid was not placed", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} />);

    // No cell rect is stubbed, so this resolves to no cell at all: the chart
    // panel, the orders panel, the background, or back over the palette.
    dragAndReleaseElsewhere(palette("Add Market order"), 900, 900);

    expect(announcement()).toBe(
      "Released outside the grid. Market order was not placed.",
    );
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("says a palette order released outside the window was not placed", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} />);

    // Off the top-left of the viewport, delivered to nothing in the document.
    dragAndReleaseElsewhere(palette("Add Market order"), -220, -140);

    expect(announcement()).toBe(
      "Released outside the grid. Market order was not placed.",
    );
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("removes a placed block released off the grid, and says so", () => {
    const { first } = renderTwoBlocks();

    dragAndReleaseElsewhere(first, 900, 900);

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, empty");
    expect(announcement()).toBe("Removed Market block from the grid.");
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("does not delete a block when a dismissal click follows an unheard release", () => {
    // The one release nothing in the page can hear: no capture is in force, so
    // the pointer let go outside the window is retargeted nowhere. The gesture
    // survives it with its window listeners still installed, and a mouse's
    // pointer id is a constant 1 - so the release of the very next click would
    // be matched as this gesture's drop, at coordinates that are on no cell,
    // and the block the user only meant to stop dragging would be deleted.
    //
    // Mouse throughout, and that is the scenario rather than a detail: a finger
    // is implicitly captured to the element it went down on, so its release is
    // always delivered and a touch gesture cannot go stale in the first place.
    const mouse = (type: string, x: number, y: number, buttons = buttonsFor(type)) =>
      pointerAt(type, x, y, { pointerType: "mouse", buttons });

    const { first } = renderTwoBlocks();
    vi.spyOn(first, "setPointerCapture").mockImplementation(() => {
      throw new DOMException("NotFoundError", "NotFoundError");
    });

    fireEvent(first, mouse("pointerdown", 30, 150));
    fireEvent(document.body, mouse("pointermove", 900, 900));
    // Nothing is dispatched for the release, on purpose.

    // Reaching the chart panel to dismiss the ghost means moving the mouse,
    // and a move made with the button already up carries no button at all.
    fireEvent(document.body, mouse("pointermove", 700, 400, 0));
    fireEvent(document.body, mouse("pointerdown", 700, 400));
    fireEvent(document.body, mouse("pointerup", 700, 400));

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, Market");
    // The positive sentence, not the absence of the wrong one: going silent is
    // the other half of the failure this lane is about, so a passing test has
    // to show the user was told where the block ended up.
    expect(announcement()).toBe(
      "Drag cancelled. Market block stayed in Entry column, row 2.",
    );
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("says where a block still is when the browser cancels the drag elsewhere", () => {
    const { first } = renderTwoBlocks();

    fireEvent(first, pointerAt("pointerdown", 30, 150));
    fireEvent(document.body, pointerAt("pointermove", 900, 900));
    fireEvent(document.body, pointerAt("pointercancel", 900, 900));

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, Market");
    expect(announcement()).toBe(
      "Drag cancelled. Market block stayed in Entry column, row 2.",
    );
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("leaves the builder usable: the next drag still places a block", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} pattern="bulk" />);

    // A release the block never receives, and then an ordinary drag. The
    // wedged builder took every later gesture and did nothing with any of them.
    dragAndReleaseElsewhere(palette("Add Market order"), 900, 900);
    stubRect(cell(1, 0), 100, 200);
    dragAndReleaseElsewhere(palette("Add Market order"), 30, 150);

    expect(cell(1, 0)).toHaveAttribute("aria-label", "Exit column, row 1, Market");
    expect(dragOverlaySnapshot().active).toBe(false);
  });
});

// =============================================================================
// A SAME-CELL RELEASE, ON THE CONDITIONAL PATTERN
// =============================================================================
//
// Nudging a block and letting go inside its own cell is the most ordinary
// accidental gesture there is, and on the default pattern it used to announce a
// contradiction: the drop supplied a position, so the same-cell no-op branch
// was skipped, `isCellValidForPlacement` read the block's own occupied cell as
// illegal, and the refusal wording was used - "Entry column, primary row cannot
// take this order. Market block stayed in Entry column, primary row."
//
// The bulk pattern cannot show it, because every cell is a legal target there,
// so this has to be asserted on the conditional pattern specifically.

/** One axis-less Market in the Entry primary cell, on the default pattern. */
const renderConditionalMarket = () => {
  const grid = clearGrid(2, 3);
  grid[0][1].push(placedMarket("b1"));
  render(<Harness initialGrid={grid} />);

  const block = screen.getByRole("button", { name: /^Market order,/ });
  // The cell the block is in, and the only one any of these releases land in.
  stubRect(cell(0, 1), 400, 200);
  return { block };
};

describe("GridArea, a same-cell release on the conditional pattern", () => {
  it("says the block stayed put rather than that its own cell refused it", () => {
    const { block } = renderConditionalMarket();

    // Ten pixels: a nudge, not a move.
    fireEvent(block, pointerAt("pointerdown", 30, 500));
    fireEvent(block, pointerAt("pointermove", 40, 504));
    fireEvent(block, pointerAt("pointerup", 40, 504));

    expect(announcement()).toBe(
      "Market block stayed in Entry column, primary row.",
    );
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, primary row, Market",
    );
  });

  it("still says a different cell refused the order", () => {
    const { block } = renderConditionalMarket();

    // The Entry column's conditional rows are not legal while its primary is
    // occupied, so this release really is refused - and both clauses are true.
    stubRect(cell(0, 2), 650, 200);
    fireEvent(block, pointerAt("pointerdown", 30, 500));
    fireEvent(block, pointerAt("pointermove", 30, 700));
    fireEvent(block, pointerAt("pointerup", 30, 700));

    expect(announcement()).toBe(
      "Entry column, lower conditional row cannot take this order. Market block stayed in Entry column, primary row.",
    );
  });
});

// =============================================================================
// A CARRY THAT A DRAG TAKES OVER
// =============================================================================
//
// A drag supersedes an active carry, and that release is announced from one
// place, on one question: is the drag about the block being carried?
//
//  - Same block, and the drag's own outcome is the whole story. Anything said
//    now would be made false a moment later by the very gesture that triggered
//    it, which is the trap the earlier fixes fell into twice.
//  - Different block - a vertical price drag, above all - and the drag's
//    outcome says nothing about the carry. Silence there loses the carry with
//    no word said, and the next tap on a cell then does nothing at all.

describe("GridArea, a carry that a drag takes over", () => {
  it("says the carry ended when a price drag on another block takes over", () => {
    // A Limit in the Entry primary cell, so the grid holds a real price axis.
    const { slider, centre } = renderPlacedLimit(25);

    // Pick up a palette order that has somewhere legal left to go - the Exit
    // column's conditional rows, by the diagonal rule.
    tap(screen.getByRole("button", { name: "Add Take Profit order" }));
    expect(announcement()).toContain("Picked up Take Profit order");
    expect(
      document.querySelectorAll("[aria-current='location']").length,
    ).toBeGreaterThan(0);

    // Now price a block that is not the one being carried. The price drag is
    // silent by design - the block is a `role="slider"` and speaks its own
    // value - so if this release is not announced, nothing announces it.
    fireEvent(slider, pointer("pointerdown", centre));
    fireEvent(slider, pointer("pointermove", centre + 30));
    fireEvent(slider, pointer("pointerup", centre + 30));

    expect(announcement()).toBe(
      "Take Profit order returned to the palette: a drag took over.",
    );
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(
      0,
    );
  });

  it("leaves the tap that follows a lost carry doing nothing, but not unexplained", () => {
    const { slider, centre } = renderPlacedLimit(25);

    tap(screen.getByRole("button", { name: "Add Take Profit order" }));
    fireEvent(slider, pointer("pointerdown", centre));
    fireEvent(slider, pointer("pointermove", centre + 30));
    fireEvent(slider, pointer("pointerup", centre + 30));

    // The cell the user was told was the target a moment ago. Nothing is
    // carried any more, so nothing is placed - and that is now consistent with
    // the last thing said rather than a dead tap after a silent loss.
    fireEvent.click(cell(1, 0));

    expect(cell(1, 0)).toHaveAttribute(
      "aria-label",
      "Exit column, upper conditional row, empty",
    );
    expect(announcement()).toBe(
      "Take Profit order returned to the palette: a drag took over.",
    );
  });

  it("leaves the drag to speak for itself when it is the carried block", () => {
    const { first } = renderTwoBlocks();

    tap(first);
    stubRect(cell(1, 2), 500, 200);
    fireEvent(first, pointerAt("pointerdown", 30, 150));
    fireEvent(first, pointerAt("pointermove", 30, 550));
    fireEvent(first, pointerAt("pointerup", 30, 550));
    fireEvent.click(first, { bubbles: true });

    // One sentence, and it is the durable one: a release announcement here
    // would have named a resting place this same gesture then invalidated.
    expect(announcement()).toBe("Moved Market block to Exit column, row 3.");
  });
});

// =============================================================================
// A SAME-CELL NUDGE IN THE BULK PATTERN, WHICH ANOTHER LANE OWNS
// =============================================================================
//
// What the user is TOLD about a same-cell release is decided independently of
// the placement rules: a block can never be refused by the cell it is sitting
// in. What the grid DOES on that release is deliberately untouched here. In the
// bulk pattern every cell is a legal target, so the drop still runs the full
// move - it rewrites the dragged order's `axis` and `yPosition`, and its
// remove-then-push reorders the cell array, which is what the cell header reads
// `blocks[0]` for. That reordering and re-pricing belongs to `bb3-mapping-owner`
// under the ruling that direction belongs to the cell, and two lanes
// reconciling one question is how the display and the payload drifted apart
// before. This test is the fence: it fails if that mutation is quietly changed
// here instead of there.

describe("GridArea, a same-cell nudge in the bulk pattern", () => {
  it("still reorders and re-prices the cell, while saying the block stayed", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("m1"), placedLimit(25, "b1"));
    render(<Harness initialGrid={grid} pattern="bulk" />);

    const home = cell(0, 1) as HTMLElement;
    expect(home).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Market, Limit",
    );
    // The cell header, which renders `blocks[0].label`.
    expect(within(home).getByText("Market")).toBeInTheDocument();

    // Ten pixels and a release inside the block's own cell: the most ordinary
    // accidental gesture there is.
    stubRect(home, 400, 200);
    const market = within(home).getByRole("button", { name: /^Market order,/ });
    fireEvent(market, pointerAt("pointerdown", 30, 500));
    fireEvent(market, pointerAt("pointermove", 40, 504));
    fireEvent(market, pointerAt("pointerup", 40, 504));

    // Unchanged from main, and owned elsewhere: the Market has been taken out
    // and pushed back, so the Limit is now `blocks[0]` and names the cell.
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Limit, Market",
    );
    expect(within(cell(0, 1) as HTMLElement).getByText("Limit")).toBeInTheDocument();

    // And the sentence is decided from the fact that the block did not change
    // cells, not from what the placement rules said about the cell.
    expect(announcement()).toBe("Market block stayed in Entry column, row 2.");
  });
});

// =============================================================================
// A CARRY THAT THE DRAGGED BLOCK'S OWN GESTURE ENDS
// =============================================================================
//
// Dragging the very block you are carrying releases that carry, and saying so
// as the drag begins would be falsified by the same gesture. So it is folded
// into the one sentence the gesture's outcome produces - which matters most
// exactly where that outcome describes nothing happening, because then nothing
// else in it tells the user their block has left their hand and the next tap on
// a cell will do nothing.

describe("GridArea, a carry ended by a drag on that same block", () => {
  it("says the block stayed and that it is no longer carried, in one sentence", () => {
    const { block } = renderConditionalMarket();

    tap(block);
    expect(announcement()).toContain("Picked up Market block");

    fireEvent(block, pointerAt("pointerdown", 30, 500));
    fireEvent(block, pointerAt("pointermove", 40, 504));
    fireEvent(block, pointerAt("pointerup", 40, 504));
    fireEvent.click(block, { bubbles: true });

    expect(announcement()).toBe(
      "Market block stayed in Entry column, primary row, and is no longer picked up.",
    );
    // The clause has to still be true after the operation that produced it.
    expect(cell(0, 1)).not.toHaveAttribute("aria-current");
  });

  it("says the same when the browser cancels that drag", () => {
    const { block } = renderConditionalMarket();

    tap(block);

    fireEvent(block, pointerAt("pointerdown", 30, 500));
    fireEvent(block, pointerAt("pointermove", 40, 504));
    fireEvent(block, pointerAt("pointercancel", 40, 504));

    // `onDragCancel` ends the drag before `onDragAborted` announces, so this
    // also pins that the released-carry flag outlives the end of the gesture.
    expect(announcement()).toBe(
      "Drag cancelled. Market block stayed in Entry column, primary row, and is no longer picked up.",
    );
    expect(cell(0, 1)).not.toHaveAttribute("aria-current");
  });
});

// =============================================================================
// A PICK-UP REFUSED WHILE SOMETHING IS ALREADY CARRIED
// =============================================================================

describe("GridArea, a refused pick-up while a block is carried", () => {
  it("names the order that is still in hand", () => {
    // Every diagonal of an occupied cell is itself occupied, so the conditional
    // rules leave nowhere on this grid for a new order to go.
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    grid[1][0].push(placedMarket("b2"));
    grid[1][2].push(placedMarket("b3"));
    render(<Harness initialGrid={grid} />);

    // A placed block can always go back where it came from, so this pick-up is
    // offered even though nothing new can be placed.
    tap(screen.getAllByRole("button", { name: /^Market order,/ })[0]);
    expect(cell(0, 1)).toHaveAttribute("aria-current", "location");

    tap(screen.getByRole("button", { name: "Add Take Profit order" }));

    // Refusing without dispatching leaves the Market carried, and the highlight
    // that shows it is not available to a screen-reader user.
    expect(announcement()).toBe(
      "Take Profit order cannot be placed anywhere in the grid right now. Still carrying Market block.",
    );
    expect(cell(0, 1)).toHaveAttribute("aria-current", "location");
  });
});

// =============================================================================
// A COMMIT THAT ENDS THE CARRY
// =============================================================================
//
// Committing always ends the carry, and the sibling `cellRefused` outcome says
// "Still carrying X." whenever the carry does survive - so a screen-reader user
// is taught that hearing nothing about the carry means it is still in hand.
// Silence on these paths therefore states the opposite of the truth.

describe("GridArea, a commit that ends the carry", () => {
  it("says the carry is over when a block is put back in its own cell", () => {
    const { block } = renderConditionalMarket();

    tap(block);
    // `withOriginCell` always makes the block's own cell a target, so this is
    // an ordinary put-it-back rather than an edge case.
    fireEvent.click(cell(0, 1));

    expect(announcement()).toBe(
      "Market block stayed in Entry column, primary row, and is no longer picked up.",
    );
    // The defect was this reading word for word like the nudge-drag sentence
    // produced when nothing was carried at all.
    expect(announcement()).not.toBe(
      "Market block stayed in Entry column, primary row.",
    );
    expect(cell(0, 1)).not.toHaveAttribute("aria-current");
  });

  it("says the carry is over when the grid refuses the chosen cell", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    // The same block, plus a second one that takes the cell this carry is
    // about to be committed into.
    const occupied = clearGrid(2, 3);
    occupied[0][1].push(placedMarket("b1"));
    occupied[1][0].push(placedMarket("b2"));
    render(<Harness initialGrid={grid} gridReplacement={occupied} />);

    tap(screen.getByRole("button", { name: /^Market order,/ }));
    expect(cell(0, 1)).toHaveAttribute("aria-current", "location");

    // (1,0) was one of the cells the carry offered, and has been filled since.
    fireEvent.click(screen.getByRole("button", { name: "replace the grid" }));
    fireEvent.click(cell(1, 0));

    expect(announcement()).toBe(
      "Exit column, upper conditional row cannot take this order any more. Market block stayed in Entry column, primary row, and is no longer picked up.",
    );
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);
  });
});

// =============================================================================
// A CARRY THAT OUTLIVES THE BLOCK IT NAMES
// =============================================================================
//
// Clear All, Reverse Blocks and a pattern switch all replace the grid without
// ending an active carry, so the cells it offered stay highlighted and the
// block it names may be gone. When the user then acts on one of those cells,
// the sentence has to be composed from what the grid can still confirm - which,
// for a block that has been cleared away, is no cell at all.

describe("GridArea, a carry whose block has been cleared away", () => {
  it("names no cell for it, and ends the carry", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    render(<Harness initialGrid={grid} gridReplacement={clearGrid(2, 3)} />);

    tap(screen.getByRole("button", { name: /^Market order,/ }));
    // A diagonal of the occupied primary cell, offered at pick-up time.
    expect(cell(0, 1)).toHaveAttribute("aria-current", "location");

    fireEvent.click(screen.getByRole("button", { name: "replace the grid" }));
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, primary row, empty");

    // The stale target is still highlighted, so this is a cell the user was
    // just told they could drop into.
    fireEvent.click(cell(1, 0));

    expect(announcement()).toBe(
      "Market block is no longer on the grid, and is no longer picked up.",
    );
    expect(announcement()).not.toContain("stayed in");
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);
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
// The harness renders on BTC/USD, and Kraken prices that pair to ONE decimal
// (`pair_decimals: 1`), so the grid draws "$75,000.0" rather than the flat two
// decimals it used to draw for every market. That is the point: the price on
// screen is at the precision the payload is sent at.
const stopLossPrice = (yPosition: number) =>
  `$${(MARKET_PRICE * (1 - yPosition / 100)).toLocaleString("en-US", {
    minimumFractionDigits: BTC_USD.priceDecimals,
    maximumFractionDigits: BTC_USD.priceDecimals,
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
// The harness renders on BTC/USD, and Kraken prices that pair to ONE decimal
// (`pair_decimals: 1`), so the grid draws "$75,000.0" rather than the flat two
// decimals it used to draw for every market. That is the point: the price on
// screen is at the precision the payload is sent at.
const upsidePrice = (yPosition: number) =>
  `$${(MARKET_PRICE * (1 + yPosition / 100)).toLocaleString("en-US", {
    minimumFractionDigits: BTC_USD.priceDecimals,
    maximumFractionDigits: BTC_USD.priceDecimals,
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

// =============================================================================
// FOLLOWING THE SELECTED MARKET
// =============================================================================
//
// Switching market changes two things about the grid that no other input does:
// every price chip is redrawn at a different precision, and every one of them
// now means a price in a different market. The first is visible; the second is
// not, which is why it is announced.

describe("GridArea, when the market changes", () => {
  const switchMarket = () => {
    fireEvent.click(screen.getByRole("button", { name: "switch market" }));
  };

  const arb = { market: findMarket("ARB/USD")!, precision: ARB_USD };

  it("redraws every price chip at the new pair's precision", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedLimit(20));
    render(<Harness initialGrid={grid} switchTo={arb} />);

    // BTC/USD: one decimal, so 20% below a $100,000 market reads $80,000.0.
    expect(screen.getByText("$80,000.0")).toBeInTheDocument();

    switchMarket();

    // ARB/USD: four decimals. The market price the harness supplies has not
    // changed - only the pair's rules for writing one down have - which is
    // exactly what isolates the formatting from the arithmetic.
    expect(screen.queryByText("$80,000.0")).not.toBeInTheDocument();
    expect(screen.getByText("$80,000.0000")).toBeInTheDocument();
  });

  // The `<select>` speaks its own new value; nothing speaks the consequence.
  // It goes through the grid's own announcer rather than a second one next to
  // the selector - see `utils/gridAnnouncements.ts` for why that matters.
  it("announces that the grid has been re-priced", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedLimit(20));
    render(<Harness initialGrid={grid} switchTo={arb} />);

    switchMarket();

    expect(
      screen.getByText(
        "Market changed to Arbitrum. Every block on the grid is now priced from the ARB/USD market price.",
      ),
    ).toBeInTheDocument();
  });

  // The app has not "changed" to the market it opened on, so the first render
  // must say nothing - otherwise a screen reader is told about a change the
  // user did not make, every time the panel mounts.
  it("says nothing about the market it started on", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedLimit(20));
    render(<Harness initialGrid={grid} switchTo={arb} />);

    expect(screen.queryByText(/^Market changed to/)).not.toBeInTheDocument();
  });
});

// =============================================================================
// CLICKING AWAY FROM THE PLACEMENT SURFACE
// =============================================================================
//
// The placement surface is the element `GridArea` draws: the palette a block is
// picked up from and the cells it can be put down in. Nothing else on the page
// can place anything, so a click elsewhere is the way out of holding a block -
// and it has to work whichever mechanism is holding it, because the user cannot
// tell a command carry from a drag that lost its owner.

const outside = (target: EventTarget) =>
  fireEvent(target as Element, pointerAt("pointerdown", 900, 900));

const renderEmptyGrid = (outsideControl = false) =>
  render(<Harness initialGrid={clearGrid(2, 3)} outsideControl={outsideControl} />);

const palette = (name: string) => screen.getByRole("button", { name });

describe("GridArea, clicking away from the placement surface", () => {
  afterEach(() => {
    stopDragOverlay();
  });

  it("puts down a block carried by a tap, and leaves no cell offering itself", () => {
    renderEmptyGrid();

    tap(palette("Add Limit order"));
    expect(cell(0, 1)).toHaveAttribute("aria-current", "location");

    outside(document.body);

    expect(announcement()).toBe("Cancelled. Limit order returned to the palette.");
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);
    // And the carry really is gone, rather than merely undrawn: a tap on a
    // legal cell now places nothing.
    fireEvent.click(cell(0, 1));
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, primary row, empty",
    );
  });

  it("puts down a block carried from the keyboard", () => {
    renderEmptyGrid();

    fireEvent.keyDown(palette("Add Limit order"), { key: "Enter" });
    expect(announcement()).toContain("Picked up Limit order");

    outside(document.body);

    expect(announcement()).toBe("Cancelled. Limit order returned to the palette.");
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);
  });

  it("counts a control beside the grid as outside it", () => {
    renderEmptyGrid(true);

    tap(palette("Add Limit order"));
    outside(screen.getByRole("button", { name: "a control beside the grid" }));

    expect(announcement()).toBe("Cancelled. Limit order returned to the palette.");
  });

  it("leaves focus where the user clicked, rather than dragging it back", () => {
    renderEmptyGrid(true);
    const control = screen.getByRole("button", { name: "a control beside the grid" });

    tap(palette("Add Limit order"));
    control.focus();
    outside(control);

    expect(document.activeElement).toBe(control);
  });

  it("does not cancel when the click lands on the grid itself", () => {
    renderEmptyGrid();

    tap(palette("Add Limit order"));
    fireEvent(cell(0, 1), pointerAt("pointerdown", 30, 30));
    fireEvent.click(cell(0, 1));

    expect(announcement()).toBe("Placed Limit order in Entry column, primary row.");
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, primary row, Limit",
    );
  });

  it("does not cancel when the click lands on the palette", () => {
    renderEmptyGrid();

    tap(palette("Add Limit order"));
    fireEvent(palette("Add Take Profit order"), pointerAt("pointerdown", 30, 30));

    // Reaching for another order type is a swap, which the palette decides -
    // not a click that means "put this down".
    expect(announcement()).toContain("Picked up Limit order");
  });

  it("clears a drag ghost that has lost its owner", () => {
    // `dragOverlayStore` is module state, so a gesture that never finished
    // leaves a ghost behind with nothing left to stop it. That is the pointer
    // half of the same escape hatch, and the user cannot tell it from a carry.
    renderEmptyGrid();
    startDragOverlay(undefined, "Lmt", 100, 100);
    expect(dragOverlaySnapshot().active).toBe(true);

    outside(document.body);

    expect(dragOverlaySnapshot().active).toBe(false);
  });
});

// =============================================================================
// A STRATEGY THE BUILDER WOULD NOT LOAD
// =============================================================================
//
// A saved strategy holds percentage offsets from its own market's price, so one
// placed on a pair the app no longer offers cannot be loaded without repricing
// it into a different order set. `App` refuses; this grid is what did not
// change, and it has the one voice that can say so.

describe("GridArea, when a strategy could not be loaded", () => {
  const refuse = () => {
    fireEvent.click(screen.getByRole("button", { name: "refuse a strategy" }));
  };

  it("says which market it was, and that nothing was loaded", () => {
    render(
      <Harness initialGrid={clearGrid(2, 3)} refuseStrategyOn="ARB/USD" />,
    );

    refuse();

    const said = screen.getByText(/ARB\/USD/);
    expect(said).toBeInTheDocument();
    expect(said.textContent).toContain("was not loaded");
  });

  it("stays quiet until a strategy is actually refused", () => {
    render(
      <Harness initialGrid={clearGrid(2, 3)} refuseStrategyOn="ARB/USD" />,
    );

    expect(screen.queryByText(/was not loaded/)).not.toBeInTheDocument();
  });

  // Pressing Edit twice on the same strategy is two refusals, and a live region
  // only speaks when its content changes - so the second must not be silent.
  it("says so again when the user tries the same strategy again", () => {
    render(
      <Harness initialGrid={clearGrid(2, 3)} refuseStrategyOn="ARB/USD" />,
    );

    refuse();
    const first = screen.getByText(/was not loaded/).closest("[role=status]");

    refuse();
    const second = screen.getByText(/was not loaded/).closest("[role=status]");

    // The announcer alternates between two regions precisely so a repeat is a
    // content change rather than a no-op.
    expect(second).not.toBe(first);
  });
});

// =============================================================================
// A STRATEGY THE BUILDER DID LOAD
// =============================================================================
//
// Loading one remounts this component - `loadConfig` bumps the key the panel is
// rendered with - so the fact has to be readable by a grid that has only just
// come up. That is why it arrives as a prop and why these mount with it already
// set: a `GridArea` noticing the change for itself is exactly what could not
// work, because the market it would compare against is already the new one.

describe("GridArea, when a strategy has just been loaded into it", () => {
  it("speaks from a mount that has only just come up", () => {
    render(
      <Harness
        initialGrid={clearGrid(2, 3)}
        strategyLoaded={{
          symbol: "ARB/USD",
          name: "Arbitrum",
          marketChanged: true,
        }}
      />,
    );

    expect(announcement()).toBe(
      "Saved strategy loaded onto the grid. The market changed to Arbitrum, so every block is now priced from the ARB/USD market price.",
    );
  });

  // One sentence, not two: the market change and the load are one press of
  // Edit, and two live-region writes in quick succession is the shape whose
  // first write this module's history records being cut off by the second.
  it("does not also announce the market change on its own", () => {
    render(
      <Harness
        initialGrid={clearGrid(2, 3)}
        strategyLoaded={{
          symbol: "ARB/USD",
          name: "Arbitrum",
          marketChanged: true,
        }}
      />,
    );

    expect(screen.queryByText(/^Market changed to/)).not.toBeInTheDocument();
  });

  it("says nothing when no strategy has been loaded", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} />);

    expect(announcement()).toBe("");
  });
});

// =============================================================================
// THE PANEL REPLACED UNDER A LIVE DRAG
// =============================================================================
//
// The reproduction this lane exists for, at the scale it actually happens.
// `App` keys the whole strategy panel on `strategyKey`, so a submit that
// resolves - roughly 800ms after Execute Trade is clicked - replaces the tree,
// palette included, and takes the dragged element with it. The listeners that
// would have heard `pointerup` or `pointercancel` belong to that tree, so they
// come off with it and the gesture has no way left to finish - which is why
// unmount has to be an exit of its own rather than something the window
// listeners cover. `dragOverlayStore` is module state and outlives the tree, so
// the ghost block was then welded to the cursor for the rest of the session.

describe("GridArea, replaced under a live drag", () => {
  afterEach(() => {
    stopDragOverlay();
  });

  it("clears the drag ghost when the panel is remounted mid-drag", () => {
    const Remountable = () => {
      const [generation, setGeneration] = useState(0);
      return (
        <>
          <Harness key={generation} initialGrid={clearGrid(2, 3)} />
          <button onClick={() => setGeneration((n) => n + 1)}>
            resubmit and reset the panel
          </button>
        </>
      );
    };
    render(<Remountable />);

    const limit = screen.getByRole("button", { name: "Add Limit order" });
    fireEvent(limit, pointerAt("pointerdown", 30, 30));
    fireEvent(limit, pointerAt("pointermove", 200, 300));
    expect(dragOverlaySnapshot().active).toBe(true);

    // `click` rather than a pointer sequence on purpose: a pointer-down out
    // here would reach the escape hatch, and this has to fail on the drag layer
    // alone when the drag layer is the thing that is broken.
    fireEvent.click(
      screen.getByRole("button", { name: "resubmit and reset the panel" }),
    );

    expect(dragOverlaySnapshot().active).toBe(false);
  });
});

// =============================================================================
// A DISMISSAL CLICK, AND THE GESTURE IT HAS TO END
// =============================================================================
//
// The trace this closes, end to end: a mouse is let go outside the window with
// no capture in force, so nothing in the page hears the release and the gesture
// keeps its window listeners. Those listeners match on pointer id alone and a
// mouse's id is a constant 1. The user sees a ghost welded to the cursor and
// clicks the chart to be rid of it - and that click's own `pointerup` is
// matched as the stale gesture's drop, at coordinates that are on no cell, so
// the block is removed. A dismissal deleted a block.
//
// `usePointerGesture` closes the reachable path from inside itself, by ending a
// gesture on a move that carries no pressed button. These tests dispatch no
// such move, on purpose: what is being pinned here is the boundary - the
// dismissal itself ending the gesture - and a test that let the backstop run
// first would pass with the boundary removed.

describe("GridArea, a dismissal click while a gesture is still in flight", () => {
  afterEach(() => {
    stopDragOverlay();
  });

  const mouse = (type: string, x: number, y: number, buttons = buttonsFor(type)) =>
    pointerAt(type, x, y, { pointerType: "mouse", buttons });

  /**
   * A drag whose release nobody heard, left live on purpose: no `pointerup`,
   * and no move made with the button already up either.
   */
  const strandDragOn = (block: Element) => {
    vi.spyOn(block, "setPointerCapture").mockImplementation(() => {
      throw new DOMException("NotFoundError", "NotFoundError");
    });
    fireEvent(block, mouse("pointerdown", 30, 150));
    fireEvent(document.body, mouse("pointermove", 900, 900));
  };

  it("does not delete the block the stranded gesture was dragging", () => {
    const { first } = renderTwoBlocks();
    strandDragOn(first);

    // Straight to the click, with no move in between: this is the boundary,
    // not the backstop.
    fireEvent(document.body, mouse("pointerdown", 700, 400));
    fireEvent(document.body, mouse("pointerup", 700, 400));

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, Market");
    expect(announcement()).toBe(
      "Drag cancelled. Market block stayed in Entry column, row 2.",
    );
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("takes the stranded gesture's window listeners off, so nothing later resolves as its drop", () => {
    const { first } = renderTwoBlocks();
    strandDragOn(first);

    fireEvent(document.body, mouse("pointerdown", 700, 400));
    fireEvent(document.body, mouse("pointerup", 700, 400));
    // A second, entirely unrelated click somewhere else on the page. The
    // gesture is gone, so this is nobody's drop.
    fireEvent(document.body, mouse("pointerdown", 200, 500));
    fireEvent(document.body, mouse("pointerup", 200, 500));

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, Market");
    expect(announcement()).toBe(
      "Drag cancelled. Market block stayed in Entry column, row 2.",
    );
  });

  it("ends the carry and the gesture together when both are in hand", () => {
    // The two owners the register replaced. A palette order picked up by a
    // click, and then a stranded drag of a placed block: one dismissal, and
    // neither may be left behind.
    const { first } = renderTwoBlocks();

    clickBlock(palette("Add Market order"));
    expect(announcement()).toContain("Picked up Market order");

    strandDragOn(first);
    fireEvent(document.body, mouse("pointerdown", 700, 400));
    fireEvent(document.body, mouse("pointerup", 700, 400));

    // The block the stranded drag held is still where it was, and the palette
    // order is no longer in hand: a click on a legal cell places nothing.
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, Market");
    fireEvent(cell(1, 2), pointerAt("pointerdown", 30, 30));
    fireEvent.click(cell(1, 2));
    expect(cell(1, 2)).toHaveAttribute("aria-label", "Exit column, row 3, empty");
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);
  });

  it("leaves the builder usable: the next drag still places a block", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} pattern="bulk" />);

    const paletteBlock = palette("Add Market order");
    strandDragOn(paletteBlock);
    fireEvent(document.body, mouse("pointerdown", 700, 400));
    fireEvent(document.body, mouse("pointerup", 700, 400));

    stubRect(cell(1, 0), 100, 200);
    fireEvent(paletteBlock, mouse("pointerdown", 30, 20));
    fireEvent(document.body, mouse("pointermove", 30, 150));
    fireEvent(document.body, mouse("pointerup", 30, 150));

    expect(cell(1, 0)).toHaveAttribute("aria-label", "Exit column, row 1, Market");
  });
});

// =============================================================================
// CARRYING A BLOCK WITH THE MOUSE
// =============================================================================
//
// Click to pick up, click to put down. It is the same command model the
// keyboard and a finger already drive - there is no mouse-only path here - but
// the mouse is the one device with a cursor on screen between the two clicks,
// so two things are true for it and for nothing else: the block follows that
// cursor, and the cell under it is the cell the next click places into.
//
// Hold-to-drag is untouched by all of this. It is a second way in rather than a
// replacement, and the tests above it in this file are its regression suite.

describe("GridArea, carrying a block with the mouse", () => {
  afterEach(() => {
    stopDragOverlay();
  });

  /**
   * Press and release without moving, then the click a browser appends. The
   * device is what decides whether this is a click or a tap, so it is stated
   * rather than defaulted.
   */
  const pressAndRelease = (element: Element, pointerType: string) => {
    fireEvent(element, pointerAt("pointerdown", 40, 30, { pointerType }));
    fireEvent(element, pointerAt("pointerup", 40, 30, { pointerType }));
    fireEvent.click(element, { bubbles: true });
  };

  /** The cursor moves over a cell. React reads its enter events off `mouseover`. */
  const hover = (col: number, row: number) => fireEvent.mouseOver(cell(col, row));

  const targetCell = () =>
    document.querySelector("[aria-current='location']")?.getAttribute("aria-label");

  it("picks the order up and puts it on the cursor", () => {
    renderEmptyGrid();

    clickBlock(palette("Add Limit order"));

    expect(announcement()).toContain("Picked up Limit order");
    expect(announcement()).toContain("Click a highlighted cell to place it");
    expect(dragOverlaySnapshot()).toMatchObject({ active: true, abrv: "Lmt" });
  });

  it("leaves nothing on the cursor for a finger, which has none", () => {
    renderEmptyGrid();

    pressAndRelease(palette("Add Limit order"), "touch");

    expect(announcement()).toContain("Picked up Limit order");
    expect(announcement()).toContain("Tap a highlighted cell to place it");
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("makes the cell under the cursor the cell a click will place into", () => {
    renderEmptyGrid();

    clickBlock(palette("Add Limit order"));
    expect(targetCell()).toBe("Entry column, primary row, empty");

    hover(1, 1);

    expect(targetCell()).toBe("Exit column, primary row, empty");
  });

  it("says nothing while the cursor sweeps across the grid", () => {
    // Every cell the pointer crosses would otherwise be a live-region write,
    // and the sweep would talk over the sentence that started the carry. The
    // arrow keys still report every target they reach; see `pointToTarget`.
    renderEmptyGrid();

    clickBlock(palette("Add Limit order"));
    const afterPickUp = announcement();

    hover(1, 1);
    hover(0, 1);

    expect(announcement()).toBe(afterPickUp);
  });

  it("ignores a cell the carry never offered", () => {
    renderEmptyGrid();

    clickBlock(palette("Add Limit order"));
    // The conditional rows take nothing while the primary row is empty.
    hover(0, 0);

    expect(targetCell()).toBe("Entry column, primary row, empty");
  });

  it("leaves a finger's carry pointing where the finger left it", () => {
    // A tap synthesises a `mouseover` too, so without the origin check the
    // target would jump to whatever cell the last tap landed on.
    renderEmptyGrid();

    pressAndRelease(palette("Add Limit order"), "touch");
    hover(1, 1);

    expect(targetCell()).toBe("Entry column, primary row, empty");
  });

  it("places the order in the cell the cursor is over", () => {
    renderEmptyGrid();

    clickBlock(palette("Add Limit order"));
    hover(1, 1);
    fireEvent(cell(1, 1), pointerAt("pointerdown", 30, 30, { pointerType: "mouse" }));
    fireEvent.click(cell(1, 1));

    expect(cell(1, 1)).toHaveAttribute(
      "aria-label",
      "Exit column, primary row, Limit",
    );
    expect(announcement()).toBe("Placed Limit order in Exit column, primary row.");
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("refuses a cell that cannot take the order, and keeps it in hand", () => {
    renderEmptyGrid();

    clickBlock(palette("Add Limit order"));
    fireEvent(cell(0, 0), pointerAt("pointerdown", 30, 30, { pointerType: "mouse" }));
    fireEvent.click(cell(0, 0));

    expect(announcement()).toBe(
      "Entry column, upper conditional row cannot take this order. Still carrying Limit order.",
    );
    expect(cell(0, 0)).toHaveAttribute(
      "aria-label",
      "Entry column, upper conditional row, empty",
    );
    // Still in hand, and still on the cursor.
    expect(dragOverlaySnapshot().active).toBe(true);
  });

  it("puts the order back on a second click, and takes it off the cursor", () => {
    renderEmptyGrid();

    clickBlock(palette("Add Limit order"));
    clickBlock(palette("Add Limit order"));

    expect(announcement()).toBe("Cancelled. Limit order returned to the palette.");
    expect(dragOverlaySnapshot().active).toBe(false);
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);
  });

  it("puts the order back on a click away from the grid, and takes it off the cursor", () => {
    // The cancellation a mouse can always reach without a keyboard, for a carry
    // whose source block has scrolled out of sight or been replaced.
    renderEmptyGrid();

    clickBlock(palette("Add Limit order"));
    outside(document.body);

    expect(announcement()).toBe("Cancelled. Limit order returned to the palette.");
    expect(dragOverlaySnapshot().active).toBe(false);
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);
  });

  it("carries a placed block, and moves it to the cell the cursor is over", () => {
    const { first } = renderTwoBlocks();

    clickBlock(first);
    expect(dragOverlaySnapshot()).toMatchObject({ active: true, abrv: "Mkt" });

    hover(1, 2);
    fireEvent(cell(1, 2), pointerAt("pointerdown", 30, 30, { pointerType: "mouse" }));
    fireEvent.click(cell(1, 2));

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, empty");
    expect(cell(1, 2)).toHaveAttribute("aria-label", "Exit column, row 3, Market");
    expect(announcement()).toBe("Moved Market block to Exit column, row 3.");
  });

  it("hands the interaction to a drag that starts on the block it is carrying", () => {
    // The transition the two ways in share. The drag puts its own ghost on the
    // cursor before the carry it supersedes has ended, so a carry that cleared
    // "the" ghost on its way out would leave a live drag invisible.
    render(<Harness initialGrid={clearGrid(2, 3)} pattern="bulk" />);
    const paletteBlock = palette("Add Market order");

    clickBlock(paletteBlock);
    fireEvent(paletteBlock, pointerAt("pointerdown", 30, 20, { pointerType: "mouse" }));
    fireEvent(
      document.body,
      pointerAt("pointermove", 30, 150, { pointerType: "mouse" }),
    );

    // Mid-drag: the carry is gone and the drag's ghost is the one on the cursor.
    expect(dragOverlaySnapshot()).toMatchObject({ active: true, abrv: "Mkt" });
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);

    stubRect(cell(1, 0), 100, 200);
    fireEvent(document.body, pointerAt("pointerup", 30, 150, { pointerType: "mouse" }));

    expect(cell(1, 0)).toHaveAttribute("aria-label", "Exit column, row 1, Market");
    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("takes the block off the cursor when the grid stops holding it", () => {
    // Clear All replaces the grid without ending the carry - that is the known
    // carry-lifecycle gap, and it belongs to its own lane. What this pins is
    // that the ghost does not outlive the block it is drawn from: it comes off
    // the cursor rather than following it around as a picture of an order that
    // no longer exists.
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    render(<Harness initialGrid={grid} gridReplacement={clearGrid(2, 3)} />);

    clickBlock(screen.getByRole("button", { name: /^Market order,/ }));
    expect(dragOverlaySnapshot()).toMatchObject({ active: true, abrv: "Mkt" });

    fireEvent.click(screen.getByRole("button", { name: "replace the grid" }));

    expect(dragOverlaySnapshot().active).toBe(false);
  });

  it("keeps a palette order on the cursor when the grid is replaced", () => {
    // The palette is not the grid: a Limit order that was never placed still
    // exists to be placed, so clearing the grid takes nothing out of hand.
    render(
      <Harness initialGrid={clearGrid(2, 3)} gridReplacement={clearGrid(2, 3)} />,
    );

    clickBlock(palette("Add Limit order"));
    fireEvent.click(screen.getByRole("button", { name: "replace the grid" }));

    expect(dragOverlaySnapshot()).toMatchObject({ active: true, abrv: "Lmt" });
  });

  it("refuses a block drawn on a price axis, the way every other input does", () => {
    // A mouse cannot move one by dragging either - the block is wired to the
    // vertical price drag - so the click path must not offer more than the
    // drag does.
    renderPlacedLimit(25);

    clickBlock(screen.getByRole("slider"));

    expect(announcement()).toContain(
      "Limit is priced on this axis and cannot be moved to another cell",
    );
    expect(dragOverlaySnapshot().active).toBe(false);
  });
});
