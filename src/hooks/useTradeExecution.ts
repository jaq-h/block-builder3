import { useState, useCallback } from "react";
import type { OrderConfig } from "../types/grid";
import { useOrdersStore } from "../store";

// =============================================================================
// TYPES
// =============================================================================

export interface UseTradeExecutionReturn {
  /** Current order configuration from the strategy assembly */
  orderConfig: OrderConfig;
  /** Number of orders in the current config */
  orderCount: number;
  /** Whether a success message should be displayed */
  showSuccess: boolean;
  /** Key that increments on successful submit — used to force-reset StrategyAssembly */
  strategyKey: number;
  /** Whether orders are currently being submitted */
  isSubmitting: boolean;
  /** Current error message, if any */
  error: string | null;
  /** Whether simulation mode is active (or forced by dev environment) */
  isSimulationMode: boolean;
  /** Whether the app is running in development mode */
  isDev: boolean;
  /** Toggle simulation mode on/off */
  toggleSimulationMode: () => void;
  /** Called by StrategyAssembly when the config changes */
  handleConfigChange: (config: OrderConfig) => void;
  /** Submit the current order config */
  handleExecuteTrade: () => Promise<void>;
  /** Human-readable simulation/environment message */
  simulationMessage: string;
  /** Whether we're effectively in simulation (dev OR simulation toggle) */
  isEffectivelySimulation: boolean;
}

// =============================================================================
// HOOK
// =============================================================================

export function useTradeExecution(): UseTradeExecutionReturn {
  const [orderConfig, setOrderConfig] = useState<OrderConfig>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [strategyKey, setStrategyKey] = useState(0);

  const {
    submitOrders,
    isSubmitting,
    error,
    clearError,
    isSimulationMode,
    toggleSimulationMode,
  } = useOrdersStore();

  const isDev = import.meta.env.DEV;
  const isEffectivelySimulation = isDev || isSimulationMode;

  const orderCount = Object.keys(orderConfig).length;

  // Determine what message to show based on environment and simulation mode
  const simulationMessage = isDev
    ? "Development Mode - Orders saved locally"
    : isSimulationMode
      ? "Simulation Mode - Orders saved locally"
      : "Production Mode - Orders sent to API";

  const handleConfigChange = useCallback(
    (config: OrderConfig) => {
      setOrderConfig(config);
      // Clear any previous success message when config changes
      setShowSuccess(false);
      clearError();
    },
    [clearError],
  );

  const handleExecuteTrade = useCallback(async () => {
    if (Object.keys(orderConfig).length === 0) return;

    const success = await submitOrders(orderConfig);

    if (success) {
      setShowSuccess(true);
      // Clear the strategy assembly after successful submission
      setOrderConfig({});
      // Increment key to force StrategyAssembly to reset
      setStrategyKey((prev) => prev + 1);
      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
    }
  }, [orderConfig, submitOrders]);

  return {
    orderConfig,
    orderCount,
    showSuccess,
    strategyKey,
    isSubmitting,
    error,
    isSimulationMode,
    isDev,
    toggleSimulationMode,
    handleConfigChange,
    handleExecuteTrade,
    simulationMessage,
    isEffectivelySimulation,
  };
}
