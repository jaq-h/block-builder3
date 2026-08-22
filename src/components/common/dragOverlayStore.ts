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

/** Mutable position ref - updated on every pointermove, read by rAF loop. */
export const pos = { x: 0, y: 0 };

function emitChange() {
  for (const fn of listeners) fn();
}

// ── Public API (called from useFreeDrag) ───────────────────────────────────

export function startDragOverlay(
  icon: SvgIcon | undefined,
  abrv: string,
  clientX: number,
  clientY: number,
) {
  pos.x = clientX;
  pos.y = clientY;
  currentState = { active: true, icon, abrv };
  emitChange(); // single render: overlay appears
}

export function updateDragOverlayPosition(clientX: number, clientY: number) {
  // Pure mutation — no React involved
  pos.x = clientX;
  pos.y = clientY;
}

export function stopDragOverlay() {
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
