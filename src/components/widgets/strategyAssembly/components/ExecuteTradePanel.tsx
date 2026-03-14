import type { FC } from "react";
import { Link } from "react-router-dom";
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

interface ExecuteTradePanelProps {
  showSuccess: boolean;
  error: string | null;
  simulationMessage: string;
  isEffectivelySimulation: boolean;
  canToggle: boolean;
  isSimulationMode: boolean;
  onToggleSimulationMode: () => void;
}

const ExecuteTradePanel: FC<ExecuteTradePanelProps> = ({
  showSuccess,
  error,
  simulationMessage,
  isEffectivelySimulation,
  canToggle,
  isSimulationMode,
  onToggleSimulationMode,
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
          <Link to="/active" className={successLink}>
            View Active Orders
            <ArrowRightIcon width={12} height={12} />
          </Link>
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
