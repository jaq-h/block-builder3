/**
 * React hook wrapping TradingView Lightweight Charts
 * Creates a chart instance with candlestick series attached to a container ref
 */

import { useEffect, useRef, type RefObject } from "react";
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

export const useLightweightChart = (
  containerRef: RefObject<HTMLDivElement | null>,
): UseLightweightChartReturn => {
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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

    chartRef.current = chart;
    seriesRef.current = series;

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
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [containerRef]);

  return { chart: chartRef.current, candleSeries: seriesRef.current };
};

/**
 * Helper type re-exports for convenience
 */
export type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp };
