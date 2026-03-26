import { useState, useRef, useEffect, useCallback, type FC } from "react";
import { LineStyle } from "lightweight-charts";
import type { OrderConfig } from "../../../types/grid";
import { shouldBeDescending } from "../../../utils";
import { ORDER_TYPES, COLUMN_HEADERS } from "../../../data/orderTypes";
import { useKrakenAPI } from "../../../hooks/useKrakenAPI";
import { useOHLCData, TIMEFRAME_MAP } from "../../../hooks/useOHLCData";
import { useLightweightChart } from "./useLightweightChart";
import type { IPriceLine, AutoscaleInfo } from "lightweight-charts";

// =============================================================================
// CONSTANTS
// =============================================================================

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

// =============================================================================
// TYPES
// =============================================================================

interface OrderChartProps {
  /** Live assembly config — only orders currently in the grid are shown */
  orders: OrderConfig;
}

// =============================================================================
// COMPONENT
// =============================================================================

const OrderChart: FC<OrderChartProps> = ({ orders }) => {
  const { currentPrice, tickerError } = useKrakenAPI({
    symbol: "BTC/USD",
    autoConnect: true,
    pollInterval: 30000,
  });

  const [activeTimeframe, setActiveTimeframe] = useState("1W");
  const interval = TIMEFRAME_MAP[activeTimeframe] ?? 60;

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { chart, candleSeries } = useLightweightChart(chartContainerRef);
  const { candles, latestCandle, isLoading } = useOHLCData({
    symbol: "BTC/USD",
    interval,
  });

  // Track price lines so we can remove them on re-render
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const orderPricesRef = useRef<number[]>([]);
  const autoScaleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-scale: refit the price scale to include order lines
  const debouncedAutoScale = useCallback(() => {
    if (autoScaleTimerRef.current) clearTimeout(autoScaleTimerRef.current);
    autoScaleTimerRef.current = setTimeout(() => {
      if (chart) {
        chart.priceScale("right").applyOptions({ autoScale: true });
      }
    }, 150);
  }, [chart]);

  // Set candle data when historical data arrives
  useEffect(() => {
    if (!candleSeries || !candles.length) return;
    candleSeries.setData(candles);
  }, [candleSeries, candles]);

  // Apply real-time updates
  useEffect(() => {
    if (!candleSeries || !latestCandle) return;
    candleSeries.update(latestCandle);
  }, [candleSeries, latestCandle]);

  // Draw order level price lines
  useEffect(() => {
    if (!candleSeries || !currentPrice) return;

    // Remove previous price lines
    for (const line of priceLinesRef.current) {
      candleSeries.removePriceLine(line);
    }
    priceLinesRef.current = [];

    const orderEntries = Object.entries(orders).filter(
      ([, o]) => o.yPosition !== undefined,
    );

    const prices: number[] = [];

    for (const [, o] of orderEntries) {
      const desc = shouldBeDescending(o.row, o.col, undefined, o.type);
      const typeDef = ORDER_TYPES.find((t) => t.type === o.type);
      const colLabel = COLUMN_HEADERS[o.col] ?? "";
      // Determine axis label: map axis index (1-based) to the axes array
      const axisIndex = (o.axis ?? 1) - 1;
      const axisType = typeDef?.axes[axisIndex] ?? "limit";
      const axisSuffix =
        typeDef && typeDef.axes.length > 1 ? `-${axisType}` : "";
      const label = `${colLabel} ${typeDef?.abrv ?? o.type}${axisSuffix}`;
      const isEntry = o.col === 0;

      // Calculate absolute price from percentage offset
      const pctOffset = o.yPosition! / 100;
      const price = desc
        ? currentPrice * (1 - pctOffset)
        : currentPrice * (1 + pctOffset);

      prices.push(price);

      const color = isEntry
        ? "rgba(100,200,100,0.75)"
        : "rgba(200,100,100,0.75)";

      const priceLine = candleSeries.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: label,
      });
      priceLinesRef.current.push(priceLine);
    }

    // Update autoscale provider so the chart range includes order price levels
    orderPricesRef.current = prices;
    candleSeries.applyOptions({
      autoscaleInfoProvider: prices.length
        ? (original: () => AutoscaleInfo | null) => {
            const res = original();
            if (res !== null && res.priceRange !== null) {
              const min = Math.min(...prices);
              const max = Math.max(...prices);
              const padding = (max - min) * 0.05 || max * 0.01;
              res.priceRange.minValue = Math.min(
                res.priceRange.minValue,
                min - padding,
              );
              res.priceRange.maxValue = Math.max(
                res.priceRange.maxValue,
                max + padding,
              );
            }
            return res;
          }
        : undefined,
    });

    debouncedAutoScale();
  }, [candleSeries, orders, currentPrice, debouncedAutoScale]);

  const priceLabel = currentPrice
    ? `$${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : tickerError
      ? "Price Error"
      : "Loading…";

  return (
    <div className="flex flex-col h-full bg-bg-primary border-b border-border-neutral">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-neutral bg-bg-overlay shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-text-primary">
            BTC / USD
          </span>
          <span className="text-[11px] text-text-muted">{priceLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors duration-150 cursor-pointer"
              style={
                tf === activeTimeframe
                  ? {
                      color: "rgba(120,160,255,0.9)",
                      backgroundColor: "rgba(100,140,255,0.15)",
                    }
                  : {
                      color: "rgba(255,255,255,0.4)",
                      backgroundColor: "transparent",
                    }
              }
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart body */}
      <div className="flex-1 min-h-0 relative">
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-[11px] text-text-muted opacity-60">
              Loading chart…
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderChart;
