import { useEffect, useRef, useState } from "react";

// =============================================================================
// POINTER GESTURE PRIMITIVE
// =============================================================================
//
// One code path for mouse, touch and pen. Both drag hooks build on this, so a
// finger, a stylus and a mouse produce exactly the same callbacks.
//
// Three things here are load-bearing:
//
//  - **A gesture starts on an element and ends on the window.** Pointer down is
//    the only listener the element carries, because it is the only thing that
//    has to know *which* element this is. Everything after it - move, up,
//    cancel - is listened for on the window for the life of the gesture, keyed
//    on the pointer id. See "One way out" below for why that is not the
//    `window.addEventListener("mouseup")` this file was written to replace.
//  - `setPointerCapture` retargets every subsequent move/up for this pointer to
//    the element the gesture started on. It is what keeps hit-testing still -
//    the cell under the cursor cannot steal a hover, and the drop coordinates
//    are the pointer's rather than whatever slid under it - and it is why
//    `GridArea` can read the drag from events bubbling through the placement
//    surface. It is kept for that, not to end anything: inside the page the
//    release is heard without it. Outside the window it is the only thing that
//    delivers a release at all, which is the one case below.
//  - the elements carry `touch-action: none` (see `blockVariants`), without
//    which the browser claims a finger drag for page scrolling before the
//    first `pointermove` ever reaches us.
//
// ── One way out ────────────────────────────────────────────────────────────
//
// Every gesture ends. That is the whole invariant, and it used to rest on a
// single assumption: that the element the gesture started on would receive the
// release. Capture was the only thing making that true, and nothing verified
// it. `capture()` below swallows its own failure by design, the browser can
// drop a capture mid-gesture without telling the hook, and an element can stop
// carrying this hook's handlers while its component stays mounted - `Block`
// swaps its whole handler set the moment a block gains or loses a price axis.
// Any one of those left the gesture alive with no way to finish: the release
// landed on whatever was under the cursor, `onUp` never ran, and so nothing
// ever called `stopDragOverlay`. `dragOverlayStore` is module state, so the
// ghost block was welded to the cursor for the rest of the session, silently -
// no outcome was reported either, because the announcer only ever hears from
// these callbacks. The builder was unusable until a reload.
//
// Listening on the window closes that off. A captured pointer's events are
// retargeted to the element and then bubble to the window like any other, so
// the window sees everything the element sees *plus* everything it misses -
// which makes it a superset rather than a second mechanism, and leaves exactly
// one path into `finish()`.
//
// Be precise about what that buys, because the previous version of this
// comment was not. Wherever *in the page* the release lands, and whatever
// handlers the element is wearing by then, the window hears it. What it does
// not buy is delivery from *outside* the window: an active capture is the only
// thing that retargets an off-window release into the page, so a pointer let
// go outside the window with no capture in force reaches nobody - not the
// element and not the window either, exactly as the `mouseup` listeners this
// replaced never saw one. Capture makes that release deliverable; the window
// listeners make every delivered release heard.
//
// So the exits are worth listing exactly, because that residue is what the
// last three are for. A gesture ends on a release the window heard, on a
// `pointercancel`, on unmount, on a fresh pointer down on the same element,
// and on a move that proves the button is already up. The last two are the
// unheard release being noticed late, from the two directions the user can
// reach it from: pressing that element again, or moving the mouse anywhere.
// Nothing here watches the capture, because a capture the hook never got is
// not something it can watch.
//
// What that leaves uncovered, stated rather than glossed: between the unheard
// release and whichever of those two events comes next, the gesture is still
// live as far as this hook is concerned, and its overlay is still on the
// cursor. The first mouse move ends it, so the window is the distance between
// a release outside the window and the pointer coming back into the page.
//
// Unmount is an exit of its own and still has to be taken by hand: the
// listeners come off with the component, so a gesture whose component goes
// away mid-drag would otherwise leave its overlay behind. See the cleanup at
// the bottom.

/** A pointer that never moved further than this is a tap, not a drag. */
export const TAP_SLOP_PX = 4;

export interface GesturePoint {
  x: number;
  y: number;
}

