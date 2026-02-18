import type { FC } from "react";
import { Link } from "react-router-dom";
import ToolsIcon from "../../../../assets/icons/tools.svg?react";
import CheckIcon from "../../../../assets/icons/check.svg?react";
import ArrowRightIcon from "../../../../assets/icons/arrow-right.svg?react";
import AlertTriangleIcon from "../../../../assets/icons/alert-triangle.svg?react";
import ClockIcon from "../../../../assets/icons/clock.svg?react";
import {
  executeButtonContainer,
  simulationModeContainer,
  simulationBadgeVariants,
  simulationToggle,
  executeButtonVariants,
  successMessage,
  errorMessage,
  successLink,
} from "../../../../App.styles";

// =============================================================================
// TYPES
// =============================================================================

interface ExecuteTradePanelProps {
  /** Number of orders in the current config */
  orderCount: number;
  /** Handler to execute / submit the trade */
  onExecute: () => void;
  /** Whether a submission is currently in progress */
  isSubmitting: boolean;
  /** Whether to show the success feedback message */
  showSuccess: boolean;
  /** Error message to display, or null */
  error: string | null;
  /** Human-readable simulation/environment message */
  simulationMessage: string;
  /** Whether we're effectively in simulation mode */
  isEffectivelySimulation: boolean;
  /** Whether the user is allowed to toggle between simulation and API mode */
  canToggle: boolean;
  /** Whether the simulation toggle is currently on */
  isSimulationMode: boolean;
  /** Toggle simulation mode on/off */
  onToggleSimulationMode: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

const ExecuteTradePanel: FC<ExecuteTradePanelProps> = ({
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
        {/* Only show toggle in dev when API keys are configured */}
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

      {/* Execute Button */}
      <button
        className={executeButtonVariants({ isSubmitting })}
        onClick={onExecute}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <ClockIcon width={14} height={14} />
            Submitting...
          </>
        ) : (
          <>Execute Trade ({orderCount} orders)</>
        )}
      </button>

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
