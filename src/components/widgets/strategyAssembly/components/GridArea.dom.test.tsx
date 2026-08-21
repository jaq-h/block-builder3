// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useRef, useState, type FC } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import GridArea from "./GridArea";
import { GridDataContext } from "../contexts/GridDataContext";
import { DragContext } from "../contexts/DragContext";
import { HoverContext } from "../contexts/HoverContext";
import { StaticContext } from "../contexts/StaticContext";
import { ORDER_TYPES } from "@data/orderTypes";
import { clearGrid } from "@utils/grid";
import { BLOCK_HEIGHT, getBlockTopPx } from "@styles/grid";
import type { BlockData, CellPosition, GridData } from "@/types/grid";
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

const placedLimit = (yPosition: number): BlockData => ({
  id: "b1",
  orderType: "limit",
  label: "Limit",
  abrv: "Lmt",
  allowedRows: [0, 1],
  axis: 2,
  yPosition,
  direction: "downside",
  axes: ["limit"],
});

const Harness: FC<{ initialGrid: GridData }> = ({ initialGrid }) => {
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
        strategyPattern: "conditional",
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

const pointer = (type: string, y: number) => {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    isPrimary: { value: true },
    pointerType: { value: "touch" },
    clientX: { value: 30 },
    clientY: { value: y },
  });
  return event;
};

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
