import { useContext } from "react";
import type { ActiveOrdersContextType } from "../../../types/activeOrders";
import { ActiveOrdersContext } from "./ActiveOrdersContextDef";

export const useActiveOrders = (): ActiveOrdersContextType => {
  const context = useContext(ActiveOrdersContext);
  if (!context) {
    throw new Error(
      "useActiveOrders must be used within an ActiveOrdersProvider",
    );
  }
  return context;
};
