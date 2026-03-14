import type { FC } from "react";
import type { OrderConfig, StrategyPattern } from "../../../types/grid";
import { useKrakenAPI } from "../../../hooks";
import { StrategyAssemblyProvider } from "./StrategyAssemblyContext";
import {
  PatternSelector,
  GridArea,
  UtilityButtons,
  ExecuteTradePanel,
} from "./components";
import { container } from "./strategyAssembly.styles";

interface StrategyAssemblyProps {
  onConfigChange?: (config: OrderConfig) => void;
  initialConfig?: OrderConfig;
  initialPattern?: StrategyPattern;
  orderCount?: number;
  onExecute?: () => void;
  isSubmitting?: boolean;
  showSuccess?: boolean;
  error?: string | null;
  simulationMessage?: string;
  isEffectivelySimulation?: boolean;
  canToggle?: boolean;
  isSimulationMode?: boolean;
  onToggleSimulationMode?: () => void;
  isEditMode?: boolean;
}

const StrategyAssembly: FC<StrategyAssemblyProps> = ({
  onConfigChange,
  initialConfig,
  initialPattern,
  ...executeProps
}) => {
  return (
    <StrategyAssemblyProvider
      onConfigChange={onConfigChange}
      initialConfig={initialConfig}
      initialPattern={initialPattern}
    >
      <StrategyAssemblyInner {...executeProps} />
    </StrategyAssemblyProvider>
  );
};

type InnerProps = Omit<StrategyAssemblyProps, "onConfigChange" | "initialConfig" | "initialPattern">;

/**
 * StrategyAssemblyInner — thin shell that composes extracted sub-components.
 *
 * Each child subscribes only to the specific context(s) it needs:
 *   - PatternSelector  → GridDataContext only (strategyPattern)
 *   - GridArea          → all 4 contexts (orchestrates drag/drop interactions)
 *   - UtilityButtons    → GridDataContext + execute button props
 *   - ExecuteTradePanel → receives props directly (simulation badge + feedback)
 */
const StrategyAssemblyInner: FC<InnerProps> = ({
  orderCount,
  onExecute,
  isSubmitting,
  showSuccess,
  error,
  simulationMessage,
  isEffectivelySimulation,
  canToggle,
  isSimulationMode,
  onToggleSimulationMode,
  isEditMode,
}) => {
  const { currentPrice, tickerError } = useKrakenAPI({
    symbol: "BTC/USD",
    autoConnect: true,
    pollInterval: 30000,
  });

  const showFeedback = orderCount != null && orderCount > 0;

  return (
    <div className={container}>
      <PatternSelector />
      <GridArea currentPrice={currentPrice} tickerError={tickerError} />
      <UtilityButtons
        orderCount={orderCount}
        onExecute={onExecute}
        isSubmitting={isSubmitting}
        isEditMode={isEditMode}
      />
      {showFeedback && onToggleSimulationMode && (
        <ExecuteTradePanel
          showSuccess={showSuccess ?? false}
          error={error ?? null}
          simulationMessage={simulationMessage ?? ""}
          isEffectivelySimulation={isEffectivelySimulation ?? true}
          canToggle={canToggle ?? false}
          isSimulationMode={isSimulationMode ?? true}
          onToggleSimulationMode={onToggleSimulationMode}
        />
      )}
    </div>
  );
};

export default StrategyAssembly;
