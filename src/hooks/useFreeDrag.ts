import { useRef } from "react";
import type { SvgIcon } from "../data/orderTypes";
import {
  startDragOverlay,
  updateDragOverlayPosition,
  stopDragOverlay,
  type DragOverlayHandle,
} from "../components/common/dragOverlayStore";
import {
  usePointerGesture,
  type PointerGestureHandlers,
} from "./usePointerGesture";
import {
  originForPointerType,
  type ActivationOrigin,
} from "../utils/blockCommand";

interface UseFreeDragOptions {
  id: string;
  icon?: SvgIcon;
  abrv?: string;
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  /**
   * The pointer went down and up without moving: a click or a tap, not a drag.
   * `origin` names the device, because what a carry started this way looks
   * like and is described as differs between a mouse and a finger.
   */
  onActivate?: (id: string, origin: ActivationOrigin) => void;
  /** The gesture has travelled far enough to be a drag rather than a tap. */
  onDragRecognised?: (id: string) => void;
  /**
   * Close the drag that pointer-down opened, without a drop. Fired for a tap
   * as well as for every way a gesture ends without a release, so it is
   * bookkeeping rather than an outcome - see `onDragAborted` for the half a
   * user needs to hear about.
   */
  onDragCancel?: (id: string) => void;
  /**
   * A real drag ended with no release to resolve - the browser took the
   * pointer away, the block went away, or the release reached nobody; see
   * `usePointerGesture`'s `onCancel`. Nothing on the grid changed, and unlike
   * `onDragCancel` this cannot be a tap, so it is the one an announcement can
   * be hung on.
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

  // This gesture's own ghost, so it can take that one off the cursor and
  // nothing else. A press that lands on a block while a mouse carry is live
  // runs a whole gesture inside that carry - the carry's ghost is older and
  // still owns the cursor once the press is over - so a handle-less stop here
  // would empty the cursor for the rest of the carry. See `dragOverlayStore`.
  const overlayHandleRef = useRef<DragOverlayHandle | null>(null);

  const stopOwnOverlay = () => {
    const handle = overlayHandleRef.current;
    overlayHandleRef.current = null;
    if (handle !== null) stopDragOverlay(handle);
  };

  const { isActive, handlers } = usePointerGesture({
    disabled,
    onDown: ({ x, y }) => {
      posRef.current = { x, y };
      overlayHandleRef.current = startDragOverlay(icon, abrv ?? "", x, y);
      onDragStart?.(id);
    },
    onMove: ({ x, y }) => {
      posRef.current = { x, y };
      updateDragOverlayPosition(x, y);
    },
    onDragRecognised: () => onDragRecognised?.(id),
    onUp: ({ x, y }, moved, pointerType) => {
      stopOwnOverlay();
      if (moved) {
        onDragEnd?.(id, x, y);
        return;
      }
      // A click or a tap is the command model's pick-up/place gesture, not a
      // zero-length drag: close the drag that pointer-down opened, then hand
      // over. Only this gesture's own ghost comes off - a carry that was
      // already live keeps the cursor, and a carry this click is about to start
      // puts up its own.
      onDragCancel?.(id);
      onActivate?.(id, originForPointerType(pointerType));
    },
    onCancel: (moved) => {
      stopOwnOverlay();
      onDragCancel?.(id);
      if (moved) onDragAborted?.(id);
    },
  });

  return { isDragging: isActive, handlers };
};
