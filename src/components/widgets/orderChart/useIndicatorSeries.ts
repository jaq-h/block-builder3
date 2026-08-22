import { useEffect, useRef } from "react";
import { LineSeries } from "lightweight-charts";
import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";

import { OVERLAY_INDICATORS } from "./indicators";

// =============================================================================
// USE INDICATOR SERIES - the whole lifecycle of every overlay indicator
// =============================================================================
//
// The registry decides which indicators exist; this decides nothing. Turning
// one on creates its line series, feeds it and keeps it fed; turning it off
// removes it. Adding a fourth indicator needs no change here at all.

/**
 * Keeps one line series per enabled indicator in step with `enabledIds`.
 *
 * The series are torn down implicitly rather than in an effect cleanup:
 * `useLightweightChart` calls `chart.remove()`, which destroys every series
 * with it, and a `removeSeries` running afterwards would be reaching into a
 * disposed chart. So the map is cleared when the chart goes away and the
 * series are never touched again.
 */
export const useIndicatorSeries = (
  chart: IChartApi | null,
  candles: readonly CandlestickData<UTCTimestamp>[],
  enabledIds: ReadonlySet<string>,
): void => {
  const seriesRef = useRef(new Map<string, ISeriesApi<"Line">>());

  // Membership: add what was turned on, remove what was turned off.
  useEffect(() => {
    const active = seriesRef.current;

    if (!chart) {
      active.clear();
      return;
    }

    for (const [id, series] of active) {
      if (!enabledIds.has(id)) {
        chart.removeSeries(series);
        active.delete(id);
      }
    }

    for (const indicator of OVERLAY_INDICATORS) {
      if (!enabledIds.has(indicator.id) || active.has(indicator.id)) continue;
      active.set(
        indicator.id,
        chart.addSeries(LineSeries, {
          color: indicator.color,
          lineWidth: 2,
          // An overlay is a reading of the candles, not a level to trade at:
          // a price line and a last-value tag on the axis would compete with
          // the order levels, which are the labels that matter here.
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        }),
      );
    }
  }, [chart, enabledIds]);

  // Data. `enabledIds` is a dependency so a series created by the effect above
  // in this same commit is filled immediately rather than on the next tick.
  useEffect(() => {
    if (!chart) return;
    for (const indicator of OVERLAY_INDICATORS) {
      const series = seriesRef.current.get(indicator.id);
      if (series) series.setData(indicator.compute(candles));
    }
  }, [chart, candles, enabledIds]);
};
