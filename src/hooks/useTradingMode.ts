/**
 * Subscribes the UI to the server's trading-mode answer.
 *
 * The store behind it lives outside React (`src/api/tradingMode.ts`) because
 * the WebSocket manager and the orders store need the same answer without a
 * component in scope. `useSyncExternalStore` is what keeps the two views of it
 * from drifting.
 */

import { useEffect, useSyncExternalStore } from "react";
import {
  getTradingModeStatus,
  loadTradingMode,
  subscribeTradingMode,
  type TradingModeStatus,
} from "../api";

export const useTradingMode = (): TradingModeStatus => {
  useEffect(() => {
    // Idempotent: the first caller performs the request, later ones get the
    // answer it cached.
    void loadTradingMode();
  }, []);

  return useSyncExternalStore(
    subscribeTradingMode,
    getTradingModeStatus,
    getTradingModeStatus,
  );
};

export default useTradingMode;
