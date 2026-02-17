import { createContext, useContext } from "react";
import type { HoverContextType } from "../../../../types/strategyAssembly";

export const HoverContext = createContext<HoverContextType | null>(null);

export function useHover(): HoverContextType {
  const context = useContext(HoverContext);
  if (!context) {
    throw new Error("useHover must be used within StrategyAssemblyProvider");
  }
  return context;
}
