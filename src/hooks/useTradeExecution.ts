import { useState } from "react";
import type { OrderConfig } from "../types/grid";
import { useOrdersStore } from "../store";
import { useTradingMode } from "./useTradingMode";

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
  /** Key that increments on successful submit - used to force-reset StrategyAssembly */
  strategyKey: number;
  /** Initial config to seed StrategyAssembly with (e.g. loaded from active orders) */
  initialConfig: OrderConfig | undefined;
  /** Whether we're currently editing a previously submitted order config */
  isEditMode: boolean;
  /** Whether orders are currently being submitted */
  isSubmitting: boolean;
  /** Current error message, if any */
  error: string | null;
  /** Whether simulation mode is active */
  isSimulationMode: boolean;
  /** Whether this deployment's server will sign real Kraken requests */
  isLiveAvailable: boolean;
  /** Whether the user is allowed to toggle between simulation and API mode */
  canToggle: boolean;
  /** Toggle simulation mode on/off */
  toggleSimulationMode: () => void;
  /** Called by StrategyAssembly when the config changes */
  handleConfigChange: (config: OrderConfig) => void;
  /** Submit the current order config */
  handleExecuteTrade: () => Promise<void>;
  /** Load an existing config into the StrategyAssembly */
  loadConfig: (config: OrderConfig) => void;
  /** Human-readable simulation/environment message */
  simulationMessage: string;
  /** Whether we're effectively in simulation (always, unless the server is live and the toggle is off) */
  isEffectivelySimulation: boolean;
}

// =============================================================================
// HOOK
// =============================================================================

export function useTradeExecution(): UseTradeExecutionReturn {
  const [orderConfig, setOrderConfig] = useState<OrderConfig>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [strategyKey, setStrategyKey] = useState(0);
  const [initialConfig, setInitialConfig] = useState<OrderConfig | undefined>(undefined);
  const [isEditMode, setIsEditMode] = useState(false);

  const {
    submitOrders,
    isSubmitting,
    error,
    clearError,
    isSimulationMode,
    toggleSimulationMode,
  } = useOrdersStore();

  // Whether real orders are possible is the server's answer, not the browser's.
  // A build has no credential in it, so `import.meta.env.DEV` no longer tells us
  // anything about what this deployment can do.
  const { liveAvailable: isLiveAvailable } = useTradingMode();

  // ─── Derived state ──────────────────────────────────────────────────
  //
  // server simulation/misconfigured → always simulation, no toggle
  // server live                     → toggle allowed, default simulation
  //
  const canToggle = isLiveAvailable;

  // Without a signing server there is nothing the toggle could switch to.
  const isEffectivelySimulation = !isLiveAvailable || isSimulationMode;

  const orderCount = Object.keys(orderConfig).length;

  // Determine what message to show based on environment and simulation mode
  const simulationMessage = !isLiveAvailable
    ? "Simulation Mode - Orders saved locally"
    : isSimulationMode
      ? "Simulation Mode - Orders saved locally (live trading available)"
      : "Live API Mode - Orders sent to Kraken";

  const handleConfigChange = (config: OrderConfig) => {
    setOrderConfig(config);
    // Clear any previous success message when config changes
    setShowSuccess(false);
    clearError();
  };

  const loadConfig = (config: OrderConfig) => {
    setInitialConfig(config);
    setIsEditMode(true);
    setOrderConfig({});
    setShowSuccess(false);
    clearError();
    setStrategyKey((prev) => prev + 1);
  };

  const handleExecuteTrade = async () => {
    if (Object.keys(orderConfig).length === 0) return;

    const success = await submitOrders(orderConfig);

    if (success) {
      setShowSuccess(true);
      setIsEditMode(false);
      setInitialConfig(undefined);
      setOrderConfig({});
      setStrategyKey((prev) => prev + 1);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  return {
    orderConfig,
    orderCount,
    showSuccess,
    strategyKey,
    initialConfig,
    isEditMode,
    isSubmitting,
    error,
    isSimulationMode,
    isLiveAvailable,
    canToggle,
    toggleSimulationMode,
    handleConfigChange,
    handleExecuteTrade,
    loadConfig,
    simulationMessage,
    isEffectivelySimulation,
  };
}
