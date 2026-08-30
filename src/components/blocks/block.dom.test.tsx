// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Block, { BLOCK_INSTRUCTIONS_ID } from "./block";
import { getSnapshot } from "@common/dragOverlayStore";
import {
  installPointerCapture,
  type PointerCaptureTracker,
} from "@/test/pointerCapture";

// =============================================================================
// HARNESS
// =============================================================================

/**
 * The pressed-button bitmask a real pointer carries for this event type: 1
 * while the button is held, 0 once it is up. `usePointerGesture` reads a move
 * carrying 0 as proof of a release it never heard, so a helper leaving it at
 * jsdom's default would model a mouse that is never pressed.
 */
const buttonsFor = (type: string): number =>
  type === "pointerdown" || type === "pointermove" ? 1 : 0;

const pointer = (
  type: string,
  {
    x = 0,
    y = 0,
    pointerId = 1,
    buttons = buttonsFor(type),
    pointerType = "mouse",
  }: {
    x?: number;
    y?: number;
    pointerId?: number;
    buttons?: number;
    pointerType?: string;
  } = {},
) => {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: true },
    pointerType: { value: pointerType },
    clientX: { value: x },
    clientY: { value: y },
    buttons: { value: buttons },
  });
  return event;
};

const drag = (element: Element, from: [number, number], to: [number, number]) => {
  fireEvent(element, pointer("pointerdown", { x: from[0], y: from[1] }));
  fireEvent(element, pointer("pointermove", { x: to[0], y: to[1] }));
  fireEvent(element, pointer("pointerup", { x: to[0], y: to[1] }));
};

/**
 * Press and release without movement, on the device named. The origin the
 * block reports comes from the pointer down that opened the gesture, so this
 * is the only thing that decides whether an activation is a click or a tap.
 */
const pressAndRelease = (
  element: Element,
  pointerType: string,
  at: [number, number] = [10, 10],
) => {
  fireEvent(
    element,
    pointer("pointerdown", { x: at[0], y: at[1], pointerType }),
  );
  fireEvent(element, pointer("pointerup", { x: at[0], y: at[1], pointerType }));
};

const click = (element: Element, at: [number, number] = [10, 10]) =>
  pressAndRelease(element, "mouse", at);

const tap = (element: Element, at: [number, number] = [10, 10]) =>
  pressAndRelease(element, "touch", at);

/**
 * jsdom gives every element a zero-sized box at the origin, so the block's own
 * geometry has to be supplied for anything that measures where inside it the
 * pointer landed.
 */
const stubRect = (element: Element, top: number, height: number) => {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 40,
    width: 40,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
};

let capture: PointerCaptureTracker;

beforeEach(() => {
  capture = installPointerCapture();
});

afterEach(() => {
  capture.restore();
});

// =============================================================================
// PALETTE BLOCKS - free drag
// =============================================================================

