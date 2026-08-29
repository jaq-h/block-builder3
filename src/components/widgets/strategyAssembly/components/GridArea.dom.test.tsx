// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useEffect,
  useRef,
  useState,
  type FC,
  type SVGProps,
} from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import GridArea from "./GridArea";
import { GridDataContext } from "../contexts/GridDataContext";
import { DragContext } from "../contexts/DragContext";
import { HoverContext } from "../contexts/HoverContext";
import { StaticContext } from "../contexts/StaticContext";
import { getOrderType, ORDER_TYPES } from "@data/orderTypes";
import { clearGrid } from "@utils/grid";
import { createBlocksFromOrderType } from "@utils/blockFactory";
import {
  addBlocksToCell,
  orderConfigFromGrid,
  reverseGrid,
} from "@utils/blockMapping";
import { mapGridToOrders, validateOrder } from "@api/orderMapper";
import { BLOCK_HEIGHT, getBlockTopPx } from "@styles/grid";
import type {
  BlockData,
  CellPosition,
  GridData,
  StrategyPattern,
} from "@/types/grid";
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
 * Built with OPPOSITE directions on purpose, and pushed straight into the cell
 * rather than through `addBlocksToCell` - so this is the unstamped grid the
 * mapping owner has to cope with, not what the app now produces. A cell takes
 * one scale from `directionForNewCell` the moment its first block lands and
 * stamps every later arrival with it, so the two would agree if they had gone
 * in that way.
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
  /**
   * Publishes the grid the provider is holding after every change.
   *
   * What is drawn and what is stored are deliberately not the same for a
   * position no axis could have produced: display clamps a non-finite one to
   * the market line so nothing prints `NaN%`, while the store keeps it intact
   * so `validateOrder` still refuses the payload. Only the stored value can
   * tell those two apart, and only the stored value reaches Kraken.
   */
  onGrid?: (grid: GridData) => void;
}> = ({
  initialGrid,
  pattern = "conditional",
  gridReplacement,
  switchTo,
  refuseStrategyOn,
  strategyLoaded,
  outsideControl,
  onGrid,
}) => {
  const [selected, setSelected] = useState<{
    market: Market;
    precision: MarketPrecision;
  }>({ market: findMarket("BTC/USD")!, precision: BTC_USD });
  const [grid, setGrid] = useState<GridData>(initialGrid);
  // Derived, the way `StrategyAssemblyProvider` derives it: the grid is the
  // store and the saved config is a projection of it.
  const orderConfig = orderConfigFromGrid(grid);
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

  useEffect(() => {
    onGrid?.(grid);
  }, [grid, onGrid]);

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
 * A cell's full box, for the drop tests. `stubRect` above fixes x at 0..60,
 * which was enough while a drop was decided by the pointer alone; a block's
 * EDGES are what decide it now, so the tests that exercise a gutter have to
 * place two cells side by side and mean it.
 */
const stubBox = (
  element: Element,
  { left, top, width, height }: { left: number; top: number; width: number; height: number },
) => {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
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

  const track = document.querySelector('[data-axis-track="0-1-limit"]');
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
  // Six tests stood here, and every one of them pinned the cross-cell move that
  // decision D9 has now refused for every input method: a tap picked a placed
  // block up, a tap on another cell placed it there, and the announcements said
  // "Moved Market block to Exit column, row 1". They were correct about the
  // behaviour of the day and would have quietly certified it as intended.
  //
  // What replaces them is the same gestures reaching a refusal that is legible
  // rather than silent - in the live region, and on screen for everybody else.

  it("refuses to carry a placed block, and says how to correct a misplaced one", () => {
    const { first } = renderTwoBlocks();

    tap(first);

    expect(announcement()).toContain(
      "Market stays in the cell it was placed in",
    );
    expect(announcement()).not.toContain("Picked up");
    // No carry, so no cell is offering itself as a destination.
    expect(cell(0, 1)).not.toHaveAttribute("aria-current");
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Market",
    );
  });

  // The refusal has to be visible, not only announced: below `lg` the panel
  // holding the live region can be `display: none`, and a sighted user gets no
  // live region at all.
  it("puts the rule on screen as ordinary text, not in a second live region", () => {
    const { first } = renderTwoBlocks();

    tap(first);

    const note = screen.getByText(/Orders do not move between cells/);
    expect(note).toBeInTheDocument();
    expect(note.closest("[aria-live]")).toBeNull();
    expect(note).not.toHaveAttribute("role", "status");
    // `LiveAnnouncer` renders the grid's one voice as an alternating pair of
    // regions, and this note is in neither of them - a second live region would
    // cut the announcer off mid-sentence during the very gesture that fires
    // both.
    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(2);
    regions.forEach((region) => expect(region.contains(note)).toBe(false));
  });

  // Clear All, Reverse Blocks and a market switch all replace the grid without
  // going near the gestures that reset the note, so the note could outlive the
  // order it names and sit under an empty grid still saying that order stays in
  // a cell it is no longer in.
  it("takes the note down once the order it names is off the grid", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    grid[1][0].push(placedMarket("b2"));
    render(
      <Harness
        initialGrid={grid}
        pattern="bulk"
        gridReplacement={clearGrid(2, 3)}
      />,
    );
    const [first] = screen.getAllByRole("button", { name: /^Market order,/ });

    tap(first);
    expect(
      screen.getByText(/Orders do not move between cells/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "replace the grid" }));

    expect(
      screen.queryByText(/Orders do not move between cells/),
    ).not.toBeInTheDocument();
  });

  // Keyed on the label, a namesake kept this note alive after the block it
  // named had gone: the note is about one block, so the block's id is the
  // identity it has to keep. The replacement grid holds a Market too, so a
  // label lookup still finds one and the note stays up describing a block that
  // is no longer there.
  it("takes the note down when the block it names goes, even if a namesake arrives", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    const replacement = clearGrid(2, 3);
    replacement[1][0].push(placedMarket("b9"));
    render(
      <Harness
        initialGrid={grid}
        pattern="bulk"
        gridReplacement={replacement}
      />,
    );

    tap(screen.getByRole("button", { name: /^Market order,/ }));
    expect(
      screen.getByText(/Orders do not move between cells/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "replace the grid" }));

    // A Market is still on the grid, and it is not the one the note named.
    expect(
      screen.getByRole("button", { name: /^Market order,/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Orders do not move between cells/),
    ).not.toBeInTheDocument();
  });

  it("leaves a tap on another cell doing nothing to the grid", () => {
    const { first } = renderTwoBlocks();

    tap(first);
    fireEvent.click(cell(1, 2));

    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Market",
    );
    expect(cell(1, 2)).toHaveAttribute("aria-label", "Exit column, row 3, empty");
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

  // Below `lg` the panel holding the live region is `display: none`, so a
  // sighted user gets no announcement at all. The visible note used to be shown
  // for the no-axis refusal only, which left this one - the priced block the
  // acceptance criteria name specifically - with nothing on screen.
  it("puts the priced block's rule on screen, worded for the arrow keys", () => {
    const { slider } = renderPlacedLimit(25);

    tap(slider);

    const note = screen.getByText(/Orders do not move between cells/);
    expect(note).toHaveTextContent(
      "Limit stays in the cell it was placed in. Orders do not move between cells - use the arrow keys to change this one's price, or remove it and place a new one. Remove it with its Remove button, or with Delete while it has focus.",
    );
    expect(note.closest("[aria-live]")).toBeNull();
    expect(note).not.toHaveAttribute("role", "status");
  });

  // FORMERLY: this asserted the note said nothing about removal for a priced
  // block, because a block on a price axis is wired to the vertical price drag
  // and could not be dragged off the grid at all - so naming a removal would
  // have promised something the app could not do. Both halves of the grid have
  // a removal now, so the note offers it to both.
  it("offers the removal to a priced block, which now has one", () => {
    const { slider } = renderPlacedLimit(25);

    tap(slider);

    const note = screen.getByText(/Orders do not move between cells/);
    expect(note).toHaveTextContent(/Remove button/);
    expect(
      screen.getByRole("button", {
        name: "Remove Limit limit order, Entry column, primary row",
      }),
    ).toBeInTheDocument();
  });

  // A note that survives the action it asked for reads as though the action
  // failed. A priced block is wired to the vertical price drag, so neither of
  // the two gestures this note names passes through any of the resets that
  // existed when it was first shown for them.
  it("takes the note down once the arrow keys do what it asked", () => {
    const { slider } = renderPlacedLimit(25);

    tap(slider);
    expect(
      screen.getByText(/Orders do not move between cells/),
    ).toBeInTheDocument();

    fireEvent.keyDown(slider, { key: "ArrowUp" });

    expect(slider).not.toHaveAttribute("aria-valuenow", "-25");
    expect(
      screen.queryByText(/Orders do not move between cells/),
    ).not.toBeInTheDocument();
  });

  // Reverse Blocks swaps the entry and exit columns and keeps every block's id,
  // so the block the note names is still on the grid - in the other column. The
  // note is a claim about a block IN A CELL, and keyed on the id alone it went
  // on insisting the order stays where it was placed while the order visibly
  // changed cells.
  it("takes the note down when Reverse Blocks moves the order to the other column", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    render(
      <Harness
        initialGrid={grid}
        pattern="bulk"
        gridReplacement={reverseGrid(grid)}
      />,
    );

    tap(screen.getByRole("button", { name: /^Market order,/ }));
    expect(
      screen.getByText(/Orders do not move between cells/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "replace the grid" }));

    // The order is still on the grid, and it is in the other column now.
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, empty");
    expect(cell(1, 1)).toHaveAttribute(
      "aria-label",
      "Exit column, row 2, Market",
    );
    expect(
      screen.queryByText(/Orders do not move between cells/),
    ).not.toBeInTheDocument();
  });

  it("takes the note down once a price drag does what it asked", () => {
    const { slider, centre } = renderPlacedLimit(25);

    tap(slider);
    expect(
      screen.getByText(/Orders do not move between cells/),
    ).toBeInTheDocument();

    fireEvent(slider, pointer("pointerdown", centre));
    fireEvent(slider, pointer("pointermove", centre + 20));
    fireEvent(slider, pointer("pointerup", centre + 20));

    expect(
      screen.queryByText(/Orders do not move between cells/),
    ).not.toBeInTheDocument();
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

// =============================================================================
// REMOVING ONE PLACED BLOCK
// =============================================================================
//
// The gap this closes was worse than the parity gap it was filed as. Removal
// used to be a branch of the free drag's release handler, and `block.tsx` wires
// `useVerticalDrag` instead of `useFreeDrag` for every block its cell draws on a
// price axis - so a placed Limit, Stop Loss or Take Profit could not be removed
// by ANY input method, mouse included, and Clear All was the only way out.
// Decision D9 then made delete-and-rebuild the accepted way to correct a
// misplaced order, which is a correction path the product did not have.

describe("GridArea, removing a placed block", () => {
  /**
   * `name` is the order's label plus its leg where its cell draws one - the
   * same pairing the slider beside it is named with - and the label alone where
   * the cell draws no axis at all.
   */
  const removeControl = (name: string) =>
    screen.getByRole("button", { name: new RegExp(`^Remove ${name} order,`) });

  it("removes a block on a price axis from the keyboard, which nothing could", () => {
    const { slider } = renderPlacedLimit(25);

    fireEvent.keyDown(slider, { key: "Delete" });

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, primary row, empty",
    );
  });

  it("names the block and its cell when it goes", () => {
    const { slider } = renderPlacedLimit(25);

    fireEvent.keyDown(slider, { key: "Delete" });

    expect(announcement()).toBe(
      "Removed Limit limit block from Entry column, primary row.",
    );
  });

  // Both keys, because the platforms differ about which one deletes a thing in
  // a place and a user reaches for whichever theirs taught them.
  it("takes Backspace as well as Delete", () => {
    const { slider } = renderPlacedLimit(25);

    fireEvent.keyDown(slider, { key: "Backspace" });

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("removes a block in a cell that draws no axis, from the keyboard", () => {
    const { first } = renderTwoBlocks();

    fireEvent.keyDown(first, { key: "Delete" });

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, empty");
    expect(announcement()).toBe(
      "Removed Market block from Entry column, row 2.",
    );
  });

  it("removes a priced block on a mouse click of its own control", () => {
    renderPlacedLimit(25);

    clickBlock(removeControl("Limit limit"));

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(announcement()).toBe(
      "Removed Limit limit block from Entry column, primary row.",
    );
  });

  // The affordance is rendered rather than revealed on hover, which is the
  // whole reason a finger can reach it: there is no hover on a touch screen,
  // and a control that appears only under a cursor exists for one device.
  it("removes a priced block on a tap of its own control", () => {
    renderPlacedLimit(25);

    tap(removeControl("Limit limit"));

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("names the cell in the control, so two orders of one type are told apart", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    grid[1][0].push(placedMarket("b2"));
    render(<Harness initialGrid={grid} pattern="bulk" />);

    tap(
      screen.getByRole("button", {
        name: "Remove Market order, Exit column, row 1",
      }),
    );

    expect(cell(1, 0)).toHaveAttribute("aria-label", "Exit column, row 1, empty");
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, Market");
  });

  // TWO OF ONE KIND IN ONE CELL, WHERE ONLY IDENTITY SEPARATES THEM.
  //
  // Reachable in the bulk pattern, where `isCellValidForPlacement` returns true
  // for every cell: two Market orders share a label, a cell and therefore a
  // control name, an ambiguity recorded in `AGENTS.md` as accepted. What is not
  // acceptable is a control removing the OTHER one, which is what an overhanging
  // control produced: while it hung 8px past its own tile it covered the
  // neighbour, and a press aimed at one block destroyed another. The control is
  // pinned inside its own tile now (`REMOVE_CONTROL_SHAPE`, held there by
  // `blockTile.test.ts`), and the geometry that follows from that needs a real
  // browser - jsdom computes no layout. What is pinned here is the wiring
  // underneath it: each control takes away the block it belongs to and leaves
  // the other standing, told apart by DOM identity rather than by a name they
  // share.
  it("removes the block its own control belongs to, not the one beside it", () => {
    const grid = addBlocksToCell(
      addBlocksToCell(clearGrid(2, 3), { col: 0, row: 1 }, [placedMarket("m1")], "bulk"),
      { col: 0, row: 1 },
      [placedMarket("m2")],
      "bulk",
    );
    render(<Harness initialGrid={grid} pattern="bulk" />);

    const tiles = screen.getAllByRole("button", { name: /^Market order,/ });
    const controls = screen.getAllByRole("button", { name: /^Remove Market order,/ });
    expect(tiles).toHaveLength(2);
    expect(controls).toHaveLength(2);
    const [firstTile] = tiles;

    tap(controls[1]);

    const left = screen.getAllByRole("button", { name: /^Market order,/ });
    expect(left).toHaveLength(1);
    expect(left[0]).toBe(firstTile);
  });

  // THE HARDEST PAIR TO TELL APART, AND THE ONE THE CELL CANNOT SEPARATE.
  //
  // `createBlocksFromOrderType` gives both legs of a dual-axis order type the
  // same `label` and puts them in the SAME cell, so the label plus the cell
  // names neither of them: both controls read "Remove Stop Loss Limit order,
  // Entry column, primary row" and both removals said the same sentence. A
  // screen-reader or voice-control user could not tell which leg they were
  // about to destroy, nor which one had gone - and the survivor is half an
  // order. Built with the real factory, because the duplicate label is its
  // doing rather than a fixture's.
  it("separates the two legs of one dual-axis order, in the control and in what it says", () => {
    const place = () => {
      const definition = getOrderType("stop-loss-limit");
      if (!definition) throw new Error("stop-loss-limit is not a palette entry");
      const grid = addBlocksToCell(
        clearGrid(2, 3),
        { col: 0, row: 1 },
        createBlocksFromOrderType(definition, { baseId: "t", counter: 0 }).blocks,
        "conditional",
      );
      return render(<Harness initialGrid={grid} pattern="conditional" />);
    };

    const { unmount } = place();
    expect(
      screen.getByRole("button", {
        name: "Remove Stop Loss Limit trigger order, Entry column, primary row",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove Stop Loss Limit limit order, Entry column, primary row",
      }),
    ).toBeInTheDocument();

    tap(removeControl("Stop Loss Limit trigger"));
    expect(announcement()).toBe(
      "Removed Stop Loss Limit trigger block from Entry column, primary row.",
    );
    unmount();

    place();
    tap(removeControl("Stop Loss Limit limit"));
    expect(announcement()).toBe(
      "Removed Stop Loss Limit limit block from Entry column, primary row.",
    );
  });

  // The block that was focused is the block being removed, so leaving focus
  // alone drops it to `<body>` and the next Tab restarts at the top of the
  // document. The palette entry is where decision D9's other half starts -
  // place a new one - so that is where the keyboard lands.
  it("hands focus to the palette entry the order came from", () => {
    const { slider } = renderPlacedLimit(25);

    fireEvent.keyDown(slider, { key: "Delete" });

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Add Limit order" }),
    );
  });

  // The cell listens for a click to place whatever is in hand. Without the
  // control stopping its own click, removing a block while carrying a palette
  // order would delete the block AND drop the carried order into its cell.
  it("does not also place a carried order into the cell it emptied", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    render(<Harness initialGrid={grid} pattern="bulk" />);

    clickBlock(screen.getByRole("button", { name: "Add Limit order" }));
    // The carry has to be live for this test to mean anything at all.
    expect(announcement()).toContain("Picked up Limit order");

    clickBlock(
      screen.getByRole("button", { name: "Remove Market order, Entry column, row 2" }),
    );

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, empty");
    expect(announcement()).toBe(
      "Removed Market block from Entry column, row 2.",
    );
    // And the carry is untouched, because this is the bulk pattern: every cell
    // takes every order whatever the grid holds, so the removal took no cell
    // away from it. A carry ends when the grid stops standing behind the cells
    // it offered, and nothing here stopped. The conditional pattern is where a
    // removal does take cells away - see "a removal that takes cells away from
    // a carry" below.
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(1);
  });

  // ===========================================================================
  // A REMOVAL THAT TAKES CELLS AWAY FROM A CARRY
  // ===========================================================================
  //
  // "A removal frees a cell, so it can only widen the offer" is false, and it
  // is the assumption worth writing a test against. Conditional validity is
  // diagonal adjacency to an OCCUPIED cell, not emptiness, so removing a block
  // DELETES its diagonals; the cell it frees is the smaller half of the same
  // move. Walking every reachable occupancy of this grid gives 28 removals that
  // take a cell away from a carry, and the smallest of them is this one.
  //
  // The sibling test above is the other half of the same rule on the bulk
  // pattern, where the offer cannot change and the carry stands.
  it("ends a carry whose cell the removal takes away, without losing the removal's own sentence", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    render(<Harness initialGrid={grid} />);

    // With a block in the Entry primary cell, a Take Profit is offered that
    // block's diagonals - and the Exit upper conditional is the one it targets.
    clickBlock(screen.getByRole("button", { name: "Add Take Profit order" }));
    expect(cell(1, 0)).toHaveAttribute("aria-current", "location");

    clickBlock(
      screen.getByRole("button", {
        name: "Remove Market order, Entry column, primary row",
      }),
    );

    // The grid is empty, so only the primary row takes an order now: the cell
    // this carry was pointing at is not one the grid will accept any more.
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);
    // One press, one live-region write. Reported as two, the second erases the
    // first - `LiveAnnouncer` alternates regions and clears the one it leaves -
    // and for a removal the sentence lost is the only one naming which block
    // went, with no undo. That is why the rule runs inside the removal rather
    // than a render later.
    expect(announcement()).toBe(
      "Removed Market block from Entry column, primary row. Take Profit order returned to the palette: the grid changed underneath it.",
    );
  });

  // A palette entry is an order type rather than an order: there is nothing
  // there to take away, and a Remove beside every one of them would offer to
  // delete the palette.
  it("offers no removal on a palette entry", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} />);

    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  // The cell's scale belongs to the cell, not to whichever block happens to be
  // first in it (decision D8), so removing one block must not re-price the one
  // beside it. This is the same fact `removeBlockFromGrid` leaves alone by
  // touching no direction at all.
  it("leaves the block beside it drawn at exactly the price it was", () => {
    // Through `addBlocksToCell`, because the invariant is D8's: the cell takes
    // one scale when its first block lands and stamps every later arrival with
    // it, so the survivors already carry the scale and a removal has no
    // direction to choose. Pushed in raw, the Stop Loss would carry its own
    // "upside" and flip to +15.00% $115,000 the moment the Limit went.
    const withLimit = addBlocksToCell(
      clearGrid(2, 3),
      { col: 0, row: 1 },
      [placedLimit(25, "b1")],
      "bulk",
    );
    const grid = addBlocksToCell(
      withLimit,
      { col: 0, row: 1 },
      [placedStopLoss(15, "s1")],
      "bulk",
    );
    render(<Harness initialGrid={grid} pattern="bulk" />);

    expect(screen.getByText(limitPrice(15))).toBeInTheDocument();

    tap(removeControl("Limit limit"));

    expect(screen.queryByText(limitPrice(25))).toBeNull();
    expect(screen.getByText(limitPrice(15))).toBeInTheDocument();
  });
});

