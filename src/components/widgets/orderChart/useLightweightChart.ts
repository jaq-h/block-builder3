/**
 * React hook wrapping TradingView Lightweight Charts
 * Creates a chart instance with candlestick series attached to a container ref
 */

import { useEffect, useState, type RefObject } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

interface UseLightweightChartReturn {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
}

const NO_CHART: UseLightweightChartReturn = { chart: null, candleSeries: null };

export const useLightweightChart = (
  containerRef: RefObject<HTMLDivElement | null>,
): UseLightweightChartReturn => {
  // The chart is an external object created in an effect, so it has to be held
  // in state rather than a ref: a ref read during render hands the caller `null`
  // on the first pass and never re-renders them once the chart exists, so their
  // `setData` effects never re-run and the chart stays empty.
  const [instance, setInstance] = useState<UseLightweightChartReturn>(NO_CHART);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.4)",
        fontFamily: "ui-monospace, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.15)", labelBackgroundColor: "rgba(30,30,40,0.9)" },
        horzLine: { color: "rgba(255,255,255,0.15)", labelBackgroundColor: "rgba(30,30,40,0.9)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "rgba(100,200,100,0.85)",
      downColor: "rgba(200,100,100,0.85)",
      wickUpColor: "rgba(100,200,100,0.85)",
      wickDownColor: "rgba(200,100,100,0.85)",
      borderVisible: false,
    });

    setInstance({ chart, candleSeries: series });

    // Resize observer to keep chart sized to container
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      setInstance(NO_CHART);
    };
  }, [containerRef]);

  return instance;
};

/**
 * Helper type re-exports for convenience
 */
export type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp };
