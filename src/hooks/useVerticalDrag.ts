import { useState, useEffect, useCallback } from "react";

interface UseVerticalDragOptions {
  id: string;
  onVerticalDrag?: (id: string, mouseY: number) => void;
}

interface UseVerticalDragReturn {
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
}

export const useVerticalDrag = ({
  id,
  onVerticalDrag,
}: UseVerticalDragOptions): UseVerticalDragReturn => {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      onVerticalDrag?.(id, e.clientY);
    },
    [isDragging, id, onVerticalDrag],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
  }, [isDragging]);

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
