import type { FC } from "react";
import type { StrategyPattern } from "../../../../types/grid";
import { PATTERN_CONFIGS } from "../../../../types/grid";
import CheckIcon from "../../../../assets/icons/check.svg?react";
import { useGridData } from "../contexts/GridDataContext";
import {
  patternSelectorRow,
  patternButton,
  patternLabelRow,
  patternMarker,
  patternLabel,
  patternDescription,
} from "../strategyAssembly.styles";

/**
 * PatternSelector - subscribes only to GridDataContext (strategyPattern + setter).
 *
 * This component re-renders ONLY when `strategyPattern` changes (via GridDataContext),
 * NOT on hover or drag state changes. Previously, it re-rendered on every mouse
 * movement because it was part of the monolithic StrategyAssemblyInner.
 */
const PatternSelector: FC = function PatternSelector() {
  const { strategyPattern, setStrategyPattern } = useGridData();

  return (
    <div
      className={patternSelectorRow}
      role="group"
      aria-label="Order assembly type"
    >
      {(Object.keys(PATTERN_CONFIGS) as StrategyPattern[]).map((pattern) => {
        const isActive = strategyPattern === pattern;
        return (
          <button
            key={pattern}
            type="button"
            // The accent border and fill say which assembly type is in use, and
            // `aria-pressed` says it to anything that is not looking at them.
            aria-pressed={isActive}
            // Without this the bare `button` reset in `src/index.css` - which is
            // unlayered, and so beats every utility class - paints both buttons
            // in its own grey 1px skin, and the two render identically: measured
            // in Chrome, the selected and unselected button came back with the
            // same border width, border colour and background. See that file for
            // why the reset is opted out of one control at a time rather than
            // fixed app-wide here.
            data-unstyled
            className={patternButton({ isActive })}
            onClick={() => setStrategyPattern(pattern)}
          >
            <span className={patternLabelRow}>
              {/* The one cue that survives with no colour at all. The slot is
                  rendered on both buttons so the label does not shift sideways
                  as the tick appears; only the tick itself is conditional.
                  `aria-hidden` because `aria-pressed` above already carries the
                  same fact, and announcing it twice is worse than once. */}
              <span className={patternMarker} aria-hidden="true">
                {isActive && <CheckIcon width={11} height={11} />}
              </span>
              <span className={patternLabel}>
                {PATTERN_CONFIGS[pattern].label}
              </span>
            </span>
            <span className={patternDescription}>
              {PATTERN_CONFIGS[pattern].description}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default PatternSelector;