describe("Block, as a palette entry", () => {
  it("has an accessible name and points at the shared instructions", () => {
    render(<Block id="limit" abrv="Lmt" label="Limit" />);

    // The instructions themselves are rendered once, by GridArea, so in
    // isolation only the reference is here to assert.
    expect(screen.getByRole("button", { name: "Add Limit order" })).toHaveAttribute(
      "aria-describedby",
      BLOCK_INSTRUCTIONS_ID,
    );
  });

  it("opts out of the browser's touch gestures", () => {
    render(<Block id="limit" abrv="Lmt" label="Limit" />);

    // Without this a finger drag is claimed as a page scroll before the first
    // pointermove arrives, and the block never moves.
    expect(screen.getByRole("button")).toHaveClass("touch-none");
  });

  it("reports a drag with the coordinates it ended at", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    render(
      <Block
        id="limit"
        abrv="Lmt"
        label="Limit"
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />,
    );

    drag(screen.getByRole("button"), [10, 10], [220, 340]);

    expect(onDragStart).toHaveBeenCalledWith("limit");
    expect(onDragEnd).toHaveBeenCalledWith("limit", 220, 340);
  });

  it("shows the drag overlay for the duration of the drag", () => {
    render(<Block id="limit" abrv="Lmt" label="Limit" />);
    const button = screen.getByRole("button");

    fireEvent(button, pointer("pointerdown", { x: 10, y: 10 }));
    expect(getSnapshot().active).toBe(true);

    fireEvent(button, pointer("pointerup", { x: 200, y: 200 }));
    expect(getSnapshot().active).toBe(false);
  });

  it("clears the overlay when the browser cancels the drag", () => {
    const onDragEnd = vi.fn();
    const onDragCancel = vi.fn();
    render(
      <Block
        id="limit"
        abrv="Lmt"
        label="Limit"
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      />,
    );
    const button = screen.getByRole("button");

    fireEvent(button, pointer("pointerdown", { x: 10, y: 10 }));
    fireEvent(button, pointer("pointermove", { x: 90, y: 90 }));
    fireEvent(button, pointer("pointercancel", { x: 90, y: 90 }));

    // A cancelled drag returns the block; it is not a drop outside the grid,
    // which would delete it.
    expect(onDragCancel).toHaveBeenCalledWith("limit");
    expect(onDragEnd).not.toHaveBeenCalled();
    expect(getSnapshot().active).toBe(false);
  });

  it("clears the overlay when the block is unmounted mid-drag", () => {
    // The reproduction, reduced to one block. In the app the strategy panel is
    // keyed on `strategyKey`, so an Execute Trade whose 800ms submit resolves
    // while the user is dragging replaces the whole tree, palette included, and
    // takes the dragged element with it. The browser then drops the pointer
    // capture without a word and the release lands on whatever is underneath,
    // so `pointerup` never reaches this block. `dragOverlayStore` is module
    // state and survives the unmount, which is what welded the ghost block to
    // the cursor for the rest of the session.
    const onDragCancel = vi.fn();
    const onDragAborted = vi.fn();
    const { unmount } = render(
      <Block
        id="limit"
        abrv="Lmt"
        label="Limit"
        onDragCancel={onDragCancel}
        onDragAborted={onDragAborted}
      />,
    );
    const button = screen.getByRole("button");

    fireEvent(button, pointer("pointerdown", { x: 10, y: 10 }));
    fireEvent(button, pointer("pointermove", { x: 90, y: 90 }));
    expect(getSnapshot().active).toBe(true);

    unmount();

    expect(getSnapshot().active).toBe(false);
    // Nothing moved, so it is the same outcome a `pointercancel` produces.
    expect(onDragCancel).toHaveBeenCalledWith("limit");
    expect(onDragAborted).toHaveBeenCalledWith("limit");
  });

  it("leaves the overlay alone when a block that is not dragging unmounts", () => {
    render(<Block id="limit" abrv="Lmt" label="Limit" />);
    const dragged = screen.getByRole("button");
    fireEvent(dragged, pointer("pointerdown", { x: 10, y: 10 }));
    fireEvent(dragged, pointer("pointermove", { x: 90, y: 90 }));

    const bystander = render(<Block id="market" abrv="Mkt" label="Market" />);
    bystander.unmount();

    // The teardown belongs to the gesture, not to every block that goes away.
    expect(getSnapshot().active).toBe(true);
    fireEvent(dragged, pointer("pointerup", { x: 90, y: 90 }));
    expect(getSnapshot().active).toBe(false);
  });

  it("treats a tap as a command, not as a zero-length drop", () => {
    const onDragEnd = vi.fn();
    const onActivate = vi.fn();
    render(
      <Block
        id="limit"
        abrv="Lmt"
        label="Limit"
        onDragEnd={onDragEnd}
        onActivate={onActivate}
      />,
    );

    click(screen.getByRole("button"));

    expect(onActivate).toHaveBeenCalledWith("limit", "mouse");
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it("names the device the activation came from, so a carry can suit it", () => {
    // A mouse carry follows the cursor and is described with "click"; a
    // finger's cannot and is not. The block is the one place that knows which
    // device opened the gesture, so it is the one place that can say.
    const onActivate = vi.fn();
    render(<Block id="limit" abrv="Lmt" label="Limit" onActivate={onActivate} />);

    tap(screen.getByRole("button"));

    expect(onActivate).toHaveBeenCalledWith("limit", "touch");
  });

  it("still reports a drop when the pointer is released off-window", () => {
    const onDragEnd = vi.fn();
    render(<Block id="limit" abrv="Lmt" label="Limit" onDragEnd={onDragEnd} />);

    drag(screen.getByRole("button"), [10, 10], [-300, -200]);

    expect(onDragEnd).toHaveBeenCalledWith("limit", -300, -200);
    expect(getSnapshot().active).toBe(false);
  });
});

// =============================================================================
// PLACED BLOCKS - the price axis
// =============================================================================

describe("Block, placed on a price axis", () => {
  const placed = (props: Record<string, unknown> = {}) =>
    render(
      <Block
        id="b1"
        abrv="Lmt"
        label="Limit"
        leg="limit"
        yPosition={25}
        direction="upside"
        cellDescription="Entry column, primary row"
        priceText="$95,861.25"
        {...props}
      />,
    );

  it("is a vertical slider carrying its offset and its price", () => {
    placed();

    const slider = screen.getByRole("slider", {
      name: "Limit limit price, Entry column, primary row",
    });
    expect(slider).toHaveAttribute("aria-orientation", "vertical");
    expect(slider).toHaveAttribute("aria-valuenow", "25");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "50");
    expect(slider).toHaveAttribute("aria-valuetext", "+25.00%, $95,861.25");
  });

  it("signs the value by which side of the market it sits on", () => {
    placed({ direction: "downside" });

    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuenow", "-25");
    expect(slider).toHaveAttribute("aria-valuemin", "-50");
    expect(slider).toHaveAttribute("aria-valuemax", "0");
    expect(slider).toHaveAttribute("aria-valuetext", "-25.00%, $95,861.25");
  });

  it("drops the sign at the market price itself", () => {
    placed({ yPosition: 0 });

    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      "0.00%, $95,861.25",
    );
  });

  it("reports a vertical drag by pointer Y", () => {
    const onVerticalDrag = vi.fn();
    placed({ onVerticalDrag });
    const slider = screen.getByRole("slider");
    // Grabbed exactly on the block's centre, so the reported Y is the pointer's.
    stubRect(slider, 180, 40);

    fireEvent(slider, pointer("pointerdown", { x: 50, y: 200 }));
    fireEvent(slider, pointer("pointermove", { x: 52, y: 260 }));
    fireEvent(slider, pointer("pointerup", { x: 52, y: 260 }));

    expect(onVerticalDrag).toHaveBeenCalledWith("b1", 260);
  });

  it("reports nothing at all from a tap that jitters inside the slop", () => {
    const onVerticalDrag = vi.fn();
    const onActivate = vi.fn();
    placed({ onVerticalDrag, onActivate });
    const slider = screen.getByRole("slider");
    stubRect(slider, 180, 40);

    // A finger lands near the bottom edge and travels 3px before lifting. That
    // gesture is a tap - a pick-up - so the price must not follow it.
    const touch = { pointerType: "touch" } as const;
    fireEvent(slider, pointer("pointerdown", { x: 50, y: 215, ...touch }));
    fireEvent(slider, pointer("pointermove", { x: 50, y: 218, ...touch }));
    fireEvent(slider, pointer("pointerup", { x: 50, y: 218, ...touch }));

    expect(onVerticalDrag).not.toHaveBeenCalled();
    expect(onActivate).toHaveBeenCalledWith("b1", "touch");
  });

  it("carries the block by the point it was grabbed at, not by its centre", () => {
    const onVerticalDrag = vi.fn();
    placed({ onVerticalDrag });
    const slider = screen.getByRole("slider");
    stubRect(slider, 180, 40);

    fireEvent(slider, pointer("pointerdown", { x: 50, y: 215 }));
    fireEvent(slider, pointer("pointermove", { x: 50, y: 218 }));
    fireEvent(slider, pointer("pointermove", { x: 50, y: 315 }));
    fireEvent(slider, pointer("pointerup", { x: 50, y: 315 }));

    // The pointer travelled 100px, so the block does too: its centre goes from
    // 200 to 300 rather than jumping to the pointer at 315. The 3px spent
    // inside the slop on the way is carried by the move that leaves it, not
    // dropped.
    expect(onVerticalDrag).toHaveBeenCalledTimes(1);
    expect(onVerticalDrag).toHaveBeenLastCalledWith("b1", 300);
  });

  it("moves along the axis with the arrow keys, up meaning a higher price", () => {
    const onAdjustPrice = vi.fn();
    placed({ onAdjustPrice });
    const slider = screen.getByRole("slider");

    fireEvent.keyDown(slider, { key: "ArrowUp" });
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    fireEvent.keyDown(slider, { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(slider, { key: "PageUp" });
    fireEvent.keyDown(slider, { key: "PageDown" });

    expect(onAdjustPrice.mock.calls).toEqual([
      ["b1", 1],
      ["b1", -1],
      ["b1", 5],
      ["b1", 10],
      ["b1", -10],
    ]);
  });

  it("reaches either end of the axis with Home and End", () => {
    const onAdjustPrice = vi.fn();
    placed({ onAdjustPrice });
    const slider = screen.getByRole("slider");

    fireEvent.keyDown(slider, { key: "Home" });
    fireEvent.keyDown(slider, { key: "End" });

    // Clamped by the grid, so a step wider than the axis lands on its end.
    expect(onAdjustPrice.mock.calls).toEqual([
      ["b1", -100],
      ["b1", 100],
    ]);
  });

  it("picks the block up on Enter rather than adjusting the price", () => {
    const onActivate = vi.fn();
    const onAdjustPrice = vi.fn();
    placed({ onActivate, onAdjustPrice });

    fireEvent.keyDown(screen.getByRole("slider"), { key: "Enter" });

    expect(onActivate).toHaveBeenCalledWith("b1", "keyboard");
    expect(onAdjustPrice).not.toHaveBeenCalled();
  });
});

// =============================================================================
// THE COMMAND MODEL, FROM THE KEYBOARD
// =============================================================================

// =============================================================================
// WHAT WOULD GROW THE REMOVE CONTROL'S WRAPPER PAST ITS TILE
// =============================================================================
//
// The wrapper shrink-wraps its one in-flow child, so any utility on it that adds
// to its box - or sets the box outright - breaks the containment derivation in
// `blockTile.test.ts` while every token that file reads stays put.
//
// WHAT IT CATCHES: padding and margin in every spelling Tailwind offers, the
// shorthand `p-`/`m-`, the axis and side forms `px-`/`py-`/`pt-`/`pr-`/`pb-`/
// `pl-` and their margin twins, and the logical `ps-`/`pe-`/`ms-`/`me-`; every
// explicit size, `w-`/`h-`/`size-` and the `min-`/`max-` forms of the first two;
// `border` in any spelling that adds width, including the bare token; the inset
// shorthands `inset-`; and the flex sizing that stops a flex item taking its
// content's width, `basis-`/`flex-`/`grow`/`shrink`. Negative variants of all of
// them, since `-mx-2` moves the box just as surely.
//
// WHAT IT DELIBERATELY DOES NOT: anything that cannot change the wrapper's own
// box - colour, typography, `relative`, `z-*`, `overflow-*`, transforms, and a
// bare `flex`, which makes the wrapper a flex CONTAINER and leaves its own box
// shrink-wrapped as before - and arbitrary-value utilities whose bracket
// contents it does not parse (`w-[3rem]` IS caught, because the prefix is what
// is matched, but a bare `[width:3rem]` is not). It is a prefix classifier over
// class tokens and nothing more; the boxes it reasons about are only measurable
// in a browser.

/** Utilities that only affect the box in their `<prefix>-<value>` form. */
const BOX_GROWING_PREFIXES = [
  "p", "px", "py", "pt", "pr", "pb", "pl", "ps", "pe",
  "m", "mx", "my", "mt", "mr", "mb", "ml", "ms", "me",
  "w", "h", "size", "min-w", "min-h", "max-w", "max-h",
  "border", "inset", "basis", "flex", "grow", "shrink",
];

/** The three that stand alone: `border` is 1px, `grow`/`shrink` are sizing. */
const BOX_GROWING_BARE = ["border", "grow", "shrink"];

const growsTheBox = (token: string): boolean => {
  const bare = token.replace(/^-/, "");
  return (
    BOX_GROWING_BARE.includes(bare) ||
    BOX_GROWING_PREFIXES.some((prefix) => bare.startsWith(`${prefix}-`))
  );
};

describe("the wrapper tokens that would break containment", () => {
  // The reviewer's own repro heads this list: `px-2` on the wrapper makes it
  // 56px wide against a 40px tile, so `right-0` puts the 24px control 8px past
  // the tile's right edge - exactly the neighbour overhang the pin closed.
  it.each([
    "px-2", "py-1", "pt-2", "pr-2", "pb-2", "pl-1", "ps-2", "pe-2", "p-2",
    "mx-2", "my-1", "mt-1", "mr-2", "mb-2", "ml-4", "ms-2", "me-2", "m-2",
    "-mx-2", "-ml-4",
    "size-10", "w-20", "h-20", "w-[3rem]", "min-w-20", "max-w-20",
    "border", "border-2", "border-t-2", "border-x",
    "inset-0", "basis-full", "flex-1", "grow", "shrink-0",
  ])("catches %s", (token) => {
    expect(growsTheBox(token)).toBe(true);
  });

  it.each([
    "relative", "absolute", "z-2", "overflow-hidden", "rounded-md",
    "text-white-70", "bg-bg-column", "items-center", "justify-center",
    "pointer-events-none", "hover:bg-status-red-bg-strong", "flex",
  ])("leaves %s alone", (token) => {
    expect(growsTheBox(token)).toBe(false);
  });
});

// =============================================================================
// REMOVAL
// =============================================================================
//
// KEYBOARD ONLY, AND THAT IS THE WHOLE OF WHAT THIS COMPONENT OFFERS.
//
// Delete and Backspace on a focused block take THAT block off the grid. The
// pointer's removal is one control per CELL, drawn by `GridCell` in the cell's
// own top-right rail, and one press of it clears the whole cell - both legs of
// a dual-axis order together. The two are different operations on purpose:
// focus names one block, and a press names one cell.
//
// This component draws no control of its own any more, which is what gives the
// tile its whole face back to a drag. `GridArea.dom.test.tsx` covers the cell's
// control; what is asserted here is that the keyboard path survived the move
// and that nothing on the tile removes anything.

describe("Block, the removal it offers", () => {
  const placed = (props: Record<string, unknown> = {}) =>
    render(
      <Block
        id="b1"
        abrv="Lmt"
        label="Limit"
        leg="limit"
        yPosition={25}
        direction="upside"
        cellDescription="Entry column, primary row"
        priceText="$95,861.25"
        {...props}
      />,
    );

  it("removes on Delete and on Backspace alike", () => {
    const onRemove = vi.fn();
    placed({ onRemove });

    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "Delete" });
    fireEvent.keyDown(slider, { key: "Backspace" });

    expect(onRemove).toHaveBeenCalledTimes(2);
    expect(onRemove).toHaveBeenNthCalledWith(2, "b1");
  });

  it("removes the block that has focus, not its cell", () => {
    const onRemove = vi.fn();
    placed({ onRemove });

    fireEvent.keyDown(screen.getByRole("slider"), { key: "Delete" });

    expect(onRemove).toHaveBeenCalledWith("b1");
  });

  // The arrow keys are the block's other keyboard affordance, and the two must
  // not have taken each other's keys.
  it("leaves the arrow keys to the price axis", () => {
    const onRemove = vi.fn();
    const onAdjustPrice = vi.fn();
    placed({ onRemove, onAdjustPrice });

    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });

    expect(onAdjustPrice).toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  // THE TILE CARRIES NO DESTRUCTIVE CONTROL, AND THAT IS THE POINT OF THE MOVE.
  //
  // While it did, the control necessarily covered the tile's own centre: any
  // 24px round target kept wholly inside a 40px tile sits at most
  // sqrt(8^2 + 8^2) = 11.31px from the tile's centre against its own 12px
  // radius, so containment plus the WCAG 2.2 SC 2.5.8 floor ENTAILED it, and
  // the block could only be dragged from its lower half. Measured in Chrome
  // after the move, a press at the tile's top-right corner - the region the
  // control used to own - starts a real vertical drag and re-prices the block,
  // and 1584 of the tile's 1600 pixels hit-test to the tile itself (the
  // remaining 16 are its own `rounded-md` corners).
  it("draws no removal control on the tile itself", () => {
    placed({ onRemove: vi.fn() });

    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    // The slider IS the tile, and it is the only control this block renders.
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("offers no removal keys on a palette entry, which holds no order", () => {
    render(<Block id="limit" abrv="Lmt" label="Limit" />);

    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  it("does nothing on Delete when no removal is wired", () => {
    const onActivate = vi.fn();
    placed({ onActivate });

    fireEvent.keyDown(screen.getByRole("slider"), { key: "Delete" });

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("offers none on a read-only block, which is information rather than a control", () => {
    render(
      <Block
        id="b1"
        abrv="Lmt"
        label="Limit"
        leg="limit"
        yPosition={25}
        direction="downside"
        isReadOnly
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  // The wrapper still has to shrink-wrap its tile. Nothing is positioned
  // against it any more, but its box is what `centeredContainer`'s flex row and
  // the axis positioner's `justify-center` lay out - give it padding, a border,
  // a margin or a size of its own and the tile stops being drawn where the
  // price says it is. `styles/grid.test.ts` holds the positioner's own half.
  it("keeps the tile's wrapper the tile's own box", () => {
    placed({ onRemove: vi.fn() });
    const wrapper = screen.getByRole("slider").parentElement!;

    expect(
      wrapper.className.split(/\s+/).filter(Boolean).filter(growsTheBox),
      "Block's wrapper no longer shrink-wraps its tile, so the tile is drawn away from the price it is positioned at",
    ).toEqual([]);
  });
});

describe("Block, while being carried", () => {
  const carried = (props: Record<string, unknown> = {}) =>
    render(
      <Block id="limit" abrv="Lmt" label="Limit" isCarrying {...props} />,
    );

  it("steers the target cell with the arrow keys", () => {
    const onCommandMove = vi.fn();
    carried({ onCommandMove });
    const button = screen.getByRole("button");

    fireEvent.keyDown(button, { key: "ArrowLeft" });
    fireEvent.keyDown(button, { key: "ArrowRight" });
    fireEvent.keyDown(button, { key: "ArrowUp" });
    fireEvent.keyDown(button, { key: "ArrowDown" });

    expect(onCommandMove.mock.calls).toEqual([
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]);
  });

  it("places on Enter and on Space", () => {
    const onActivate = vi.fn();
    carried({ onActivate });
    const button = screen.getByRole("button");

    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });

    expect(onActivate.mock.calls).toEqual([
      ["limit", "keyboard"],
      ["limit", "keyboard"],
    ]);
  });

  it("puts the block back on Escape, and takes focus with it", () => {
    const onCommandCancel = vi.fn();
    carried({ onCommandCancel });

    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });

    expect(onCommandCancel).toHaveBeenCalledTimes(1);
    // Escape is a deliberate return: focus belongs back on the source block.
    expect(onCommandCancel).toHaveBeenCalledWith();
  });

  it("puts the block back on a second tap", () => {
    const onActivate = vi.fn();
    carried({ onActivate });

    tap(screen.getByRole("button"));

    // The pointer half of "put it down again" - a finger has no Escape key.
    expect(onActivate).toHaveBeenCalledWith("limit", "touch");
  });

  it("puts the block back on a second click, the same way", () => {
    // A mouse has an Escape key within reach, but only while focus is still on
    // the block - and the whole point of this lane is that the mouse should
    // not have to reach for the keyboard to undo what a click started.
    const onActivate = vi.fn();
    carried({ onActivate });

    click(screen.getByRole("button"));

    expect(onActivate).toHaveBeenCalledWith("limit", "mouse");
  });

  it("lets Tab through, so a carried block can never trap the keyboard", () => {
    const onCommandCancel = vi.fn();
    carried({ onCommandCancel });

    const prevented = !fireEvent.keyDown(screen.getByRole("button"), {
      key: "Tab",
    });

    expect(onCommandCancel).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(false);
    // The browser moves focus on before a focus request could be honoured, so
    // handing focus back here would land the user on this block again and
    // swallow the Tab after all.
    expect(onCommandCancel).toHaveBeenCalledWith({ restoreFocus: false });
  });

  it("swallows the arrow keys so the page does not scroll underneath", () => {
    carried({ onCommandMove: vi.fn() });

    const notPrevented = fireEvent.keyDown(screen.getByRole("button"), {
      key: "ArrowDown",
    });

    expect(notPrevented).toBe(false);
  });
});

// =============================================================================
// FOCUS
// =============================================================================

describe("Block focus handover", () => {
  it("takes focus when asked and reports that it has", () => {
    const onFocusHandled = vi.fn();
    render(
      <Block
        id="b1"
        abrv="Lmt"
        label="Limit"
        shouldFocus
        onFocusHandled={onFocusHandled}
      />,
    );

    expect(document.activeElement).toBe(screen.getByRole("button"));
    expect(onFocusHandled).toHaveBeenCalledTimes(1);
  });

  it("leaves focus alone otherwise", () => {
    render(<Block id="b1" abrv="Lmt" label="Limit" />);

    expect(document.activeElement).toBe(document.body);
  });
});

// =============================================================================
// READ-ONLY BLOCKS
// =============================================================================

describe("Block, read-only", () => {
  it("is described rather than offered as a control", () => {
    render(
      <Block
        id="b1"
        abrv="Lmt"
        label="Limit"
        leg="limit"
        yPosition={25}
        direction="downside"
        cellDescription="Entry column, primary row"
        priceText="$57,000.00"
        isReadOnly
      />,
    );

    // A tab stop that promises an interaction the panel does not offer is
    // worse than no tab stop at all.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(
      screen.getByRole("img", {
        name: "Limit limit price, Entry column, primary row, -25.00%, $57,000.00",
      }),
    ).toBeInTheDocument();
  });

  it("describes an order it holds rather than offering to add one", () => {
    render(<Block id="b1" abrv="Mkt" label="Market" isReadOnly />);

    // The Active Orders panel has no placement affordance, so "Add" would
    // invite an action that does not exist.
    expect(
      screen.getByRole("img", { name: "Market order" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Add Market order" })).toBeNull();
  });

  it("ignores pointer input entirely", () => {
    const onDragStart = vi.fn();
    const onVerticalDrag = vi.fn();
    render(
      <Block
        id="b1"
        abrv="Lmt"
        label="Limit"
        isReadOnly
        onDragStart={onDragStart}
        onVerticalDrag={onVerticalDrag}
      />,
    );

    drag(screen.getByRole("img"), [10, 10], [100, 100]);

    expect(onDragStart).not.toHaveBeenCalled();
    expect(onVerticalDrag).not.toHaveBeenCalled();
  });
});
