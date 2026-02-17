import type { FC } from "react";
import type { OrderConfig, StrategyPattern } from "../../../types/grid";
import { useKrakenAPI } from "../../../hooks";
import { StrategyAssemblyProvider } from "./StrategyAssemblyContext";
import {
  PatternSelector,
  GridArea,
  UtilityButtons,
  DebugPanel,
} from "./components";
import { container, header, headerTextClass } from "./strategyAssembly.styles";

// Props for the main component
interface StrategyAssemblyProps {
  onConfigChange?: (config: OrderConfig) => void;
  initialConfig?: OrderConfig;
  initialPattern?: StrategyPattern;
}

// Main export - wraps with provider
const StrategyAssembly: FC<StrategyAssemblyProps> = ({
  onConfigChange,
  initialConfig,
  initialPattern,
}) => {
  return (
    <StrategyAssemblyProvider
      onConfigChange={onConfigChange}
      initialConfig={initialConfig}
      initialPattern={initialPattern}
    >
      <StrategyAssemblyInner />
    </StrategyAssemblyProvider>
  );
};

/**
 * StrategyAssemblyInner — thin shell that composes extracted sub-components.
 *
 * This component does NOT subscribe to any strategy assembly context itself.
 * Each child component subscribes only to the specific context(s) it needs:
 *
 *   - PatternSelector  → GridDataContext only (strategyPattern)
 *   - GridArea          → all 4 contexts (orchestrates drag/drop interactions)
 *   - UtilityButtons    → GridDataContext only (clearAll, reverseBlocks actions)
 *   - DebugPanel        → GridDataContext only (orderConfig)
 *
 * This means hover and drag state changes (the most frequent updates) only
 * re-render GridArea — PatternSelector, UtilityButtons, and DebugPanel are
 * completely shielded from those high-frequency updates.
 */
const StrategyAssemblyInner: FC = () => {
  // Kraken API integration for current price — independent of context
  const { currentPrice, tickerError } = useKrakenAPI({
    symbol: "BTC/USD",
    autoConnect: true,
    pollInterval: 30000, // Update every 30 seconds
  });

  return (
    <div className={container}>
      <div className={header}>
        <h2 className={headerTextClass}>Strategy Builder</h2>
      </div>

      {/* Pattern Selector — re-renders only on strategyPattern change */}
      <PatternSelector />

      {/* Grid Area — handles all drag/drop interaction logic */}
      <GridArea currentPrice={currentPrice} tickerError={tickerError} />

      {/* Utility Buttons — re-renders only on grid data changes */}
      <UtilityButtons />

      {/* Debug Panel — re-renders only on orderConfig changes */}
      <DebugPanel />
    </div>
  );
};

export default StrategyAssembly;
