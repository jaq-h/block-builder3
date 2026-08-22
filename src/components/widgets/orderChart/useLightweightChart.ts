/**
 * React hook wrapping TradingView Lightweight Charts
 * Creates a chart instance with candlestick series attached to a container ref
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type PriceFormatBuiltIn,
  type UTCTimestamp,
} from "lightweight-charts";
import { useMarket } from "../../../store/useMarket";
import type { MarketPrecision } from "../../../types/markets";

interface UseLightweightChartReturn {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
}

const NO_CHART: UseLightweightChartReturn = { chart: null, candleSeries: null };

/**
 * How this pair's prices are written on the price scale, the crosshair label
 * and every order price line.
 *
 * Lightweight-charts defaults a series to `precision: 2, minMove: 0.01`, which
 * was indistinguishable from correct while the only market was BTC. It is wrong
 * the moment a sub-dollar pair is selected: ARB/USD and OP/USD both price to
 * four decimals, so the default draws a 0.4231 candle as "0.42", puts the axis
 * gridlines 2.4% apart, and collapses two order lines a whole percent apart
 * onto one label - while the panel's own header and every grid chip read
 * "$0.4231". The precision is Kraken's per-pair fact, so it comes from the same
 * `MarketPrecision` every other price on screen is drawn from.
 */
const priceFormatFor = (precision: MarketPrecision): PriceFormatBuiltIn => ({
  type: "price",
  precision: precision.priceDecimals,
  minMove: precision.tickSize,
});

export const useLightweightChart = (
  containerRef: RefObject<HTMLDivElement | null>,
): UseLightweightChartReturn => {
  // The chart is an external object created in an effect, so it has to be held
  // in state rather than a ref: a ref read during render hands the caller `null`
  // on the first pass and never re-renders them once the chart exists, so their
  // `setData` effects never re-run and the chart stays empty.
  const [instance, setInstance] = useState<UseLightweightChartReturn>(NO_CHART);

  const { precision } = useMarket();
  // Read through a ref at creation time so the precision arriving from Kraken
  // does not tear down and rebuild the chart. Kept current by this effect,
  // which is declared first so it has already run when the chart below is
  // built; the format effect at the bottom is what applies a later change.
  const precisionRef = useRef(precision);
  useEffect(() => {
    precisionRef.current = precision;
  });

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
      ...(precisionRef.current
        ? { priceFormat: priceFormatFor(precisionRef.current) }
        : {}),
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

  // Kraken's rules land after the chart is built, and the pair can change under
  // a chart that is already running, so the format follows the selection rather
  // than being fixed at creation.
  useEffect(() => {
    const series = instance.candleSeries;
    if (!series || !precision) return;
    series.applyOptions({ priceFormat: priceFormatFor(precision) });
  }, [instance.candleSeries, precision]);

  return instance;
};

/**
 * Helper type re-exports for convenience
 */
export type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp };
