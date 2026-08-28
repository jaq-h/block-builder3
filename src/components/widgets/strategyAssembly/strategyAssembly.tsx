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
import MarketSelector from "../../common/MarketSelector";
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
  /** Switches the app to the Active Orders panel; see `ExecuteTradePanel`. */
  onViewActiveOrders?: () => void;
  isEditMode?: boolean;
  /**
   * A strategy the builder refused to load, because the market it was placed on
   * is not one the app offers any more. Passed through to `GridArea`, which is
   * where the grid's single announcer lives - the refusal is a fact about a grid
   * that did not change, and the panel has no voice of its own.
   */
  strategyMarketUnavailable?: { symbol: string; attempt: number } | null;
  /**
   * A saved strategy that has just been loaded into this builder, and the
   * market it brought with it. Passed through to `GridArea` for the same reason
   * as the refusal above: the grid has the one voice, and this panel has none.
   */
  strategyLoaded?: {
    symbol: string;
    name: string;
    marketChanged: boolean;
  } | null;
  /** Called once the grid has spoken, so the same load is not announced twice. */
  onStrategyLoadAnnounced?: () => void;
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
 * StrategyAssemblyInner - thin shell that composes extracted sub-components.
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
  onViewActiveOrders,
  isEditMode,
  strategyMarketUnavailable,
  strategyLoaded,
  onStrategyLoadAnnounced,
}) => {
  // No symbol here any more: `useKrakenAPI` follows the selected market. Naming
  // one would let this panel price a pair the selector is not showing.
  const { currentPrice, tickerError } = useKrakenAPI({
    autoConnect: true,
    pollInterval: 30000,
  });

  // `showSuccess` is part of this, not just `orderCount`. A successful
  // submission empties the grid and raises the success flag in the same React
  // update, so an `orderCount > 0` gate alone unmounted this panel on the very
  // render that had something to say: "Orders submitted successfully!" and the
  // Active Orders control beside it were never once visible. The failure path
  // was unaffected, because a failed submission leaves the orders on the grid,
  // which is why only the success half was silently missing.
  const showFeedback = (orderCount != null && orderCount > 0) || showSuccess;

  return (
    <div className={container}>
      {/* Placed above the pattern row rather than inside it: the pattern row is
          a `role="group"` of pattern buttons, and the panel chrome around it
          belongs to another lane. This adds a sibling and rebuilds nothing. */}
      <MarketSelector currentPrice={currentPrice} priceError={tickerError} />
      <PatternSelector />
      <GridArea
        currentPrice={currentPrice}
        tickerError={tickerError}
        strategyMarketUnavailable={strategyMarketUnavailable}
        strategyLoaded={strategyLoaded}
        onStrategyLoadAnnounced={onStrategyLoadAnnounced}
      />
      <UtilityButtons
        orderCount={orderCount}
        onExecute={onExecute}
        isSubmitting={isSubmitting}
        isEditMode={isEditMode}
      />
      {showFeedback && onToggleSimulationMode && onViewActiveOrders && (
        <ExecuteTradePanel
          showSuccess={showSuccess ?? false}
          error={error ?? null}
          simulationMessage={simulationMessage ?? ""}
          isEffectivelySimulation={isEffectivelySimulation ?? true}
          canToggle={canToggle ?? false}
          isSimulationMode={isSimulationMode ?? true}
          onToggleSimulationMode={onToggleSimulationMode}
          onViewActiveOrders={onViewActiveOrders}
        />
      )}
    </div>
  );
};

export default StrategyAssembly;
