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
 */
export const useVerticalDrag = ({
  id,
  onVerticalDrag,
  onActivate,
  disabled = false,
}: UseVerticalDragOptions): UseVerticalDragReturn => {
  const { isActive, handlers } = usePointerGesture({
    disabled,
    onMove: ({ y }) => onVerticalDrag?.(id, y),
    onUp: (_point, moved) => {
      if (!moved) onActivate?.(id);
    },
  });

  return { isDragging: isActive, handlers };
};