// =============================================================================
// A REMOVAL THAT WOULD OTHERWISE LEAVE A DANGLING LINK
// =============================================================================
//
// `assertLinksAreFlat` in `api/orderMapper.ts` REFUSES a grid whose
// `linkedBlockId` names a block that is not on it, rather than emitting the
// primary order with its protective close silently gone. That refusal is
// correct and is pinned in `orderMapper.test.ts`. It also means a removal that
// only filtered would hand the user a strategy nothing could submit and no
// control could mend - which is exactly the state making removal reachable
// would have created for the first time.

describe("GridArea, removing a block another block is linked to", () => {
  const linkedGrid = (): GridData => {
    const grid = clearGrid(2, 3);
    grid[0][1].push({ ...placedMarket("primary"), linkedBlockId: "close" });
    grid[0][0].push(placedLimit(25, "close"));
    return grid;
  };

  const renderLinked = () => {
    let stored: GridData = linkedGrid();
    render(
      <Harness
        initialGrid={stored}
        pattern="bulk"
        onGrid={(next) => {
          stored = next;
        }}
      />,
    );
    return { grid: () => stored };
  };

  it("refuses the strategy while the link dangles, so the guard is real", () => {
    const dangling = clearGrid(2, 3);
    dangling[0][1].push({ ...placedMarket("primary"), linkedBlockId: "close" });

    expect(() =>
      mapGridToOrders(dangling, {
        market: BTC_USD,
        currentPrice: MARKET_PRICE,
        quantity: "0.5",
      }),
    ).toThrow(/no such block is on the grid/);
  });

  it("clears the link when the block it named is removed", () => {
    const { grid } = renderLinked();

    fireEvent.keyDown(screen.getByRole("slider"), { key: "Delete" });

    const primary = grid()[0][1][0];
    expect(primary).toBeDefined();
    expect(primary).not.toHaveProperty("linkedBlockId");
  });

  it("leaves a strategy the mapper will still take", () => {
    const { grid } = renderLinked();

    fireEvent.keyDown(screen.getByRole("slider"), { key: "Delete" });

    expect(() =>
      mapGridToOrders(grid(), {
        market: BTC_USD,
        currentPrice: MARKET_PRICE,
        quantity: "0.5",
      }),
    ).not.toThrow();
  });
});

