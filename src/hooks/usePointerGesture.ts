import { useRef, useState } from "react";

// =============================================================================
// POINTER GESTURE PRIMITIVE
// =============================================================================
//
// One code path for mouse, touch and pen. Both drag hooks build on this, so a
// finger, a stylus and a mouse produce exactly the same callbacks.
//
// Two things here are load-bearing:
//
//  - `setPointerCapture` retargets every subsequent move/up for this pointer to
//    the element the gesture started on. That is what makes a release *outside
//    the browser window* still deliver `pointerup`, which the old
//    `window.addEventListener("mouseup")` implementation never received - the
//    block then stayed glued to the cursor.
//  - the elements carry `touch-action: none` (see `blockVariants`), without
//    which the browser claims a finger drag for page scrolling before the
//    first `pointermove` ever reaches us.
//
// Because capture retargets the events, the listeners live on the element as
// ordinary React props rather than on `window`.

/** A pointer that never moved further than this is a tap, not a drag. */
export const TAP_SLOP_PX = 4;

export interface GesturePoint {
  x: number;
  y: number;
}

export interface UsePointerGestureOptions {
  /** Fired on pointer down, before it is known whether this is a tap or a drag. */
  onDown?: (point: GesturePoint) => void;
  /** Fired for every move of the captured pointer. */
  onMove?: (point: GesturePoint) => void;
  /**
   * Fired on release. `moved` is false when the pointer never travelled beyond
   * `TAP_SLOP_PX`, i.e. this was a tap or a click rather than a drag.
   */
  onUp?: (point: GesturePoint, moved: boolean) => void;
  /** Fired when the browser takes the pointer away (`pointercancel`). */
  onCancel?: () => void;
  /** When true, no gesture starts at all. */
  disabled?: boolean;
}

export interface PointerGestureHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
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
}

/** jsdom has no pointer capture, and a detached element throws. Neither is fatal. */
const capture = (element: HTMLElement, pointerId: number): void => {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // Capture is an optimisation for events outside the element, not a
    // precondition for the gesture itself.
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
  onUp,
  onCancel,
  disabled = false,
}: UsePointerGestureOptions): UsePointerGestureReturn => {
  const [isActive, setIsActive] = useState(false);

  // The gesture lives in a ref so move handling never depends on a rendered
  // value: a drag must keep working during the render that `isActive` triggers.
  const gestureRef = useRef<ActiveGesture | null>(null);

  const finish = (): ActiveGesture | null => {
    const gesture = gestureRef.current;
    if (!gesture) return null;
    releaseCapture(gesture.element, gesture.pointerId);
    gestureRef.current = null;
    setIsActive(false);
    return gesture;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (disabled) return;
    // Only the primary pointer, and for a mouse only the primary button - a
    // right-click or a second finger must not start a second drag.
    if (!e.isPrimary || e.button !== 0) return;
    if (gestureRef.current) return;

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
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      element,
    };
    setIsActive(true);
    onDown?.({ x: e.clientX, y: e.clientY });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;

    if (!gesture.moved) {
      const dx = e.clientX - gesture.startX;
      const dy = e.clientY - gesture.startY;
      if (Math.hypot(dx, dy) > TAP_SLOP_PX) gesture.moved = true;
    }
    onMove?.({ x: e.clientX, y: e.clientY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    finish();
    onUp?.({ x: e.clientX, y: e.clientY }, gesture.moved);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    finish();
    onCancel?.();
  };

  return {
    isActive,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
  };
};
