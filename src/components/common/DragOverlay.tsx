import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { subscribe, getSnapshot, pos } from "./dragOverlayStore";
import { BLOCK_TILE_SHAPE } from "../blocks/blockTile";
import { BLOCK_HEIGHT } from "../../styles/grid";
import { cn } from "../../lib/utils";

// =============================================================================
// DRAG OVERLAY COMPONENT - rendered via Portal, completely outside #root tree
// =============================================================================

// The ghost is centred on the pointer, and `src/utils/dropTarget.ts` hit-tests
// it there. Both take the tile's size from its one owner rather than from a
// literal of their own, so what the user sees over a cell and what the drop
// resolves to are the same rectangle.
const HALF_BLOCK = BLOCK_HEIGHT / 2;

const DragOverlay: React.FC = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const nodeRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // When active, run a rAF loop that stamps the element's transform directly.
  // This completely bypasses React reconciliation for position updates.
  useEffect(() => {
    if (!state.active) return;

    let running = true;

    const loop = () => {
      if (!running) return;
      const el = nodeRef.current;
      if (el) {
        el.style.transform = `translate(${pos.x - HALF_BLOCK}px, ${pos.y - HALF_BLOCK}px)`;
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    // Kick off immediately so the overlay appears at the right spot
    loop();

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [state.active]);

  // Also wire up a direct pointermove -> pos mutation so the rAF loop always
  // has fresh coordinates.  Pointer events rather than mouse events, so the
  // overlay follows a finger as well as a cursor.  This listener lives on
  // `window` so it captures moves even when the pointer is over elements with
  // pointer-events: none.
  useEffect(() => {
    if (!state.active) return;

    const onMove = (e: PointerEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
    };

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [state.active]);

  const portalTarget = document.getElementById("drag-overlay");
  if (!portalTarget || !state.active) return null;

  const IconComponent = state.icon;

  return createPortal(
    <div
      ref={nodeRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 10000,
        pointerEvents: "none",
        willChange: "transform",
        // Start at the initial position immediately
        transform: `translate(${pos.x - HALF_BLOCK}px, ${pos.y - HALF_BLOCK}px)`,
      }}
    >
      {/* The block tile, drawn at the cursor. Its shape comes from
          `BLOCK_TILE_SHAPE`, the one owner of those measurements, and only the
          colour is stated here - deliberately, and deliberately not the tile's.
          A block in flight is a state, and `buttonVariants` in
          `src/components/blocks/block.tsx` is the authority for that split: the
          resting tile keeps a quiet accent tint precisely so the saturated end
          of the scale is free to mean something, and a ghost on the cursor is
          one of the things it means. The two colours must not be reconciled. */}
      <div
        className={cn(
          BLOCK_TILE_SHAPE,
          "bg-accent-primary opacity-100 border-transparent",
        )}
      >
        {IconComponent ? (
          <IconComponent width={20} height={20} />
        ) : (
          <span>{state.abrv}</span>
        )}
      </div>
    </div>,
    portalTarget,
  );
};

export default DragOverlay;
