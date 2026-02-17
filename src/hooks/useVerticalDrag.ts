import { useState, useEffect } from "react";

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

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    onVerticalDrag?.(id, e.clientY);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  });

  return { isDragging, handleMouseDown };
};
