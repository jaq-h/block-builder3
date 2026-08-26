import { useRef } from "react";
import type { SvgIcon } from "../data/orderTypes";
import {
  startDragOverlay,
  updateDragOverlayPosition,
  stopDragOverlay,
} from "../components/common/dragOverlayStore";
import {
  usePointerGesture,
  type PointerGestureHandlers,
} from "./usePointerGesture";

interface UseFreeDragOptions {
  id: string;
  icon?: SvgIcon;
  abrv?: string;
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  /** The pointer went down and up without moving: a tap or a click, not a drag. */
  onActivate?: (id: string) => void;
  /** The gesture has travelled far enough to be a drag rather than a tap. */
  onDragRecognised?: (id: string) => void;
  /**
   * Close the drag that pointer-down opened, without a drop. Fired for a tap
   * as well as for a `pointercancel`, so it is bookkeeping rather than an
   * outcome - see `onDragAborted` for the half a user needs to hear about.
   */
  onDragCancel?: (id: string) => void;
  /**
   * The browser took the pointer away after a real drag had begun. Nothing on
   * the grid changed, and unlike `onDragCancel` this cannot be a tap, so it is
   * the one an announcement can be hung on.
   */
  onDragAborted?: (id: string) => void;
  disabled?: boolean;
}

interface UseFreeDragReturn {
  isDragging: boolean;
  handlers: PointerGestureHandlers;
}

/**
 * Free-form drag of a block across the grid, on pointer events so that mouse,
 * touch and pen all take the same path. The gesture starts on the block and
 * ends on the window: see `usePointerGesture` for why the release is listened
 * for there rather than on the element, and for what the pointer capture is
 * and is not responsible for.
 */
export const useFreeDrag = ({
  id,
  icon,
  abrv,
  onDragStart,
  onDragEnd,
  onActivate,
  onDragCancel,
  onDragAborted,
  onDragRecognised,
  disabled = false,
}: UseFreeDragOptions): UseFreeDragReturn => {
  // Track the latest pointer position in a ref so onDragEnd can read it
  // without causing any React re-renders during the drag.
  const posRef = useRef({ x: 0, y: 0 });

  const { isActive, handlers } = usePointerGesture({
    disabled,
    onDown: ({ x, y }) => {
      posRef.current = { x, y };
      startDragOverlay(icon, abrv ?? "", x, y);
      onDragStart?.(id);
    },
    onMove: ({ x, y }) => {
      posRef.current = { x, y };
      updateDragOverlayPosition(x, y);
    },
    onDragRecognised: () => onDragRecognised?.(id),
    onUp: ({ x, y }, moved) => {
      stopDragOverlay();
      if (moved) {
        onDragEnd?.(id, x, y);
        return;
      }
      // A tap is the command model's pick-up/place gesture, not a zero-length
      // drag: close the drag that pointer-down opened, then hand over.
      onDragCancel?.(id);
      onActivate?.(id);
    },
    onCancel: (moved) => {
      stopDragOverlay();
      onDragCancel?.(id);
      if (moved) onDragAborted?.(id);
    },
  });

  return { isDragging: isActive, handlers };
};
