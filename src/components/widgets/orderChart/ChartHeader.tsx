import type { FC } from "react";

import { useMarket } from "../../../store/useMarket";
import { panelHeaderTitle } from "../../../styles/shared";
import { OVERLAY_INDICATORS } from "./indicators";
import { DEFAULT_PRICE_SCALE, PRICE_SCALE_OPTIONS } from "./priceScale";
import type { PriceScaleKind } from "./priceScale";
import { DEFAULT_TIMEFRAME, TIMEFRAMES } from "./timeframes";
import {
  chartControlGroup,
  chartControlGroupLabel,
  chartHeader,
  chartHeaderPrimaryRow,
  chartHeaderSecondaryRow,
  chartToggleButton,
} from "./OrderChart.styles";

// =============================================================================
// THE CHART PANEL'S HEADER - one owner, both callers
// =============================================================================
//
// The real panel and the placeholder `LazyOrderChart` shows while the chart
// chunk is in flight render *this*, rather than each drawing a header of its
// own. That is what makes the swap cost no layout shift: the two are the same
// markup at the same widths, so their heights are equal by construction rather
// than by a number kept in step by hand.
//
// They were two hand-written headers, and they measured differently the moment
// either row wrapped: at a 1024px viewport the real header stood 166px tall
// against the placeholder's 102px, so the chart body jumped 64px upward the
// instant the chunk landed. `chartHeaderSecondaryRow`'s `min-h` was the previous
// answer, and a floor cannot be one - what a wrapped row measures depends on the
// panel's width, not on a constant.
//
// **Nothing here may import `lightweight-charts`, directly or transitively.**
// This module is reached from the eager chunk, so a value import of the library
// would put the whole of it back in the initial payload. `OVERLAY_INDICATORS`
// is safe because `indicators/types.ts` imports the library for types only;
// `PRICE_SCALE_OPTIONS` is safe because the enum mapping was moved out to
// `priceScaleMode.ts` for this reason. See `AGENTS.md`, "The chart panel".

/**
 * The live half of the header: the state each control reflects and the handler
 * it calls. Absent while the chart chunk is still loading, which is what tells
 * this component to draw the same controls inert - see `ChartHeaderProps`.
 */
export interface ChartHeaderControls {
  activeTimeframe: string;
  onSelectTimeframe: (timeframe: string) => void;
  enabledIndicators: ReadonlySet<string>;
  onToggleIndicator: (id: string) => void;
  priceScale: PriceScaleKind;
  onSelectPriceScale: (kind: PriceScaleKind) => void;
}

interface ChartHeaderProps {
  /** Formatted at the pair's own precision by the caller, never here. */
  priceLabel: string;
  /**
   * The manager gave up reconnecting and prices now come from the 30s poll
   * alone. It is a warning about the numbers next to it, so it is drawn beside
   * them and never truncated - see the row below.
   */
  isFeedOffline?: boolean;
  /**
   * Omitted by the placeholder. Every control still renders, at its full size,
   * so the two headers measure the same - but `disabled`, which takes them out
   * of the tab order, and behind `aria-hidden` so nothing announces a toggle
   * that cannot yet be operated.
   */
  controls?: ChartHeaderControls;
}

const ChartHeader: FC<ChartHeaderProps> = ({
  priceLabel,
  isFeedOffline = false,
  controls,
}) => {
  const { market } = useMarket();

  // The placeholder draws the panel's opening state: the same buttons, the same
  // one active, so only the handlers are missing rather than the geometry.
  const activeTimeframe = controls?.activeTimeframe ?? DEFAULT_TIMEFRAME;
  const priceScale = controls?.priceScale ?? DEFAULT_PRICE_SCALE;
  const enabledIndicators = controls?.enabledIndicators;
  const inert = controls === undefined;

  return (
    /* Two rows: a title bar and a toolbar under it. The block, not the rows,
       carries the rule and the background, so the two still read as one bar. */
    <div className={chartHeader}>
      <div className={chartHeaderPrimaryRow}>
        {/* The pair, its price and any warning about that price. This strip is
            never given `truncate` or any other `overflow: hidden` utility: a
            flex item whose main-axis overflow is not visible has an automatic
            minimum size of 0, so the strip would collapse and take the offline
            warning with it at exactly the widths it matters at. It yields by
            wrapping instead - which the row above allows - and the warning stays
            on screen at every width. `ChartHeader.dom.test.tsx` pins that. */}
        <div className="flex items-center gap-3">
          <span className={panelHeaderTitle}>
            {market.base} / {market.quote}
          </span>
          <span className="text-[11px] text-text-muted">{priceLabel}</span>
          {isFeedOffline && (
            <span
              className="text-[11px] text-status-yellow"
              title="Reconnection was abandoned. Prices now come from the 30s poll only."
            >
              Live feed offline
            </span>
          )}
        </div>

        <div
          className={chartControlGroup}
          role="group"
          aria-label="Timeframe"
          aria-hidden={inert || undefined}
        >
          {TIMEFRAMES.map((timeframe) => (
            <button
              key={timeframe}
              type="button"
              disabled={inert}
              // Without this the active timeframe is a colour and nothing else.
              aria-pressed={timeframe === activeTimeframe}
              onClick={() => controls?.onSelectTimeframe(timeframe)}
              className={chartToggleButton({
                isActive: timeframe === activeTimeframe,
              })}
            >
              {timeframe}
            </button>
          ))}
        </div>
      </div>

      <div className={chartHeaderSecondaryRow}>
        {/* Every control here is a toggle button carrying `aria-pressed`, so its
            own state change is what a screen reader reads back. Nothing in this
            panel writes to a live region: the grid's announcer in
            `src/utils/gridAnnouncements.ts` is the app's single owner of spoken
            sentences, and a second one here would talk over it. */}
        <div
          className={chartControlGroup}
          role="group"
          aria-label="Indicators"
          aria-hidden={inert || undefined}
        >
          <span className={chartControlGroupLabel} aria-hidden="true">
            Indicators
          </span>
          {OVERLAY_INDICATORS.map((indicator) => (
            <button
              key={indicator.id}
              type="button"
              disabled={inert}
              aria-pressed={enabledIndicators?.has(indicator.id) ?? false}
              // The visible label is kept inside the accessible name rather
              // than replaced by it: WCAG 2.5.3 Label in Name, so someone
              // driving the app by voice can say the words they can see.
              aria-label={`${indicator.label}: ${indicator.description}`}
              onClick={() => controls?.onToggleIndicator(indicator.id)}
              className={chartToggleButton({
                isActive: enabledIndicators?.has(indicator.id) ?? false,
              })}
            >
              {/* The swatch is the only thing tying a button to its line. */}
              <span
                aria-hidden="true"
                className="inline-block w-2 h-0.5 mr-1.5 align-middle rounded-full"
                style={{ backgroundColor: indicator.color }}
              />
              {indicator.label}
            </button>
          ))}
        </div>

        <div
          className={chartControlGroup}
          role="group"
          aria-label="Price scale"
          aria-hidden={inert || undefined}
        >
          <span className={chartControlGroupLabel} aria-hidden="true">
            Scale
          </span>
          {PRICE_SCALE_OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              disabled={inert}
              aria-pressed={priceScale === option.kind}
              aria-label={`${option.label}: ${option.description}`}
              onClick={() => controls?.onSelectPriceScale(option.kind)}
              className={chartToggleButton({
                isActive: priceScale === option.kind,
              })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChartHeader;
