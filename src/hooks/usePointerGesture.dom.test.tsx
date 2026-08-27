// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { usePointerGesture, TAP_SLOP_PX } from "./usePointerGesture";
import { isBlockInHand, releaseBlockInHand } from "./blockInHand";
import {
  installPointerCapture,
  type PointerCaptureTracker,
} from "@/test/pointerCapture";

// =============================================================================
// HARNESS
// =============================================================================

interface Calls {
  down: { x: number; y: number }[];
  move: { x: number; y: number }[];
  recognised: string[];
  up: { point: { x: number; y: number }; moved: boolean }[];
  /** The device each release named, kept apart so `up` stays comparable. */
  upPointerType: string[];
  cancel: string[];
  /** `moved` as each cancellation reported it: a tap and a drag differ here. */
  cancelMoved: boolean[];
}

const Probe = ({ calls, disabled }: { calls: Calls; disabled?: boolean }) => {
  const { isActive, handlers } = usePointerGesture({
    disabled,
    onDown: (p) => calls.down.push(p),
    onMove: (p) => calls.move.push(p),
    onDragRecognised: () => calls.recognised.push("recognised"),
    onUp: (point, moved, pointerType) => {
      calls.up.push({ point, moved });
      calls.upPointerType.push(pointerType);
    },
    onCancel: (moved) => {
      calls.cancel.push("cancelled");
      calls.cancelMoved.push(moved);
    },
  });

  return (
    <button type="button" data-testid="target" data-active={isActive} {...handlers}>
      block
    </button>
  );
};

/**
 * A block that stops carrying the gesture's handlers without unmounting, the
 * way `Block` does the moment a block gains or loses a price axis: the same
 * button, wearing the other drag hook's handlers from the next render on.
 */
const SwappableProbe = ({ calls }: { calls: Calls }) => {
  const [wired, setWired] = useState(true);
  const { isActive, handlers } = usePointerGesture({
    onUp: (point, moved, pointerType) => {
      calls.up.push({ point, moved });
      calls.upPointerType.push(pointerType);
    },
    onCancel: (moved) => {
      calls.cancel.push("cancelled");
      calls.cancelMoved.push(moved);
    },
  });

  return (
    <>
      <button
        type="button"
        data-testid="target"
        data-active={isActive}
        {...(wired ? handlers : {})}
      >
        block
      </button>
      <button
        type="button"
        data-testid="unwire"
        onClick={() => setWired(false)}
      >
        swap handlers
      </button>
    </>
  );
};

const emptyCalls = (): Calls => ({
  down: [],
  move: [],
  recognised: [],
  up: [],
  upPointerType: [],
  cancel: [],
  cancelMoved: [],
});

/**
 * The pressed-button bitmask a real pointer carries for this event type: 1
 * while the button is held, 0 once it is up. The browser reports it on every
 * move, and the hook reads it as proof of a release it never heard, so a
 * helper that left it at jsdom's default of 0 would model a mouse that is
 * never pressed. A test that needs the stale case states `buttons` itself.
 */
const buttonsFor = (type: string): number =>
  type === "pointerdown" || type === "pointermove" ? 1 : 0;

/**
 * jsdom's `PointerEvent` constructor ignores the pointer fields, so they are
 * stamped on explicitly. React reads them straight off the native event.
 */
const pointer = (
  type: string,
  init: {
    x?: number;
    y?: number;
    pointerId?: number;
    isPrimary?: boolean;
    button?: number;
    buttons?: number;
    pointerType?: string;
  } = {},
) => {
  const {
    x = 0,
    y = 0,
    pointerId = 1,
    isPrimary = true,
    button = 0,
    buttons = buttonsFor(type),
    pointerType = "mouse",
  } = init;
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
    buttons,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: isPrimary },
    pointerType: { value: pointerType },
    clientX: { value: x },
    clientY: { value: y },
    buttons: { value: buttons },
  });
  return event;
};

const target = () => screen.getByTestId("target");

/**
 * What a click away from the placement surface does: empty the shared register.
 * Wrapped in `act`, because ending a gesture sets React state and the assertion
 * that follows reads the render it triggers.
 */
const dismiss = () => act(() => void releaseBlockInHand());

let capture: PointerCaptureTracker;

