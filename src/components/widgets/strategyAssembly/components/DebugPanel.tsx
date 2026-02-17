import type { FC } from "react";
import { useGridData } from "../contexts/GridDataContext";
import { COLUMN_HEADERS, ROW_LABELS } from "../../../../data/orderTypes";
import { debugPanel } from "../strategyAssembly.styles";

/**
 * DebugPanel — subscribes only to GridDataContext for orderConfig.
 *
 * This component re-renders ONLY when `orderConfig` changes (block
 * placement/move/delete), NOT on hover or drag state changes.
 *
 * Previously, the debug panel re-rendered on every mouse movement because it
 * was part of the monolithic StrategyAssemblyInner.
 */
const DebugPanel: FC = function DebugPanel() {
  const { orderConfig } = useGridData();

  const configEntries = Object.keys(orderConfig);
  if (configEntries.length === 0) return null;

  return (
    <div className={debugPanel}>
      <details>
        <summary>Order Config ({configEntries.length} blocks)</summary>
        <pre className="text-[9px] max-h-37.5 overflow-auto">
          {JSON.stringify(
            Object.fromEntries(
              Object.entries(orderConfig).map(([id, config]) => [
                id,
                {
                  ...config,
                  position: `${COLUMN_HEADERS[config.col] ?? config.col} / ${ROW_LABELS[config.row] ?? config.row}`,
                },
              ]),
            ),
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
};

export default DebugPanel;
