import { useState, useEffect, useCallback, useRef } from "react";
import type { SvgIcon } from "../data/orderTypes";
import {
  startDragOverlay,
  updateDragOverlayPosition,
  stopDragOverlay,
} from "../components/common/dragOverlayStore";

interface UseFreeDragOptions {
  id: string;
  icon?: SvgIcon;
  abrv?: string;
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
}

interface UseFreeDragReturn {
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
}

export const useFreeDrag = ({
  id,
  icon,
  abrv,
  onDragStart,
  onDragEnd,
}: UseFreeDragOptions): UseFreeDragReturn => {
  const [isDragging, setIsDragging] = useState(false);

  // Track the latest mouse position in a ref so onDragEnd can read it
  // without causing any React re-renders during the drag.
  const posRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      posRef.current = { x: e.clientX, y: e.clientY };
      setIsDragging(true);
      startDragOverlay(icon, abrv ?? "", e.clientX, e.clientY);
      onDragStart?.(id);
    },
    [id, icon, abrv, onDragStart],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      posRef.current = { x: e.clientX, y: e.clientY };
      updateDragOverlayPosition(e.clientX, e.clientY);
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      setIsDragging(false);
      stopDragOverlay();
      onDragEnd?.(id, e.clientX, e.clientY);
    },
    [isDragging, id, onDragEnd],
  );

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return { isDragging, handleMouseDown };
};