beforeEach(() => {
  capture = installPointerCapture();
});

afterEach(() => {
  capture.restore();
  // Module state shared with `blockInHand`: a gesture a test deliberately left
  // live must not still be registered when the next one runs.
  act(() => void releaseBlockInHand());
});

// =============================================================================
// TESTS
// =============================================================================

describe("usePointerGesture", () => {
  it("reports a drag with the coordinates of every stage", () => {
    const calls = emptyCalls();
    render(<Probe calls={calls} />);

    fireEvent(target(), pointer("pointerdown", { x: 10, y: 10 }));
    fireEvent(target(), pointer("pointermove", { x: 40, y: 60 }));
    fireEvent(target(), pointer("pointerup", { x: 80, y: 120 }));

    expect(calls.down).toEqual([{ x: 10, y: 10 }]);
    expect(calls.move).toEqual([{ x: 40, y: 60 }]);
    expect(calls.up).toEqual([{ point: { x: 80, y: 120 }, moved: true }]);
  });

  it("works the same for a finger as for a mouse", () => {
    const calls = emptyCalls();
    render(<Probe calls={calls} />);

    fireEvent(
      target(),
      pointer("pointerdown", { x: 10, y: 10, pointerType: "touch" }),
    );
    fireEvent(
      target(),
      pointer("pointermove", { x: 90, y: 10, pointerType: "touch" }),
    );
    fireEvent(
      target(),
      pointer("pointerup", { x: 90, y: 10, pointerType: "touch" }),
    );

    expect(calls.up).toEqual([{ point: { x: 90, y: 10 }, moved: true }]);
  });

  it("captures the pointer on down and hands it back on release", () => {
    render(<Probe calls={emptyCalls()} />);

    fireEvent(target(), pointer("pointerdown", { x: 5, y: 5 }));
    expect(capture.captured.get(target())?.has(1)).toBe(true);

    fireEvent(target(), pointer("pointerup", { x: 50, y: 50 }));
    expect(capture.releaseCalls).toBe(1);
    expect(capture.captured.get(target())?.has(1)).toBe(false);
  });

  it("still reports the release when the pointer is let go outside the window", () => {
    const calls = emptyCalls();
    render(<Probe calls={calls} />);

    fireEvent(target(), pointer("pointerdown", { x: 100, y: 100 }));
    // Negative coordinates: the pointer is off the top-left of the viewport.
    // Capture is what delivers this at all - the old window `mouseup`
    // listener never saw it, and the block stayed stuck to the cursor.
    fireEvent(target(), pointer("pointermove", { x: -220, y: -140 }));
    fireEvent(target(), pointer("pointerup", { x: -220, y: -140 }));

    expect(calls.up).toEqual([
      { point: { x: -220, y: -140 }, moved: true },
    ]);
    expect(target().dataset.active).toBe("false");
  });

  it("calls onCancel and ends the gesture when the browser takes the pointer", () => {
    const calls = emptyCalls();
    render(<Probe calls={calls} />);

    fireEvent(target(), pointer("pointerdown", { x: 0, y: 0 }));
    fireEvent(target(), pointer("pointercancel", { x: 0, y: 0 }));

    expect(calls.cancel).toEqual(["cancelled"]);
    expect(calls.up).toEqual([]);
    expect(target().dataset.active).toBe("false");
  });

  // ===========================================================================
  // A RELEASE THE ELEMENT NEVER RECEIVES
  // ===========================================================================
  //
  // Every test above lets go of the pointer on the element the gesture started
  // on, which is what capture normally arranges. These are the releases that
  // land somewhere else, and each one used to leave the gesture alive forever:
  // `onUp` never ran, so nothing closed what pointer down opened, the drag
  // overlay stayed welded to the cursor - it is module state and follows the
  // pointer from its own window listener - and the outcome went unannounced,
  // because the announcer only ever hears from these callbacks. The builder was
  // then unusable until the page was reloaded.
  //
  // Capture is not a guarantee: `capture()` swallows its own failure by design,
  // the browser can drop a capture mid-gesture, and an element can stop
  // carrying this hook's handlers while its component stays mounted. None of
  // those are things this hook can see, so none of them may decide whether a
  // gesture ends.

  describe("a release the element never receives", () => {
    /** Somewhere else on the page: another panel, the chart, the background. */
    const elsewhere = () => screen.getByTestId("elsewhere");

    const ProbeWithNeighbour = ({ calls }: { calls: Calls }) => (
      <>
        <Probe calls={calls} />
        <div data-testid="elsewhere">not the block</div>
      </>
    );

    it("ends the gesture when the pointer is let go over another element", () => {
      const calls = emptyCalls();
      render(<ProbeWithNeighbour calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 10, y: 10 }));
      fireEvent(elsewhere(), pointer("pointermove", { x: 400, y: 300 }));
      fireEvent(elsewhere(), pointer("pointerup", { x: 400, y: 300 }));

      expect(calls.up).toEqual([{ point: { x: 400, y: 300 }, moved: true }]);
      expect(target().dataset.active).toBe("false");
    });

    it("ends the gesture when the release is only ever seen by the window", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 100, y: 100 }));
      // Off the top-left of the viewport, and delivered to nothing inside the
      // document at all - the shape a release outside the window takes when
      // the capture that would have retargeted it is not in force.
      fireEvent(window, pointer("pointermove", { x: -220, y: -140 }));
      fireEvent(window, pointer("pointerup", { x: -220, y: -140 }));

      expect(calls.up).toEqual([{ point: { x: -220, y: -140 }, moved: true }]);
      expect(target().dataset.active).toBe("false");
    });

    it("cancels the gesture when the browser takes the pointer elsewhere", () => {
      const calls = emptyCalls();
      render(<ProbeWithNeighbour calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 10, y: 10 }));
      fireEvent(elsewhere(), pointer("pointermove", { x: 400, y: 300 }));
      fireEvent(elsewhere(), pointer("pointercancel", { x: 400, y: 300 }));

      expect(calls.cancel).toEqual(["cancelled"]);
      expect(calls.cancelMoved).toEqual([true]);
      expect(calls.up).toEqual([]);
      expect(target().dataset.active).toBe("false");
    });

    it("ends the gesture even when the capture it asked for was refused", () => {
      const calls = emptyCalls();
      render(<ProbeWithNeighbour calls={calls} />);
      // A capture that throws is the failure `capture()` is written to swallow.
      // Nothing downstream may depend on it having succeeded.
      vi.spyOn(target(), "setPointerCapture").mockImplementation(() => {
        throw new DOMException("NotFoundError", "NotFoundError");
      });

      fireEvent(target(), pointer("pointerdown", { x: 10, y: 10 }));
      fireEvent(elsewhere(), pointer("pointermove", { x: 400, y: 300 }));
      fireEvent(elsewhere(), pointer("pointerup", { x: 400, y: 300 }));

      expect(calls.up).toEqual([{ point: { x: 400, y: 300 }, moved: true }]);
      expect(target().dataset.active).toBe("false");
    });

    it("starts the next gesture after a release nothing in the page heard", () => {
      // The one release the window listeners cannot hear: let go outside the
      // window with no capture in force, so it is retargeted nowhere and
      // dispatched to nothing - not the element, not the window. The gesture
      // survives it, and the next pointer down is what has to end it. Dropping
      // that pointer down instead would deaden this element for the rest of
      // the session, which is the wedge the whole lane exists to close.
      const calls = emptyCalls();
      render(<ProbeWithNeighbour calls={calls} />);
      const refused = vi
        .spyOn(target(), "setPointerCapture")
        .mockImplementation(() => {
          throw new DOMException("NotFoundError", "NotFoundError");
        });

      fireEvent(target(), pointer("pointerdown", { x: 10, y: 10 }));
      fireEvent(elsewhere(), pointer("pointermove", { x: 400, y: 300 }));
      // Nothing is dispatched for the release, on purpose.
      expect(calls.up).toEqual([]);
      expect(calls.cancel).toEqual([]);

      refused.mockRestore();
      fireEvent(target(), pointer("pointerdown", { x: 20, y: 20 }));

      // The stale gesture was owed an outcome, and got the one an interrupted
      // drag gets rather than being discarded.
      expect(calls.cancel).toEqual(["cancelled"]);
      expect(calls.cancelMoved).toEqual([true]);
      // And what starts underneath it is an ordinary gesture: capture taken,
      // active, and reported all the way to its own release.
      expect(calls.down).toEqual([
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ]);
      expect(capture.captured.get(target())?.has(1)).toBe(true);
      expect(target().dataset.active).toBe("true");

      fireEvent(elsewhere(), pointer("pointermove", { x: 200, y: 150 }));
      fireEvent(elsewhere(), pointer("pointerup", { x: 200, y: 150 }));

      expect(calls.up).toEqual([{ point: { x: 200, y: 150 }, moved: true }]);
      expect(calls.cancel).toEqual(["cancelled"]);
      expect(target().dataset.active).toBe("false");
    });

    it("ends a stale gesture on the first move made with the button up", () => {
      // The other half of an unheard release, and the half that matters most:
      // reaching anything else takes moving the mouse, and until the gesture
      // ends its window listeners still match by pointer id - a mouse's is a
      // constant 1 - so the next release anywhere in the page would be
      // resolved as this gesture's drop at that unrelated point. A move
      // carrying no pressed button is the browser saying the button is
      // already up.
      const calls = emptyCalls();
      render(<ProbeWithNeighbour calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 10, y: 10 }));
      fireEvent(elsewhere(), pointer("pointermove", { x: 400, y: 300 }));
      // No release event of any kind: it was let go outside the window with no
      // capture in force, so nothing in the page ever saw it.
      expect(calls.up).toEqual([]);
      expect(calls.cancel).toEqual([]);

      fireEvent(elsewhere(), pointer("pointermove", { x: 420, y: 320, buttons: 0 }));

      expect(calls.cancel).toEqual(["cancelled"]);
      expect(calls.cancelMoved).toEqual([true]);
      expect(calls.up).toEqual([]);
      expect(target().dataset.active).toBe("false");
      // The stale move is not a move: it must not re-price anything or count
      // as travel, so only the drag's own move was ever reported.
      expect(calls.move).toEqual([{ x: 400, y: 300 }]);

      // And nothing of the dead gesture is left to intercept the release of
      // whatever the user does next.
      fireEvent(elsewhere(), pointer("pointerup", { x: 420, y: 320 }));
      expect(calls.up).toEqual([]);

      fireEvent(target(), pointer("pointerdown", { x: 10, y: 10 }));
      fireEvent(elsewhere(), pointer("pointermove", { x: 200, y: 150 }));
      fireEvent(elsewhere(), pointer("pointerup", { x: 200, y: 150 }));

      expect(calls.up).toEqual([{ point: { x: 200, y: 150 }, moved: true }]);
      expect(calls.cancel).toEqual(["cancelled"]);
    });

    it("ends the gesture when the element stops carrying its handlers", () => {
      // `Block` swaps its whole handler set the moment a block gains or loses a
      // price axis, on the same button and without unmounting - so the unmount
      // exit does not cover this one. The gesture belongs to the hook, not to
      // whichever handlers the element happens to be wearing.
      const calls = emptyCalls();
      render(<SwappableProbe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 10, y: 10 }));
      fireEvent(target(), pointer("pointermove", { x: 400, y: 300 }));
      fireEvent.click(screen.getByTestId("unwire"));
      fireEvent(target(), pointer("pointerup", { x: 400, y: 300 }));

      expect(calls.up).toEqual([{ point: { x: 400, y: 300 }, moved: true }]);
      expect(target().dataset.active).toBe("false");
    });

    it("leaves nothing behind once it has ended", () => {
      // A second release, from a gesture that is already over, must not report
      // an outcome the user never produced.
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 10, y: 10 }));
      fireEvent(target(), pointer("pointerup", { x: 90, y: 90 }));
      fireEvent(window, pointer("pointermove", { x: 200, y: 200 }));
      fireEvent(window, pointer("pointerup", { x: 200, y: 200 }));

      expect(calls.up).toHaveLength(1);
      expect(calls.move).toEqual([]);
    });
  });

  describe("unmounting mid-gesture", () => {
    // The window listeners belong to the component that installed them, so a
    // component that goes away mid-gesture takes them with it and the release
    // is heard by nobody. That, rather than anything about which element the
    // events reach, is why unmount has to be an exit taken by hand: everything
    // pointer down opened would otherwise stay open, which is how the drag
    // ghost came to be welded to the cursor when the strategy panel remounted
    // under a live drag.
    it("cancels a drag when the element is unmounted under it", () => {
      const calls = emptyCalls();
      const { unmount } = render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 0, y: 0 }));
      fireEvent(target(), pointer("pointermove", { x: 90, y: 90 }));
      unmount();

      expect(calls.cancel).toEqual(["cancelled"]);
      expect(calls.cancelMoved).toEqual([true]);
      expect(calls.up).toEqual([]);
    });

    it("reports an unmounted tap as a tap, so nothing is announced for it", () => {
      const calls = emptyCalls();
      const { unmount } = render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 0, y: 0 }));
      unmount();

      expect(calls.cancelMoved).toEqual([false]);
    });

    it("releases the capture it took", () => {
      const calls = emptyCalls();
      const { unmount } = render(<Probe calls={calls} />);
      const element = target();

      fireEvent(element, pointer("pointerdown", { x: 0, y: 0 }));
      expect(capture.captured.get(element)?.has(1)).toBe(true);

      unmount();

      expect(capture.captured.get(element)?.has(1)).toBe(false);
    });

    it("says nothing when no gesture was in flight", () => {
      const calls = emptyCalls();
      const { unmount } = render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 0, y: 0 }));
      fireEvent(target(), pointer("pointerup", { x: 0, y: 0 }));
      unmount();

      expect(calls.cancel).toEqual([]);
    });
  });

  // ===========================================================================
  // THE SHARED REGISTER
  // ===========================================================================
  //
  // A gesture is one of two things that can have a block in the user's hand,
  // and `blockInHand` is where both of them say so. Emptying it is what a click
  // away from the placement surface does, and it has to reach a gesture whose
  // release nobody heard - otherwise that gesture's window listeners survive
  // the dismissal and match the very `pointerup` that completes it.

  describe("the shared block-in-hand register", () => {
    it("registers a gesture for as long as it is live", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      expect(isBlockInHand()).toBe(false);
      fireEvent(target(), pointer("pointerdown", { x: 30, y: 30 }));
      expect(isBlockInHand()).toBe(true);

      fireEvent(target(), pointer("pointerup", { x: 30, y: 30 }));
      expect(isBlockInHand()).toBe(false);
    });

    it("ends a stale gesture when the register is emptied", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      // A drag whose release reached nobody: no `pointerup` is dispatched, and
      // no move carrying `buttons === 0` either, so the hook's own late
      // notice cannot be what ends this.
      fireEvent(target(), pointer("pointerdown", { x: 30, y: 30 }));
      fireEvent(document.body, pointer("pointermove", { x: 400, y: 300 }));

      dismiss();

      expect(calls.cancel).toEqual(["cancelled"]);
      // A drag had been recognised, so there is an outcome owed to the user.
      expect(calls.cancelMoved).toEqual([true]);
      expect(target()).toHaveAttribute("data-active", "false");
    });

    it("takes the window listeners off with it", () => {
      // The point of ending it rather than merely forgetting it: the listeners
      // match on pointer id alone, and a mouse's is a constant 1, so a release
      // that arrives afterwards would otherwise be resolved as this gesture's
      // drop at whatever unrelated point it landed on.
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 30, y: 30 }));
      fireEvent(document.body, pointer("pointermove", { x: 400, y: 300 }));
      dismiss();

      fireEvent(document.body, pointer("pointerup", { x: 700, y: 400 }));

      expect(calls.up).toEqual([]);
      expect(calls.cancel).toEqual(["cancelled"]);
    });

    it("says nothing when the register is emptied with no gesture in flight", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      dismiss();

      expect(calls.cancel).toEqual([]);
    });

    it("leaves the next gesture working", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 30, y: 30 }));
      dismiss();

      fireEvent(target(), pointer("pointerdown", { x: 30, y: 30 }));
      fireEvent(target(), pointer("pointerup", { x: 31, y: 30 }));

      expect(calls.up).toEqual([{ point: { x: 31, y: 30 }, moved: false }]);
    });
  });

  describe("tap detection", () => {
    it("treats a release without movement as a tap", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 30, y: 30 }));
      fireEvent(target(), pointer("pointerup", { x: 30, y: 30 }));

      expect(calls.up[0].moved).toBe(false);
    });

    it("tolerates a wobble within the slop", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 30, y: 30 }));
      fireEvent(
        target(),
        pointer("pointermove", { x: 30 + TAP_SLOP_PX, y: 30 }),
      );
      fireEvent(target(), pointer("pointerup", { x: 30, y: 30 }));

      expect(calls.up[0].moved).toBe(false);
    });

    it("is a drag once the pointer travels past the slop", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 30, y: 30 }));
      fireEvent(
        target(),
        pointer("pointermove", { x: 30 + TAP_SLOP_PX + 1, y: 30 }),
      );
      // Even coming back to the start, it stays a drag.
      fireEvent(target(), pointer("pointerup", { x: 30, y: 30 }));

      expect(calls.up[0].moved).toBe(true);
    });

    it("announces the drag once, on the move that leaves the slop", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 30, y: 30 }));
      fireEvent(target(), pointer("pointermove", { x: 30 + TAP_SLOP_PX, y: 30 }));
      // Still a tap so far: whatever a drag supersedes must not have happened.
      expect(calls.recognised).toEqual([]);

      fireEvent(
        target(),
        pointer("pointermove", { x: 30 + TAP_SLOP_PX + 1, y: 30 }),
      );
      fireEvent(target(), pointer("pointermove", { x: 200, y: 30 }));
      fireEvent(target(), pointer("pointerup", { x: 200, y: 30 }));

      expect(calls.recognised).toEqual(["recognised"]);
    });

    it("says nothing about a drag when the gesture stays a tap", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 30, y: 30 }));
      fireEvent(target(), pointer("pointermove", { x: 30 + TAP_SLOP_PX, y: 30 }));
      fireEvent(target(), pointer("pointerup", { x: 30, y: 30 }));

      expect(calls.recognised).toEqual([]);
    });

    it("names the device that opened the gesture, not the one that ended it", () => {
      // A release is worded and drawn differently for a mouse than for a
      // finger, and the release itself is not where that is decided: one
      // gesture is one device, from the pointer down that started it.
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(
        target(),
        pointer("pointerdown", { x: 30, y: 30, pointerType: "touch" }),
      );
      fireEvent(
        target(),
        pointer("pointerup", { x: 30, y: 30, pointerType: "mouse" }),
      );

      expect(calls.upPointerType).toEqual(["touch"]);
    });
  });

  describe("gestures it refuses to start", () => {
    it("ignores a secondary mouse button", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 0, y: 0, button: 2 }));

      expect(calls.down).toEqual([]);
    });

    it("ignores a second finger while one is already down", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(target(), pointer("pointerdown", { x: 0, y: 0, pointerId: 1 }));
      fireEvent(
        target(),
        pointer("pointerdown", { x: 5, y: 5, pointerId: 2, isPrimary: false }),
      );
      fireEvent(target(), pointer("pointermove", { x: 90, y: 90, pointerId: 2 }));

      expect(calls.down).toHaveLength(1);
      expect(calls.move).toEqual([]);
    });

    it("ignores a non-primary pointer entirely", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} />);

      fireEvent(
        target(),
        pointer("pointerdown", { x: 0, y: 0, isPrimary: false }),
      );

      expect(calls.down).toEqual([]);
    });

    it("does nothing at all when disabled", () => {
      const calls = emptyCalls();
      render(<Probe calls={calls} disabled />);

      fireEvent(target(), pointer("pointerdown", { x: 0, y: 0 }));
      fireEvent(target(), pointer("pointermove", { x: 90, y: 90 }));
      fireEvent(target(), pointer("pointerup", { x: 90, y: 90 }));

      expect(calls).toEqual(emptyCalls());
    });
  });

  it("moves focus to the element without scrolling it into view", () => {
    render(<Probe calls={emptyCalls()} />);
    const focus = vi.spyOn(target(), "focus");

    fireEvent(target(), pointer("pointerdown", { x: 0, y: 0 }));

    // The grid area scrolls; a focus that scrolls would move the cell out from
    // under the pointer as the drag begins.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(target());
  });

  it("prevents the default so the drag is not also a text selection", () => {
    render(<Probe calls={emptyCalls()} />);

    const event = pointer("pointerdown", { x: 0, y: 0 });
    fireEvent(target(), event);

    expect(event.defaultPrevented).toBe(true);
  });
});
