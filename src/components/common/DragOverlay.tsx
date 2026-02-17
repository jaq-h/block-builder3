import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { subscribe, getSnapshot, pos } from "./dragOverlayStore";

// =============================================================================
// DRAG OVERLAY COMPONENT — rendered via Portal, completely outside #root tree
// =============================================================================

const HALF_BLOCK = 20; // half of the 40×40 block size

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

  // Also wire up a direct mousemove → pos mutation so the rAF loop always
  // has fresh coordinates.  This listener lives on `window` so it captures
  // moves even when the pointer is over elements with pointer-events: none.
  useEffect(() => {
    if (!state.active) return;

    const onMove = (e: MouseEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
    };

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
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
      {/* Visual clone of Block — matches the buttonVariants styling */}
      <div
        className={[
          "w-10 h-10 flex flex-col justify-center items-center p-0.75",
          "border-2 rounded-md select-none",
          "text-text-primary",
          "[&_svg]:w-5 [&_svg]:h-5 [&_svg]:stroke-current [&_svg]:pointer-events-none",
          "bg-accent-primary opacity-100 border-transparent",
        ].join(" ")}
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
