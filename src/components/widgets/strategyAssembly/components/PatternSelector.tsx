import React from "react";
import type { StrategyPattern } from "../../../../types/grid";
import { PATTERN_CONFIGS } from "../../../../types/grid";
import { useGridData } from "../contexts/GridDataContext";
import {
  patternSelectorRow,
  patternButton,
  patternLabel,
  patternDescription,
} from "../strategyAssembly.styles";

/**
 * PatternSelector — subscribes only to GridDataContext (strategyPattern + setter).
 *
 * This component re-renders ONLY when `strategyPattern` changes (via GridDataContext),
 * NOT on hover or drag state changes. Previously, it re-rendered on every mouse
 * movement because it was part of the monolithic StrategyAssemblyInner.
 */
const PatternSelector: React.FC = function PatternSelector() {
  const { strategyPattern, setStrategyPattern } = useGridData();

  return (
    <div className={patternSelectorRow}>
      {(Object.keys(PATTERN_CONFIGS) as StrategyPattern[]).map((pattern) => (
        <button
          key={pattern}
          className={patternButton({ isActive: strategyPattern === pattern })}
          onClick={() => setStrategyPattern(pattern)}
        >
          <span className={patternLabel}>{PATTERN_CONFIGS[pattern].label}</span>
          <span className={patternDescription}>
            {PATTERN_CONFIGS[pattern].description}
          </span>
        </button>
      ))}
    </div>
  );
};

export default PatternSelector;