export interface UsePointerGestureOptions {
  /**
   * Fired on pointer down, before it is known whether this is a tap or a drag.
   * `element` is the one the gesture started on, so a caller can measure where
   * inside it the pointer landed.
   */
  onDown?: (point: GesturePoint, element: HTMLElement) => void;
  /**
   * Fired for every move of the captured pointer. `moved` is false while the
   * gesture is still inside `TAP_SLOP_PX` and might yet turn out to be a tap;
   * it is already true on the move that crosses the threshold.
   */
  onMove?: (point: GesturePoint, moved: boolean) => void;
  /**
   * Fired once per gesture, on the move that crosses `TAP_SLOP_PX`: the point
   * at which this is known to be a drag rather than a tap. Anything a drag
   * supersedes belongs here rather than in `onDown`, which still cannot tell
   * the two apart.
   */
  onDragRecognised?: () => void;
  /**
   * Fired on release, wherever the pointer was let go: over a cell, over the
   * palette, over another panel, or outside the window entirely. `moved` is
   * false when the pointer never travelled beyond `TAP_SLOP_PX`, i.e. this was
   * a tap or a click rather than a drag.
   */
  onUp?: (point: GesturePoint, moved: boolean) => void;
  /**
   * Fired when the gesture ends without a release: the browser takes the
   * pointer away (`pointercancel`), or the element the gesture started on is
   * unmounted under it. `moved` says whether a drag had actually been
   * recognised by then: an interrupted tap changed nothing and has nothing to
   * report, an interrupted drag does.
   */
  onCancel?: (moved: boolean) => void;
  /** When true, no gesture starts at all. */
  disabled?: boolean;
}

export interface PointerGestureHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
}

export interface UsePointerGestureReturn {
  isActive: boolean;
  handlers: PointerGestureHandlers;
}

interface ActiveGesture {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  element: HTMLElement;
  /** Takes this gesture's window listeners back off again. */
  removeListeners: () => void;
}

/** jsdom has no pointer capture, and a detached element throws. Neither is fatal. */
const capture = (element: HTMLElement, pointerId: number): void => {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // Capture keeps hit-testing still during the drag; it is not what ends the
    // gesture, so failing to take it costs precision rather than the exit.
  }
};

const releaseCapture = (element: HTMLElement, pointerId: number): void => {
  try {
    if (element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture?.(pointerId);
    }
  } catch {
    // Already released, or the element is gone. Nothing to undo.
  }
};

