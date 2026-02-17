import { createContext, useContext } from "react";
import type { GridDataContextType } from "../../../../types/strategyAssembly";

export const GridDataContext = createContext<GridDataContextType | null>(null);

export function useGridData(): GridDataContextType {
  const context = useContext(GridDataContext);
  if (!context) {
    throw new Error("useGridData must be used within StrategyAssemblyProvider");
  }
  return context;
}
