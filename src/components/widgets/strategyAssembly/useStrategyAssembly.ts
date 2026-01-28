import { createContext, useContext } from "react";
import type { StrategyAssemblyContextType } from "../../../types/strategyAssembly";

// Create context with null default
export const StrategyAssemblyContext =
  createContext<StrategyAssemblyContextType | null>(null);

// Hook to use the context
export function useStrategyAssembly(): StrategyAssemblyContextType {
  const context = useContext(StrategyAssemblyContext);
  if (!context) {
    throw new Error(
      "useStrategyAssembly must be used within StrategyAssemblyProvider",
    );
  }
  return context;
}
