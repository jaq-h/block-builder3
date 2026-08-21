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
 * The block is captured on pointer down, so dragging past the edge of the cell,
 * or off the window entirely, still ends the drag on release.
 *
 * The consumer maps a pointer Y onto the axis as though it were the block's
 * centre, so the grab offset - how far from that centre the pointer actually
 * landed - is subtracted here for the whole gesture. Without it, grabbing a
 * block near its edge re-prices the order the moment it moves at all, which on
 * a finger is any tap: 20px of track before the pick-up the user asked for.
 */
export const useVerticalDrag = ({
  id,
  onVerticalDrag,
  onActivate,
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
    onMove: ({ y }) => onVerticalDrag?.(id, y - grabOffsetRef.current),
    onUp: (_point, moved) => {
      if (!moved) onActivate?.(id);
    },
  });

  return { isDragging: isActive, handlers };
};
