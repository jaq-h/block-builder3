import { createContext } from "react";
import type { ActiveOrdersContextType } from "../../../types/activeOrders";

// =============================================================================
// CONTEXT CREATION
// =============================================================================

export const ActiveOrdersContext =
  createContext<ActiveOrdersContextType | null>(null);
