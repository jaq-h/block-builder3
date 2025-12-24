import { useState, useEffect, useCallback } from "react";

interface UseDraggableOptions {
  id: string;
  isVerticallyDraggable: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onVerticalDrag?: (id: string, mouseY: number) => void;
}

interface UseDraggableReturn {
  isDragging: boolean;
  isVerticalOnly: boolean;
  position: { x: number; y: number };
  handleMouseDown: (e: React.MouseEvent) => void;
}

export const useDraggable = ({
  id,
  isVerticallyDraggable,
  onDragStart,
  onDragEnd,
  onVerticalDrag,
}: UseDraggableOptions): UseDraggableReturn => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVerticalOnly, setIsVerticalOnly] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsVerticalOnly(isVerticallyDraggable);
      setIsDragging(true);

      if (!isVerticallyDraggable) {
        setPosition({ x: e.clientX, y: e.clientY });
        onDragStart?.(id);
      }
    },
    [id, isVerticallyDraggable, onDragStart],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      if (isVerticalOnly) {
        onVerticalDrag?.(id, e.clientY);
      } else {
        setPosition({ x: e.clientX, y: e.clientY });
      }
    },
    [isDragging, isVerticalOnly, id, onVerticalDrag],
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        setIsDragging(false);
        setIsVerticalOnly(false);
        if (!isVerticalOnly) {
          onDragEnd?.(id, e.clientX, e.clientY);
        }
      }
    },
    [isDragging, isVerticalOnly, id, onDragEnd],
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

  return { isDragging, isVerticalOnly, position, handleMouseDown };
};