describe("GridArea, what a completed drag says", () => {
  it("says the block was removed when the drag ends off the grid", () => {
    const { first } = renderTwoBlocks();

    // No cell rect is stubbed, so every cell measures empty and this release
    // lands outside all of them - the drop that deletes.
    fireEvent(first, pointerAt("pointerdown", 30, 150));
    fireEvent(first, pointerAt("pointermove", 900, 900));
    fireEvent(first, pointerAt("pointerup", 900, 900));

    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, empty");
    expect(announcement()).toBe("Removed Market block from Entry column, row 2.");
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

describe("GridArea, a drop whose block overlaps a cell it is not over", () => {
  // ── THE DEFECT, reproduced ────────────────────────────────────────────
  //
  // The captain reported this as "the drag and drop is not dropping into the
  // cell when the drag speed is very fast". Speed is the masking condition, not
  // the trigger. What actually decided the drop was whether the POINTER landed
  // inside a cell's rect, so every release in the gutter between two cells - or
  // within half a tile of any edge - resolved to no cell at all, while the 40px
  // block on the cursor sat plainly over one. Measured in Chrome at 1440x900
  // the columns are 24px apart, which is a 24px-wide band of the grid in which
  // a drop was refused and announced "Released outside the grid".
  //
  // It is not speed-dependent: a slow drag released at the same point failed
  // identically in the browser. Speed is what removes the user's chance to
  // notice, because the same point test drove the target highlight - so a slow
  // user watches the highlight go out and corrects, and a fast one has already
  // let go.
  //
  // The boxes below are Chrome's own, from the running app at 1440x900.

  const CELL = { top: 393, width: 271, height: 195 };
  const LEFT_COLUMN = 149;
  const RIGHT_COLUMN = 444;
  /** The gap between the two columns: 420 to 444. */
  const GUTTER_START = LEFT_COLUMN + CELL.width;
  /** A y well inside both row-1 cells. */
  const ROW_MID = CELL.top + CELL.height / 2;

  /** Both middle-row cells laid out side by side, the way a browser draws them. */
  const renderTwoColumns = (grid = clearGrid(2, 3)) => {
    render(<Harness initialGrid={grid} pattern="bulk" />);
    stubBox(cell(0, 1), { left: LEFT_COLUMN, ...CELL });
    stubBox(cell(1, 1), { left: RIGHT_COLUMN, ...CELL });
  };

  const dragFromPalette = (x: number, y: number) => {
    const palette = screen.getByRole("button", { name: "Add Market order" });
    fireEvent(palette, pointerAt("pointerdown", 30, 20));
    fireEvent(palette, pointerAt("pointermove", x, y));
    fireEvent(palette, pointerAt("pointerup", x, y));
  };

  it("places the order in the cell its edge overlaps, not nowhere", () => {
    renderTwoColumns();

    // Five pixels into the gutter. The pointer is outside every cell; fifteen
    // of the tile's forty pixels are still over the left column.
    dragFromPalette(GUTTER_START + 5, ROW_MID);

    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Market",
    );
    expect(announcement()).toBe(
      "Placed Market order in Entry column, row 2.",
    );
  });

  it("gives the drop to the cell the block covers most", () => {
    renderTwoColumns();

    // Five pixels short of the right column: one pixel of tile left behind in
    // the left column, fifteen reaching into the right one.
    dragFromPalette(RIGHT_COLUMN - 5, ROW_MID);

    expect(cell(1, 1)).toHaveAttribute(
      "aria-label",
      "Exit column, row 2, Market",
    );
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, empty",
    );
  });

  it("resolves a dead-centre straddle the same way every time", () => {
    renderTwoColumns();

    // The middle of the gutter: eight pixels of tile in each column, and the
    // pointer in neither, so neither area nor pointer can separate them. The
    // lowest (column, row) settles it - the point being that a user who does
    // this twice gets the same cell twice.
    dragFromPalette(GUTTER_START + 12, ROW_MID);

    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Market",
    );
  });

  it("still says nothing was placed when the block reaches no cell", () => {
    renderTwoColumns();

    // Half a tile clear of the left column: widening the target must not turn
    // "off the grid" into a drop somewhere.
    dragFromPalette(LEFT_COLUMN - 40, ROW_MID);

    expect(announcement()).toBe(
      "Released outside the grid. Market order was not placed.",
    );
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, empty",
    );
  });

  // ── Decision D9 still holds ───────────────────────────────────────────
  //
  // A wider target is a wider target for the DROP that places an order. A
  // placed block still does not change cells, by any input method, and the
  // refusal is still the one the rule gives rather than one the cell gives.

  it("does not let a placed block reach another cell by overlapping it", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    renderTwoColumns(grid);

    const block = screen.getByRole("button", { name: /^Market order,/ });
    const landing = RIGHT_COLUMN - 5;
    fireEvent(block, pointerAt("pointerdown", LEFT_COLUMN + 30, ROW_MID));
    fireEvent(block, pointerAt("pointermove", landing, ROW_MID));
    fireEvent(block, pointerAt("pointerup", landing, ROW_MID));

    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Market",
    );
    expect(cell(1, 1)).toHaveAttribute(
      "aria-label",
      "Exit column, row 2, empty",
    );
    expect(announcement()).toBe(
      "Market block stays in the cell it was placed in, so it was not moved to Exit column, row 2. To put this order somewhere else, remove it and place a new one. Market block stayed in Entry column, row 2.",
    );
  });

  it("still removes a placed block released clear of every cell", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    renderTwoColumns(grid);

    fireEvent(
      screen.getByRole("button", { name: /^Market order,/ }),
      pointerAt("pointerdown", LEFT_COLUMN + 30, ROW_MID),
    );
    fireEvent(document.body, pointerAt("pointermove", 1200, 1200));
    fireEvent(document.body, pointerAt("pointerup", 1200, 1200));

    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, empty",
    );
    expect(announcement()).toBe("Removed Market block from Entry column, row 2.");
  });
});

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
    expect(announcement()).toBe("Removed Market block from Entry column, row 2.");
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

  // FORMERLY "still says a different cell refused the order", which expected
  // "Entry column, lower conditional row cannot take this order." That was the
  // right sentence when a placed block could in principle change cells and this
  // particular cell would not have it. Under decision D9 no cell will take a
  // placed block, so naming one would send the user hunting for a cell that
  // says yes. The refusal is about the rule, not about the cell.
  it("says a release over another cell was refused by the rule, not by the cell", () => {
    const { block } = renderConditionalMarket();

    stubRect(cell(0, 2), 650, 200);
    fireEvent(block, pointerAt("pointerdown", 30, 500));
    fireEvent(block, pointerAt("pointermove", 30, 700));
    fireEvent(block, pointerAt("pointerup", 30, 700));

    expect(announcement()).toBe(
      "Market block stays in the cell it was placed in, so it was not moved to Entry column, lower conditional row. To put this order somewhere else, remove it and place a new one. Market block stayed in Entry column, primary row.",
    );
    // Nothing moved, and the note says so on screen as well.
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, primary row, Market",
    );
    expect(
      screen.getByText(/Orders do not move between cells/),
    ).toBeInTheDocument();
  });

  it("does not offer a single cell as a target while a placed block is dragged", () => {
    const { block } = renderConditionalMarket();

    fireEvent(block, pointerAt("pointerdown", 30, 500));
    fireEvent(block, pointerAt("pointermove", 30, 700));

    // Lighting up cells that would take it would be the interface promising a
    // move the release is about to refuse. Nothing is offered, which is the
    // first half of telling the user why.
    expect(
      document.querySelectorAll("[data-col][data-row].border-accent-primary"),
    ).toHaveLength(0);

    fireEvent(block, pointerAt("pointerup", 30, 700));
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

  // FORMERLY the same case driven by *carrying* the block that is then dragged,
  // which expected "Moved Market block to Exit column, row 3." A placed block is
  // never carried now (decision D9), so the same invariant - one sentence, and
  // it is the durable one - is pinned on the gesture that can still reach it: a
  // palette carry ended by dragging the palette entry it holds.
  it("leaves the drag to speak for itself when it is the carried order", () => {
    renderTwoBlocks();

    const palette = screen.getByRole("button", { name: "Add Limit order" });
    tap(palette);
    expect(announcement()).toContain("Picked up Limit order");

    stubRect(cell(1, 2), 500, 200);
    fireEvent(palette, pointerAt("pointerdown", 30, 150));
    fireEvent(palette, pointerAt("pointermove", 30, 550));
    fireEvent(palette, pointerAt("pointerup", 30, 550));
    fireEvent.click(palette, { bubbles: true });

    expect(announcement()).toBe("Placed Limit order in Exit column, row 3.");
  });
});

