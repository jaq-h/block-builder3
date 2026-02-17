import { createContext, useContext } from "react";
import type { StaticContextType } from "../../../../types/strategyAssembly";

export const StaticContext = createContext<StaticContextType | null>(null);

export function useStatic(): StaticContextType {
  const context = useContext(StaticContext);
  if (!context) {
    throw new Error("useStatic must be used within StrategyAssemblyProvider");
  }
  return context;
}
