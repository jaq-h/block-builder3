import type { SvgIcon } from "../../data/orderTypes";

// =============================================================================
// MODULE-LEVEL STORE — position lives in a plain object, never triggers renders
// =============================================================================

export interface DragOverlayState {
  active: boolean;
  icon?: SvgIcon;
  abrv: string;
}

const INACTIVE_STATE: DragOverlayState = Object.freeze({
  active: false,
  icon: undefined,
  abrv: "",
});

let currentState: DragOverlayState = INACTIVE_STATE;
const listeners = new Set<() => void>();

/**
 * Which ghost is on the cursor. Every `startDragOverlay` takes the next number
 * and hands it back, and `stopDragOverlay(handle)` clears the ghost only while
 * that handle is still the current one.
 *
 * It exists because there are now two things that put a ghost up and they
 * overlap by design: a pointer drag, and a mouse carry between a click that
 * picks a block up and the click that puts it down. Dragging the very block
 * being carried starts the drag's ghost first and ends the carry second, so a
 * carry that cleared "the" overlay on its way out would wipe the ghost of the
 * gesture that superseded it and leave a live drag invisible. A handle-less
 * `stopDragOverlay()` still clears whatever is there, which is what a gesture
 * ending and what the dismissal hatch both want.
 */
let currentHandle = 0;

/** Identifies one ghost. Compared, never inspected. */
export type DragOverlayHandle = number;

/** Mutable position ref - updated on every pointermove, read by rAF loop. */
export const pos = { x: 0, y: 0 };

function emitChange() {
  for (const fn of listeners) fn();
}

// ── Public API (called from useFreeDrag, and from GridArea's outside-click
//    escape hatch, which stops an overlay whose gesture lost its owner) ──────

export function startDragOverlay(
  icon: SvgIcon | undefined,
  abrv: string,
  clientX: number,
  clientY: number,
): DragOverlayHandle {
  pos.x = clientX;
  pos.y = clientY;
  currentState = { active: true, icon, abrv };
  currentHandle += 1;
  emitChange(); // single render: overlay appears
  return currentHandle;
}

export function updateDragOverlayPosition(clientX: number, clientY: number) {
  // Pure mutation — no React involved
  pos.x = clientX;
  pos.y = clientY;
}

export function stopDragOverlay(handle?: DragOverlayHandle) {
  // A handle that is no longer the current one belongs to a ghost something
  // else has already replaced, so it has nothing left to clear.
  if (handle !== undefined && handle !== currentHandle) return;
  // Idempotent, because the escape hatch calls it on every click that lands
  // outside the placement surface without first asking whether there is a ghost
  // to clear - and an emit with nothing to say is a render for every such click.
  if (currentState === INACTIVE_STATE) return;
  currentState = INACTIVE_STATE;
  emitChange(); // single render: overlay disappears
}

/** Read the latest mouse position (non-reactive, for onDragEnd callbacks). */
export function getDragOverlayPosition() {
  return { x: pos.x, y: pos.y };
}

// ── useSyncExternalStore glue ──────────────────────────────────────────────

export function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getSnapshot(): DragOverlayState {
  return currentState;
}