// =============================================================================
// A SAME-CELL NUDGE IN THE BULK PATTERN
// =============================================================================
//
// **The test that stood here pinned the wrong behaviour, and said so.** It was
// titled "still reorders and re-prices the cell, while saying the block stayed",
// and asserted that a ten-pixel nudge inside a block's own cell took the block
// out of the cell array and pushed it back - so the Limit beside it became
// `blocks[0]`, the cell header changed from "Market" to "Limit", and every
// price in the cell was redrawn on the other block's scale. It was written as a
// fence around a mutation another lane owned. That lane is this one, and the
// ruling is decision D8: the direction belongs to the cell, stamped when the
// first block lands.
//
// So the assertions are inverted rather than deleted. The gesture is the same
// ordinary accidental nudge; what it must now do is nothing at all.

describe("GridArea, a same-cell nudge in the bulk pattern", () => {
  it("leaves the cell's order and its prices exactly as they were", () => {
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

    // FORMERLY "Entry column, row 2, Limit, Market" - the remove-then-push
    // reorder. Nothing is removed and nothing is pushed any more.
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Market, Limit",
    );
    expect(
      within(cell(0, 1) as HTMLElement).getByText("Market"),
    ).toBeInTheDocument();

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

describe("GridArea, a carry ended by a drag on that same subject", () => {
  // Both tests here used to tap a *placed* Market block to start the carry,
  // then drag that same block. A placed block is never carried now (decision
  // D9), so the same invariant is driven from the palette - and on the outcome
  // where it matters most: one that describes nothing happening, because then
  // nothing else in the sentence tells the user their order has left their hand.

  it("says the order was not placed and is no longer carried, in one sentence", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} />);

    const palette = screen.getByRole("button", { name: "Add Limit order" });
    tap(palette);
    expect(announcement()).toContain("Picked up Limit order");

    // No cell rect is stubbed, so this release lands outside every cell.
    fireEvent(palette, pointerAt("pointerdown", 30, 150));
    fireEvent(palette, pointerAt("pointermove", 900, 900));
    fireEvent(palette, pointerAt("pointerup", 900, 900));
    fireEvent.click(palette, { bubbles: true });

    expect(announcement()).toBe(
      "Released outside the grid. Limit order was not placed, and is no longer picked up.",
    );
    // The clause has to still be true after the operation that produced it.
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(
      0,
    );
  });

  it("says the same when the browser cancels that drag", () => {
    render(<Harness initialGrid={clearGrid(2, 3)} />);

    const palette = screen.getByRole("button", { name: "Add Limit order" });
    tap(palette);

    fireEvent(palette, pointerAt("pointerdown", 30, 150));
    fireEvent(palette, pointerAt("pointermove", 30, 300));
    fireEvent(palette, pointerAt("pointercancel", 30, 300));

    // `onDragCancel` ends the drag before `onDragAborted` announces, so this
    // also pins that the released-carry flag outlives the end of the gesture.
    expect(announcement()).toBe(
      "Drag cancelled. Limit order was not placed, and is no longer picked up.",
    );
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(
      0,
    );
  });
});

