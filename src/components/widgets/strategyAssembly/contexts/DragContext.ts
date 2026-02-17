import { createContext, useContext } from "react";
import type { DragContextType } from "../../../../types/strategyAssembly";

export const DragContext = createContext<DragContextType | null>(null);

export function useDrag(): DragContextType {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error("useDrag must be used within StrategyAssemblyProvider");
  }
  return context;
}
