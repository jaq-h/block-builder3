import type { FC } from "react";
import ToolsIcon from "../../../../assets/icons/tools.svg?react";
import CheckIcon from "../../../../assets/icons/check.svg?react";
import ArrowRightIcon from "../../../../assets/icons/arrow-right.svg?react";
import AlertTriangleIcon from "../../../../assets/icons/alert-triangle.svg?react";
import {
  executeButtonContainer,
  simulationModeContainer,
  simulationBadgeVariants,
  simulationToggle,
  successMessage,
  errorMessage,
  successLink,
} from "../../../../App.styles";
import { cn } from "../../../../lib/utils";

interface ExecuteTradePanelProps {
  showSuccess: boolean;
  error: string | null;
  simulationMessage: string;
  isEffectivelySimulation: boolean;
  canToggle: boolean;
  isSimulationMode: boolean;
  onToggleSimulationMode: () => void;
  /**
   * Switches the app to the Active Orders panel. This used to be a router
   * `Link` to `/active`, which navigated to a URL that rendered the identical
   * page - there were never any routes - so the control did nothing at any
   * width. It is a tab switch now, and the tabs are the one thing that decides
   * which panel is on screen.
   */
  onViewActiveOrders: () => void;
}

const ExecuteTradePanel: FC<ExecuteTradePanelProps> = ({
  showSuccess,
  error,
  simulationMessage,
  isEffectivelySimulation,
  canToggle,
  isSimulationMode,
  onToggleSimulationMode,
  onViewActiveOrders,
}) => {
  return (
    <div className={executeButtonContainer}>
      {/* Simulation Mode Badge + Toggle */}
      <div className={simulationModeContainer}>
        <div
          className={simulationBadgeVariants({
            isSimulation: isEffectivelySimulation,
          })}
        >
          <ToolsIcon width={12} height={12} />
          {simulationMessage}
        </div>
        {canToggle && (
          <button
            className={simulationToggle}
            onClick={onToggleSimulationMode}
            title={
              isSimulationMode
                ? "Switch to API mode — orders will be sent to Kraken"
                : "Switch to simulation mode — orders saved locally"
            }
          >
            {isSimulationMode ? "Switch to API Mode" : "Switch to Simulation"}
          </button>
        )}
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className={successMessage}>
          <CheckIcon width={14} height={14} />
          Orders submitted successfully!
          {/* Below `lg` only: above it the tabs do not exist and the Active
              Orders panel is already on screen beside this message, so the
              control has nothing to switch to. Its accessible name is the
              visible text, so a voice-control user can say what they read. */}
          <button
            type="button"
            onClick={onViewActiveOrders}
            className={cn(successLink, "lg:hidden")}
          >
            View Active Orders
            <ArrowRightIcon width={12} height={12} />
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className={errorMessage}>
          <AlertTriangleIcon width={14} height={14} />
          {error}
        </div>
      )}
    </div>
  );
};

export default ExecuteTradePanel;