// =============================================================================
// A PICK-UP REFUSED WHILE SOMETHING IS ALREADY CARRIED
// =============================================================================

describe("GridArea, a refused pick-up while an order is carried", () => {
  it("names the order that is still in hand", () => {
    // With the Entry primary and the Exit upper conditional occupied, the one
    // cell left is the Exit lower conditional. A Stop Loss may sit there; a
    // Take Profit may not, so reaching for one while holding the other is a
    // swap the grid refuses.
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    grid[1][0].push(placedMarket("b2"));
    render(<Harness initialGrid={grid} />);

    tap(screen.getByRole("button", { name: "Add Stop Loss order" }));
    expect(announcement()).toContain("Picked up Stop Loss order");
    expect(cell(1, 2)).toHaveAttribute("aria-current", "location");

    tap(screen.getByRole("button", { name: "Add Take Profit order" }));

    // Refusing without dispatching leaves the Stop Loss carried, and the
    // highlight that shows it is not available to a screen-reader user.
    expect(announcement()).toBe(
      "Take Profit order cannot be placed anywhere in the grid right now. Still carrying Stop Loss order.",
    );
    expect(cell(1, 2)).toHaveAttribute("aria-current", "location");
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
//
// FORMERLY this also covered "a block put back in its own cell", which rested on
// `withOriginCell` making a placed block's own cell a target. Both went with the
// cross-cell move (decision D9).

describe("GridArea, a commit that ends the carry", () => {
  // FORMERLY "says the carry is over when the grid refuses the chosen cell",
  // which drove exactly this sequence and then TAPPED the stale cell to hear
  // the truth. That sentence was the honest half of a dishonest interface: the
  // cell went on advertising itself between the replacement and the tap, so the
  // user was invited into a cell the commit was about to refuse. The carry now
  // ends with the grid, and the invitation is withdrawn before anyone can act
  // on it - which is why the tap that used to be the point of this test is here
  // only to show that nothing is left to place.
  //
  // `commit`'s own `refused` branch is kept and is not dead: it is what makes
  // the commit answer from what the grid DID rather than from the snapshot it
  // was holding, and a commit that trusts its snapshot is not a guard.
  it("withdraws the offer when the grid is replaced, rather than at the next tap", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    // The same grid, plus a second block that takes the cell this carry is
    // about to be committed into.
    const occupied = clearGrid(2, 3);
    occupied[0][1].push(placedMarket("b1"));
    occupied[1][0].push(placedMarket("b2"));
    render(<Harness initialGrid={grid} gridReplacement={occupied} />);

    tap(screen.getByRole("button", { name: "Add Take Profit order" }));
    expect(cell(1, 0)).toHaveAttribute("aria-current", "location");

    // (1,0) was one of the cells the carry offered, and has been filled since.
    fireEvent.click(screen.getByRole("button", { name: "replace the grid" }));

    expect(announcement()).toBe(
      "Take Profit order returned to the palette: the grid changed underneath it.",
    );
    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);

    // And the carry really is gone rather than merely undrawn: the cell it used
    // to offer places nothing now.
    fireEvent.click(cell(1, 0));
    expect(cell(1, 0)).toHaveAttribute(
      "aria-label",
      "Exit column, upper conditional row, Market",
    );
  });
});

// =============================================================================
// A CARRY THAT OUTLIVES THE GRID IT WAS STARTED AGAINST
// =============================================================================
//
// It does not any more, and the transition that ends it has one owner - see
// `useBlockCommand`. What this file adds to that hook's own suite is the thing
// only a rendered grid can show: that no cell is left drawing itself as a drop
// target afterwards.
//
// The suite here used to carry a *placed* block through such a replacement and
// check that the sentence named no cell once the block had been cleared away. A
// placed block is never carried now (decision D9), so a carry can no longer
// name a block that the grid might lose - the palette entry it names is always
// there.

describe("GridArea, a carry the grid is replaced under", () => {
  /** Carrying a Take Profit, with the Exit upper conditional as its target. */
  const carryOverAPlacedMarket = (gridReplacement: GridData) => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    render(<Harness initialGrid={grid} gridReplacement={gridReplacement} />);

    tap(screen.getByRole("button", { name: "Add Take Profit order" }));
    expect(cell(1, 0)).toHaveAttribute("aria-current", "location");

    fireEvent.click(screen.getByRole("button", { name: "replace the grid" }));
  };

  // Clear All, and every other path that empties the grid: the diagonal cells
  // the carry was offered stop being legal the moment the primary order goes,
  // and the disabled cell it was pointing at must not still read as the place
  // this order is going.
  it("leaves no cell drawing itself as a target after the grid is emptied", () => {
    carryOverAPlacedMarket(clearGrid(2, 3));

    expect(document.querySelectorAll("[aria-current='location']")).toHaveLength(0);
    expect(announcement()).toBe(
      "Take Profit order returned to the palette: the grid changed underneath it.",
    );
  });

  // Reverse Blocks keeps every block and swaps the columns, so the offer moves
  // to the other side of the grid - the old cells are as wrong as an emptied
  // grid's, and the block is not on the cursor any more either.
  it("leaves no cell drawing itself as a target after the columns are swapped", () => {
    const reversed = clearGrid(2, 3);
    reversed[0][1].push(placedMarket("b1"));
    carryOverAPlacedMarket(reverseGrid(reversed));

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

  const track = document.querySelector('[data-axis-track="0-1-trigger"]');
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
// **The suite that stood here pinned the defect, not the fix.** It was titled
// "a block drawn in a column its axis field does not name", and it *created*
// that state on purpose: free-drag a Limit out of an axis-less bulk cell,
// release it in the LEFT half of an empty cell, and the drop wrote `axis: 1`
// onto a block whose `axes` still said `["limit"]`. It then checked the price
// drag still worked in spite of the mismatch.
//
// That is split 6. The drop no longer reads an axis off the pointer at all, and
// the cross-cell move it needed is refused outright (decision D9), so `axis` and
// `axes` are written together by `axesForBlockAxis` and never rewritten apart.
// What is asserted now is the invariant rather than a workaround for its
// absence; the reload half is in `StrategyAssemblyContext.reload.test.tsx`.

describe("GridArea, which leg a block is", () => {
  it("does not rewrite a block's axis from where a drag was released", () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedStopLoss(15, "trigger-leg"));
    grid[0][1].push(placedLimit(10, "limit-leg"));
    render(<Harness initialGrid={grid} pattern="bulk" />);

    const trigger = screen.getByRole("slider", { name: /Stop Loss/ });
    expect(trigger.getAttribute("aria-label")).toContain("trigger price");

    // Release in the RIGHT half of another cell - the pointer position that
    // used to stamp `axis: 2` onto this block and relabel it a limit leg.
    stubRect(cell(1, 1), 400, 300);
    fireEvent(trigger, pointerAt("pointerdown", 30, 100));
    fireEvent(trigger, pointerAt("pointermove", 190, 572));
    fireEvent(trigger, pointerAt("pointerup", 190, 572));

    // Still in its own cell, still the trigger leg, still on the trigger axis.
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Stop Loss, Limit",
    );
    expect(
      document.querySelector('[data-axis-track="0-1-trigger"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("slider", { name: /Stop Loss/ })
        .getAttribute("aria-label"),
    ).toContain("trigger price");
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

  it("speaks once when it ends a stranded gesture and a carry together", () => {
    // Both mechanisms in hand at the same moment, which takes stranding the
    // drag FIRST and then picking a block up from the keyboard: a drag
    // recognised while something is carried releases that carry itself, and a
    // pointer pick-up would let its own release resolve the stranded gesture on
    // the way past. One dismissal, two settled facts, and a live region that
    // holds one message - so they arrive as one write rather than the second
    // replacing the first before it has been read.
    const { first } = renderTwoBlocks();

    strandDragOn(first);
    fireEvent.keyDown(palette("Add Market order"), { key: "Enter" });
    expect(announcement()).toContain("Picked up Market order");

    fireEvent(document.body, mouse("pointerdown", 700, 400));
    fireEvent(document.body, mouse("pointerup", 700, 400));

    expect(announcement()).toBe(
      "Drag cancelled. Market block stayed in Entry column, row 2. " +
        "Cancelled. Market order returned to the palette.",
    );

    // And both really ended, rather than only being spoken about: the dragged
    // block is where it was, and the carried order places nothing.
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Entry column, row 2, Market");
    fireEvent(cell(1, 2), pointerAt("pointerdown", 30, 30));
    fireEvent.click(cell(1, 2));
    expect(cell(1, 2)).toHaveAttribute("aria-label", "Exit column, row 3, empty");
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

  // FORMERLY "carries a placed block, and moves it to the cell the cursor is
  // over", which expected "Moved Market block to Exit column, row 3." A placed
  // block is not carried by any input method now (decision D9), and the mouse
  // is not an exception - it was the input the old carve-outs were justified by.
  it("refuses to carry a placed block, and puts nothing on the cursor", () => {
    const { first } = renderTwoBlocks();

    clickBlock(first);

    expect(dragOverlaySnapshot().active).toBe(false);
    expect(announcement()).toContain(
      "Market stays in the cell it was placed in",
    );
    expect(
      screen.getByText(/Orders do not move between cells/),
    ).toBeInTheDocument();
    expect(cell(0, 1)).toHaveAttribute(
      "aria-label",
      "Entry column, row 2, Market",
    );
  });

  /**
   * A carry, and one placed block for a stray click to land on. The Market is
   * in the primary row, so the conditional pattern offers the Limit exactly one
   * cell - `(1, 0)` - and the Market's own cell is not it.
   */
  const renderCarryOverPlacedBlock = () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedMarket("b1"));
    render(<Harness initialGrid={grid} />);

    clickBlock(palette("Add Limit order"));
    expect(dragOverlaySnapshot()).toMatchObject({ active: true, abrv: "Lmt" });
  };

  it("keeps the carried order on the cursor when a click lands on another block", () => {
    // The press on that block runs a whole gesture inside the carry, ghost and
    // all, and the carry outlives it. A gesture that cleared "the" ghost on its
    // way out would empty the cursor for the rest of the carry, while the grid
    // went on saying the order was still in hand.
    renderCarryOverPlacedBlock();

    clickBlock(screen.getByRole("button", { name: /^Market order,/ }));

    expect(announcement()).toBe(
      "Entry column, primary row cannot take this order. Still carrying Limit order.",
    );
    expect(dragOverlaySnapshot()).toMatchObject({ active: true, abrv: "Lmt" });
  });

  it("keeps the carried order on the cursor when a second pick-up is refused", () => {
    // Same shape, reached from the palette: the Market has nowhere to go while
    // the primary row is taken, so `pickUp` refuses without dispatching and the
    // Limit is still the thing in hand.
    renderCarryOverPlacedBlock();

    clickBlock(palette("Add Market order"));

    expect(announcement()).toBe(
      "Market order cannot be placed anywhere in the grid right now. Still carrying Limit order.",
    );
    expect(dragOverlaySnapshot()).toMatchObject({ active: true, abrv: "Lmt" });
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

  // FORMERLY "takes the block off the cursor when the grid stops holding it",
  // which carried a placed Market and checked the ghost came off when Clear All
  // removed the block. Only a palette order can be on the cursor now (decision
  // D9), and a palette order cannot be cleared away - so the ghost can no longer
  // outlive what it is drawn from, and the test below covers the case that is
  // left.

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

// =============================================================================
// A SAVED `axis` THAT DISAGREES WITH THE BLOCK'S LEG
// =============================================================================
//
// The state a reloaded strategy really carries. `gridFromConfig` rebuilds a
// Stop Loss saved at `axis: 2` through `axesForBlockAxis`, which correctly
// gives it `axes: ["trigger"]` and leaves the saved `axis` as it was - so the
// two fields disagree, and everything the cell draws has to follow the leg.
// Splitting the columns on `axis` drew this block in a column labelled "Limit"
// around a slider whose accessible name said "trigger price", and pointed the
// vertical drag's track lookup at a column the block was not in.

const TriggerIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} data-testid="trigger-icon" />
);
const LimitIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} data-testid="limit-icon" />
);

const savedStopLoss = (yPosition: number): BlockData => ({
  id: "s1",
  orderType: "stop-loss",
  label: "Stop Loss",
  abrv: "SL",
  allowedRows: [0, 1, 2],
  // Saved at the limit axis, rehydrated as the trigger leg. The leg is the
  // truth; this field is what a reload happens to have kept.
  axis: 2,
  yPosition,
  direction: "downside",
  axes: ["trigger"],
  triggerIcon: TriggerIcon,
  limitIcon: LimitIcon,
});

describe("GridArea, a block whose saved axis disagrees with its leg", () => {
  const renderSavedStopLoss = (yPosition: number) => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(savedStopLoss(yPosition));
    render(<Harness initialGrid={grid} />);

    const track = document.querySelector('[data-axis-track="0-1-trigger"]');
    if (!track) throw new Error("the trigger axis column was not rendered");
    stubRect(track, TRACK_TOP, TRACK_HEIGHT);

    const slider = screen.getByRole("slider");
    const blockTop = TRACK_TOP + getBlockTopPx(yPosition, TRACK_HEIGHT, true);
    stubRect(slider, blockTop, BLOCK_HEIGHT);

    return { grid, slider, centre: blockTop + BLOCK_HEIGHT / 2 };
  };

  it("draws it as the trigger leg, in the column, the label and the icon alike", () => {
    const { slider } = renderSavedStopLoss(15);

    expect(
      document.querySelector('[data-axis-track="0-1-trigger"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-axis-track="0-1-limit"]')).toBeNull();
    // Scoped to the cell: the palette beside it carries its own "Limit" entry,
    // and this is a claim about which column this block was drawn in.
    const drawnCell = within(cell(0, 1) as HTMLElement);
    expect(drawnCell.getByText("Trigger")).toBeInTheDocument();
    expect(drawnCell.queryByText("Limit")).not.toBeInTheDocument();
    expect(drawnCell.getByTestId("trigger-icon")).toBeInTheDocument();
    expect(drawnCell.queryByTestId("limit-icon")).not.toBeInTheDocument();
    expect(slider).toHaveAccessibleName(/Stop Loss trigger price/);
  });

  it("still re-prices it on a vertical drag, because the track lookup agrees", () => {
    const { slider, centre } = renderSavedStopLoss(15);

    expect(slider).toHaveAttribute("aria-valuenow", "-15");

    fireEvent(slider, pointer("pointerdown", centre));
    fireEvent(slider, pointer("pointermove", centre + 20));
    fireEvent(slider, pointer("pointerup", centre + 20));

    // Further down a descending track is further from market, so the magnitude
    // grows. What matters is that it moved at all: keyed by `axis` the lookup
    // found no "0-1-2" column and fell through to the only track in the cell,
    // which happens to work for a single-column cell and silently would not for
    // a cell drawing two.
    const moved = Number(slider.getAttribute("aria-valuenow"));
    expect(moved).toBeLessThan(-15);
    expect(Number.isFinite(moved)).toBe(true);
  });

  it("shows the same price on the chip as it sends in the payload", () => {
    const { grid } = renderSavedStopLoss(15);

    const [order] = mapGridToOrders(grid, {
      market: BTC_USD,
      currentPrice: MARKET_PRICE,
      quantity: "0.5",
    });

    const expected = MARKET_PRICE * (1 - 15 / 100);
    expect(Number(order.trigger_price ?? order.triggers?.price)).toBe(expected);
    expect(
      screen.getByText(
        `$${expected.toLocaleString("en-US", {
          minimumFractionDigits: BTC_USD.priceDecimals,
          maximumFractionDigits: BTC_USD.priceDecimals,
        })}`,
      ),
    ).toBeInTheDocument();
  });
});

// =============================================================================
// A STORED POSITION NO AXIS COULD HAVE PRODUCED
// =============================================================================
//
// The principle this whole lane settled on is CLAMP ON READ, NEVER DESTROY
// INFORMATION ON WRITE: display collapses a non-finite position onto the market
// line so nothing prints `NaN%`, and the store keeps it intact so
// `validateOrder`'s `Number.isFinite` guard still has something to refuse.
//
// The arrow keys were the last write site breaking it. `NaN + 1` is `NaN`, it
// walks through `Math.max`/`Math.min` untouched, and the no-op guard comparing
// it to itself is false - so one press wrote a clamped 0 into the grid, which
// is the market price, and the corrupt order became a plausible at-market limit
// order that validated cleanly. A press on a block with no usable position now
// does nothing at all, because inventing a position the user never chose is the
// guessing this mapping exists to prevent.

describe("GridArea, arrow keys on a block whose stored position is corrupt", () => {
  const renderCorruptLimit = () => {
    const grid = clearGrid(2, 3);
    grid[0][1].push(placedLimit(Number.NaN));
    let stored: GridData = grid;
    render(
      <Harness
        initialGrid={grid}
        onGrid={(published) => {
          stored = published;
        }}
      />,
    );

    const track = document.querySelector('[data-axis-track="0-1-limit"]');
    if (!track) throw new Error("the axis column was not rendered");
    stubRect(track, TRACK_TOP, TRACK_HEIGHT);

    return {
      slider: screen.getByRole("slider"),
      storedPosition: () => stored[0][1][0].yPosition,
      payload: () =>
        mapGridToOrders(stored, {
          market: BTC_USD,
          currentPrice: MARKET_PRICE,
          quantity: "0.5",
        }),
    };
  };

  it("draws it on the market line rather than printing a number it cannot", () => {
    const { slider, storedPosition } = renderCorruptLimit();

    expect(slider).toHaveAttribute("aria-valuenow", "0");
    expect(Number.isFinite(storedPosition())).toBe(false);
  });

  it("leaves the position alone, so the payload is still refused", () => {
    const { slider, storedPosition, payload } = renderCorruptLimit();

    fireEvent.keyDown(slider, { key: "ArrowUp" });

    // Not 0, which is what the clamp used to write here: 0 is an offset of
    // nothing, which prices the order at the market and validates cleanly.
    expect(Number.isFinite(storedPosition())).toBe(false);

    const [order] = payload();
    expect(Number.isFinite(Number(order.limit_price))).toBe(false);
    expect(validateOrder(order)).toContain(
      "Limit price must be a finite number",
    );
  });

  it("still prices a block whose position the axis can express", () => {
    const { slider } = renderPlacedLimit(25);

    fireEvent.keyDown(slider, { key: "ArrowUp" });

    expect(slider).not.toHaveAttribute("aria-valuenow", "-25");
  });
});
