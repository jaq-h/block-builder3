import { useRef } from "react";
import {
  usePointerGesture,
  type PointerGestureHandlers,
} from "./usePointerGesture";

interface UseVerticalDragOptions {
  id: string;
  onVerticalDrag?: (id: string, pointerY: number) => void;
  /** The pointer went down and up without moving: a tap or a click, not a drag. */
  onActivate?: (id: string) => void;
  /** The gesture has travelled far enough to be a drag rather than a tap. */
  onDragRecognised?: (id: string) => void;
  disabled?: boolean;
}

interface UseVerticalDragReturn {
  isDragging: boolean;
  handlers: PointerGestureHandlers;
}

/**
 * Vertical drag of a placed block along its price axis - the interaction that
 * sets the order's price. On pointer events, so a finger can price an order.
 *
 * The release is listened for on the window rather than on the block, so
 * dragging past the edge of the cell still ends the drag wherever it is let
 * go. The capture the block takes on pointer down is what holds hit-testing
 * still, and what makes a release outside the window reach the page at all;
 * inside the page it is not what delivers the release. See
 * `usePointerGesture`.
 *
 * The consumer maps a pointer Y onto the axis as though it were the block's
 * centre, so the grab offset - how far from that centre the pointer actually
 * landed - is subtracted here for the whole gesture. Without it, grabbing a
 * block near its edge re-prices the order the moment it moves at all, which on
 * a finger is any tap: 20px of track before the pick-up the user asked for.
 *
 * Movement inside the tap slop is not forwarded at all, because that gesture
 * may still turn out to be a tap - a pick-up, not a re-price - and a finger
 * rarely holds perfectly still. Nothing is lost by waiting: the mapping is
 * absolute rather than incremental, so the move that crosses the threshold
 * carries the whole travel and the block is still positioned by the point it
 * was grabbed at.
 */
export const useVerticalDrag = ({
  id,
  onVerticalDrag,
  onActivate,
  onDragRecognised,
  disabled = false,
}: UseVerticalDragOptions): UseVerticalDragReturn => {
  // A ref, because the offset has to be readable by the very next pointermove,
  // before any render triggered by the gesture becoming active.
  const grabOffsetRef = useRef(0);

  const { isActive, handlers } = usePointerGesture({
    disabled,
    onDown: ({ y }, element) => {
      const rect = element.getBoundingClientRect();
      grabOffsetRef.current = y - (rect.top + rect.height / 2);
    },
    onMove: ({ y }, moved) => {
      if (!moved) return;
      onVerticalDrag?.(id, y - grabOffsetRef.current);
    },
    onDragRecognised: () => onDragRecognised?.(id),
    onUp: (_point, moved) => {
      if (!moved) onActivate?.(id);
    },
  });

  return { isDragging: isActive, handlers };
};