export const usePointerGesture = ({
  onDown,
  onMove,
  onDragRecognised,
  onUp,
  onCancel,
  disabled = false,
}: UsePointerGestureOptions): UsePointerGestureReturn => {
  const [isActive, setIsActive] = useState(false);

  // The gesture lives in a ref so move handling never depends on a rendered
  // value: a drag must keep working during the render that `isActive` triggers.
  const gestureRef = useRef<ActiveGesture | null>(null);

  // Every callback behind one ref that each render refreshes. The window
  // listeners are installed once, on pointer down, so without this they would
  // spend the whole gesture calling the handlers of the render it started on -
  // and every caller here passes inline arrows that change identity each time.
  // Written from an effect rather than during render, because a ref written
  // during render is a ref the next render cannot be trusted to have seen.
  const callbacksRef = useRef({
    onDown,
    onMove,
    onDragRecognised,
    onUp,
    onCancel,
  });
  useEffect(() => {
    callbacksRef.current = {
      onDown,
      onMove,
      onDragRecognised,
      onUp,
      onCancel,
    };
  });

  /** Undo everything pointer down set up. The one place a gesture is torn down. */
  const teardown = (gesture: ActiveGesture): void => {
    gesture.removeListeners();
    releaseCapture(gesture.element, gesture.pointerId);
    gestureRef.current = null;
  };

  const finish = (): void => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    teardown(gesture);
    setIsActive(false);
  };

  /** The gesture this event belongs to, or null when it belongs to no gesture. */
  const gestureFor = (pointerId: number): ActiveGesture | null => {
    const gesture = gestureRef.current;
    return gesture && gesture.pointerId === pointerId ? gesture : null;
  };

  const handleMove = (e: PointerEvent) => {
    const gesture = gestureFor(e.pointerId);
    if (!gesture) return;

    // A move carrying no pressed button is proof the release already happened
    // and nobody heard it. That is a platform fact rather than a guess: a
    // pointer that is down reports its pressed-button bitmask on every move,
    // and only a move made after the button came back up reports 0. Measured
    // in Chrome - down 1, move 1, up 0, and every move after that 0.
    //
    // It matters because the window listeners outlive the release they never
    // saw, and they match on pointer id alone. A mouse's id is a constant 1,
    // so the next `pointerup` anywhere in the page - a click meant to dismiss
    // the ghost, on the chart or on another panel - would be matched by a
    // gesture that ended minutes ago and resolved as a drop at that unrelated
    // point, which for a placed block means `handleDragEnd` deleting it.
    // Reaching anywhere else takes moving the mouse, so this runs first.
    //
    // Only a mouse can get here. Touch and pen pointers are implicitly
    // captured to the element they went down on, so their release is always
    // delivered and the gesture cannot go stale in the first place; a mouse
    // has no implicit capture, so when the one this hook asks for is refused
    // or dropped, a release outside the window reaches nothing at all. Touch
    // is protected a second time by never reusing a pointer id, which pen does
    // not do - but a lifted pen still in range hovers, and a hover move
    // carries 0, so this covers that too.
    //
    // The move is not reported, only the end: a move made after the button is
    // up must not be able to register as a drag or re-price an order.
    if (e.buttons === 0) {
      const { moved } = gesture;
      finish();
      callbacksRef.current.onCancel?.(moved);
      return;
    }

    if (!gesture.moved) {
      const dx = e.clientX - gesture.startX;
      const dy = e.clientY - gesture.startY;
      if (Math.hypot(dx, dy) > TAP_SLOP_PX) {
        gesture.moved = true;
        callbacksRef.current.onDragRecognised?.();
      }
    }
    callbacksRef.current.onMove?.({ x: e.clientX, y: e.clientY }, gesture.moved);
  };

  const handleUp = (e: PointerEvent) => {
    const gesture = gestureFor(e.pointerId);
    if (!gesture) return;
    const { moved } = gesture;
    finish();
    callbacksRef.current.onUp?.({ x: e.clientX, y: e.clientY }, moved);
  };

  const handleCancel = (e: PointerEvent) => {
    const gesture = gestureFor(e.pointerId);
    if (!gesture) return;
    const { moved } = gesture;
    finish();
    callbacksRef.current.onCancel?.(moved);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (disabled) return;
    // Only the primary pointer, and for a mouse only the primary button - a
    // right-click or a second finger must not start a second drag.
    if (!e.isPrimary || e.button !== 0) return;

    // A gesture still in hand at pointer down is one whose release nobody
    // heard - the one delivery hole the window listeners cannot close, a
    // release let go outside the window with no capture in force. Ignoring
    // this event would make that hole permanent: the element would drop every
    // later drag on this line for the rest of the session, and the stale
    // gesture's overlay would stay on the cursor with an outcome still owed to
    // it. So it ends here, down the path `pointercancel` takes, and the new
    // gesture starts normally underneath it.
    const stale = gestureRef.current;
    if (stale) {
      const { moved } = stale;
      finish();
      onCancel?.(moved);
    }

    const element = e.currentTarget;
    // Suppresses text selection and the browser's own drag of the icon. It also
    // suppresses the implicit focus, so focus is moved explicitly - a pointer
    // user who then reaches for the keyboard lands on the block they touched.
    // `preventScroll` matters: the grid area scrolls, and without it the act of
    // focusing nudges the block into view and the drag starts from a cell that
    // has just moved under the pointer.
    e.preventDefault();
    element.focus?.({ preventScroll: true });

    capture(element, e.pointerId);

    // The element's own window, not the ambient one: a block rendered into a
    // portal or a second document still has to end its gesture.
    const view = element.ownerDocument.defaultView ?? window;
    view.addEventListener("pointermove", handleMove);
    view.addEventListener("pointerup", handleUp);
    view.addEventListener("pointercancel", handleCancel);

    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      element,
      removeListeners: () => {
        view.removeEventListener("pointermove", handleMove);
        view.removeEventListener("pointerup", handleUp);
        view.removeEventListener("pointercancel", handleCancel);
      },
    };
    setIsActive(true);
    // Straight off the props, not through the ref: this is itself a React
    // handler, so it already holds the current render's callbacks - the same
    // way it reads `disabled`. The ref is for the window listeners, which are
    // installed once per gesture and outlive the render that installed them.
    onDown?.({ x: e.clientX, y: e.clientY }, element);
  };

  // ── The third exit ─────────────────────────────────────────────────────
  //
  // A gesture's listeners belong to the component that started it, so a
  // component that goes away mid-drag takes them with it and the release is
  // heard by nobody. That is not hypothetical: the strategy panel is keyed on
  // `strategyKey`, so the whole tree - palette included - is replaced the
  // moment an in-flight submit resolves, which is roughly a second after the
  // user clicked Execute Trade and squarely inside the next drag they start.
  // `dragOverlayStore` is module state and outlives the tree, so the ghost
  // block would be welded to the cursor for the rest of the session.
  //
  // Unmount therefore ends the gesture the same way `pointercancel` does:
  // nothing moved, and whatever pointer down opened is closed. The dependency
  // list is empty on purpose - this runs on unmount and never in between.
  useEffect(
    () => () => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      teardown(gesture);
      // No `setIsActive`: this component is going away, and the caller's
      // cancel handler is the only thing with anything left to undo.
      callbacksRef.current.onCancel?.(gesture.moved);
    },
    [],
  );

  return {
    isActive,
    handlers: {
      onPointerDown: handlePointerDown,
    },
  };
};
