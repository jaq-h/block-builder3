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

/**
 * Every ghost that is still live, oldest first. The one on the cursor is the
 * newest of them, and that single rule is the whole answer to "whose ghost is
 * this" - in both directions.
 *
 * There are two things that put a ghost up and they overlap by design: a
 * pointer drag, and a mouse carry between the click that picks a block up and
 * the click that puts it down. Either can start while the other is live, and
 * either can end first, so neither is entitled to clear "the" overlay:
 *
 *  - A drag begun on the very block being carried starts its ghost before the
 *    carry it supersedes ends. The carry's ghost is then underneath, and
 *    removing it changes nothing on screen.
 *  - A click that lands on some other block runs a whole gesture - down, up -
 *    inside a carry that outlives it. That gesture's ghost is on top for the
 *    length of the press, and taking it off has to uncover the carry's again
 *    rather than leave the cursor empty.
 *
 * A holder therefore stops by its own handle and gets exactly its own ghost
 * taken away. A handle-less `stopDragOverlay()` empties the stack, which is
 * what `GridArea`'s dismissal hatch means: it is putting down everything that
 * is in hand, whoever holds it.
 *
 * **What this does not do:** it does not notice a holder that goes away without
 * stopping its ghost. A handle nobody stops stays in the stack, and while it is
 * the newest one it stays on the cursor. Ending a hold is the holder's own job -
 * see `usePointerGesture`'s exits and `hooks/blockInHand.ts`.
 */
interface LiveGhost {
  handle: DragOverlayHandle;
  state: DragOverlayState;
}

let ghosts: LiveGhost[] = [];
let nextHandle = 0;
const listeners = new Set<() => void>();

/** Identifies one ghost. Compared, never inspected. */
export type DragOverlayHandle = number;

/** Mutable position ref - updated on every pointermove, read by rAF loop. */
export const pos = { x: 0, y: 0 };

function emitChange() {
  for (const fn of listeners) fn();
}

/** The ghost drawn on the cursor: the newest live one, or none at all. */
function visibleState(): DragOverlayState {
  return ghosts.length > 0 ? ghosts[ghosts.length - 1].state : INACTIVE_STATE;
}

// ── Public API (called from useFreeDrag, from the mouse carry in GridArea,
//    and from GridArea's outside-click escape hatch) ─────────────────────────

export function startDragOverlay(
  icon: SvgIcon | undefined,
  abrv: string,
  clientX: number,
  clientY: number,
): DragOverlayHandle {
  pos.x = clientX;
  pos.y = clientY;
  nextHandle += 1;
  ghosts.push({ handle: nextHandle, state: { active: true, icon, abrv } });
  emitChange(); // single render: overlay appears
  return nextHandle;
}

export function updateDragOverlayPosition(clientX: number, clientY: number) {
  // Pure mutation — no React involved
  pos.x = clientX;
  pos.y = clientY;
}

export function stopDragOverlay(handle?: DragOverlayHandle) {
  // Idempotent, because the escape hatch calls it on every click that lands
  // outside the placement surface without first asking whether there is a ghost
  // to clear - and an emit with nothing to say is a render for every such click.
  if (ghosts.length === 0) return;

  if (handle === undefined) {
    ghosts = [];
    emitChange(); // single render: overlay disappears
    return;
  }

  const index = ghosts.findIndex((ghost) => ghost.handle === handle);
  // A handle that is not in the stack belongs to a ghost that has already been
  // taken off, so it has nothing left to clear.
  if (index === -1) return;
  const wasOnScreen = index === ghosts.length - 1;
  ghosts.splice(index, 1);
  // Removing a ghost from underneath the visible one changes nothing that is
  // drawn, and an emit there is a render nobody asked for.
  if (wasOnScreen) emitChange();
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
  return visibleState();
}
