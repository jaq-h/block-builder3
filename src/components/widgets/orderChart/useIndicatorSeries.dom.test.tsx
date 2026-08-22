// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";

import { useIndicatorSeries } from "./useIndicatorSeries";
import { OVERLAY_INDICATORS } from "./indicators";

// =============================================================================
// HARNESS
// =============================================================================
//
// A stand-in chart that records what was added, removed and fed. The point is
// the lifecycle, not the drawing: a series left behind after its button is
// switched off keeps painting a stale average over live candles.

interface FakeSeries {
  options: { color: string };
  data: unknown[];
  removed: boolean;
}

const fakeChart = () => {
  const series: FakeSeries[] = [];
  const chart = {
    addSeries: vi.fn((_definition: unknown, options: { color: string }) => {
      const entry: FakeSeries = { options, data: [], removed: false };
      series.push(entry);
      return {
        setData: (data: unknown[]) => {
          entry.data = data;
        },
      } as unknown as ISeriesApi<"Line">;
    }),
    removeSeries: vi.fn((api: ISeriesApi<"Line">) => {
      const index = handles.indexOf(api);
      if (index >= 0) series[index].removed = true;
    }),
  };
  const handles: ISeriesApi<"Line">[] = [];
  const wrapped = {
    ...chart,
    addSeries: (definition: unknown, options: { color: string }) => {
      const api = chart.addSeries(definition, options);
      handles.push(api);
      return api;
    },
  } as unknown as IChartApi;
  return { chart: wrapped, series, live: () => series.filter((s) => !s.removed) };
};

const candles = (count: number): CandlestickData<UTCTimestamp>[] =>
  Array.from({ length: count }, (_, i) => ({
    time: (1_000 + i * 60) as UTCTimestamp,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
  }));

const [first, second] = OVERLAY_INDICATORS;

// =============================================================================
// TESTS
// =============================================================================

describe("useIndicatorSeries", () => {
  it("draws nothing until an indicator is switched on", () => {
    const { chart, live } = fakeChart();
    renderHook(() => useIndicatorSeries(chart, candles(60), new Set()));
    expect(live()).toHaveLength(0);
  });

  it("creates one series per enabled indicator, in its registered colour", () => {
    const { chart, live } = fakeChart();
    renderHook(() =>
      useIndicatorSeries(chart, candles(60), new Set([first.id, second.id])),
    );

    expect(live()).toHaveLength(2);
    expect(live().map((s) => s.options.color)).toEqual([
      first.color,
      second.color,
    ]);
  });

  it("fills a series the moment it is created", () => {
    const { chart, live } = fakeChart();
    const data = candles(60);
    renderHook(() => useIndicatorSeries(chart, data, new Set([first.id])));

    expect(live()[0].data).toEqual(first.compute(data));
    expect(live()[0].data.length).toBeGreaterThan(0);
  });

  it("removes a series when its indicator is switched off", () => {
    const { chart, series, live } = fakeChart();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: ReadonlySet<string> }) =>
        useIndicatorSeries(chart, candles(60), enabled),
      { initialProps: { enabled: new Set([first.id]) as ReadonlySet<string> } },
    );

    expect(live()).toHaveLength(1);
    rerender({ enabled: new Set() });
    expect(live()).toHaveLength(0);
    expect(series[0].removed).toBe(true);
  });

  it("keeps an enabled series and re-feeds it when candles arrive", () => {
    const { chart, live } = fakeChart();
    const { rerender } = renderHook(
      ({ data }: { data: CandlestickData<UTCTimestamp>[] }) =>
        useIndicatorSeries(chart, data, new Set([first.id])),
      { initialProps: { data: candles(60) } },
    );

    const created = live()[0];
    const grown = candles(61);
    rerender({ data: grown });

    // Same series object, new data: recreating it would flash the line off and
    // on again on every candle tick.
    expect(live()).toHaveLength(1);
    expect(live()[0]).toBe(created);
    expect(created.data).toEqual(first.compute(grown));
  });

  it("never reaches into a chart that has gone away", () => {
    // `useLightweightChart` calls `chart.remove()`, which destroys the series
    // with it. A `removeSeries` afterwards would throw inside an effect.
    const { chart, live } = fakeChart();
    const { rerender } = renderHook(
      ({ instance }: { instance: IChartApi | null }) =>
        useIndicatorSeries(instance, candles(60), new Set([first.id])),
      { initialProps: { instance: chart as IChartApi | null } },
    );

    expect(live()).toHaveLength(1);
    rerender({ instance: null });
    expect(chart.removeSeries).not.toHaveBeenCalled();
  });
});
