import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type FC,
} from "react";
import { LineStyle } from "lightweight-charts";
import type { IPriceLine } from "lightweight-charts";

import type { OrderConfig } from "../../../types/grid";
import { useKrakenAPI } from "../../../hooks/useKrakenAPI";
import { useOHLCData, TIMEFRAME_MAP } from "../../../hooks/useOHLCData";
import { useLightweightChart } from "./useLightweightChart";
import { useMarket } from "../../../store/useMarket";
import { formatMarketPrice } from "../../../utils/marketFormat";
import { useIndicatorSeries } from "./useIndicatorSeries";
import { OVERLAY_INDICATORS } from "./indicators";
import { withLatestCandle } from "@utils/liveCandles";
import { orderPriceLines } from "./orderPriceLines";
import { orderAutoscaleProvider } from "./orderAutoscale";
import {
  DEFAULT_PRICE_SCALE,
  PRICE_SCALE_OPTIONS,
  priceScaleMode,
  type PriceScaleKind,
} from "./priceScale";
import {
  chartControlGroup,
  chartControlGroupLabel,
  chartHeader,
  chartHeaderPrimaryRow,
  chartHeaderSecondaryRow,
  chartToggleButton,
} from "./OrderChart.styles";
import { panelHeaderTitle } from "../../../styles/shared";

// =============================================================================
// CONSTANTS
// =============================================================================

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

// =============================================================================
// TYPES
// =============================================================================

interface OrderChartProps {
  /** Live assembly config - only orders currently in the grid are shown */
  orders: OrderConfig;
}

// =============================================================================
// COMPONENT
// =============================================================================

const OrderChart: FC<OrderChartProps> = ({ orders }) => {
  // The selected market is supplied here, at the boundary, and used for the
  // feed, the candles and the header. Everything below is unchanged.
  const { market, activeMarket } = useMarket();

  const { currentPrice, tickerError, publicStatus } = useKrakenAPI({
    autoConnect: true,
    pollInterval: 30000,
  });

  const [activeTimeframe, setActiveTimeframe] = useState("1W");
  const [priceScale, setPriceScale] =
    useState<PriceScaleKind>(DEFAULT_PRICE_SCALE);
  const [enabledIndicators, setEnabledIndicators] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const interval = TIMEFRAME_MAP[activeTimeframe] ?? 60;

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { chart, candleSeries } = useLightweightChart(chartContainerRef);
  const { candles, latestCandle, isLoading } = useOHLCData({
    symbol: market.symbol,
    interval,
  });

  // The overlays are functions of the whole series, so they get the whole
  // series: every bar that has closed, with the bar the WebSocket is still
  // writing folded on top. Handed `candles` alone they freeze at the fetch
  // while the candles below them keep moving. See `liveCandles.ts`.
  const liveCandles = useMemo(
    () => withLatestCandle(candles, latestCandle),
    [candles, latestCandle],
  );

  useIndicatorSeries(chart, liveCandles, enabledIndicators);

  // Track price lines so we can remove them on re-render
  const priceLinesRef = useRef<IPriceLine[]>([]);
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

  const toggleIndicator = (id: string) =>
    setEnabledIndicators((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // The scale is the chart's own price-to-pixel mapping and nothing else: no
  // price, no order and no grid position is derived from it. See `priceScale.ts`.
  useEffect(() => {
    if (!chart) return;
    chart.priceScale("right").applyOptions({ mode: priceScaleMode(priceScale) });
  }, [chart, priceScale]);

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

    // One derivation, shared with the grid's price chip: see `orderPriceLines`.
    const lines = orderPriceLines(orders, currentPrice);

    for (const line of lines) {
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: line.price,
          color: line.isEntry
            ? "rgba(100,200,100,0.75)"
            : "rgba(200,100,100,0.75)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: line.title,
        }),
      );
    }

    // Widen the candles' own range so the order levels stay on screen.
    candleSeries.applyOptions({
      autoscaleInfoProvider: orderAutoscaleProvider(
        lines.map((line) => line.price),
        priceScale === "logarithmic",
      ),
    });

    debouncedAutoScale();
  }, [candleSeries, orders, currentPrice, priceScale, debouncedAutoScale]);

  // Formatted at the pair's own precision, like every other price on screen. A
  // flat two decimals reads "$0.34" for an ARB price the grid renders as
  // "$0.3421", and the header and the grid disagreeing about the same number is
  // the drift decision D3 exists to prevent.
  const priceLabel = currentPrice
    ? formatMarketPrice(currentPrice, activeMarket)
    : tickerError
      ? "Price Error"
      : "Loading…";

  return (
    <div className="flex flex-col h-full bg-bg-primary border-b border-border-neutral">
      {/* Header. It is two rows: a title bar and a toolbar under it. The title
          bar's geometry is `panelTitleBar`, shared with the assembly and Active
          Orders panels, so all three panel titles sit on one height, one rail
          and one centre line. The block, not the rows, carries the rule and the
          background, so the two rows still read as one bar. */}
      <div className={chartHeader}>
        <div className={chartHeaderPrimaryRow}>
          <div className="flex items-center gap-3">
            <span className={panelHeaderTitle}>
              {market.base} / {market.quote}
            </span>
            <span className="text-[11px] text-text-muted">{priceLabel}</span>
            {/* The manager gives up reconnecting after a fixed number of tries.
                Without this the app just keeps showing the last price it saw. */}
            {publicStatus === "error" && (
              <span
                className="text-[11px] text-status-yellow"
                title="Reconnection was abandoned. Prices now come from the 30s poll only."
              >
                Live feed offline
              </span>
            )}
          </div>
          <div className={chartControlGroup} role="group" aria-label="Timeframe">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                // Without this the active timeframe is a colour and nothing else.
                aria-pressed={tf === activeTimeframe}
                onClick={() => setActiveTimeframe(tf)}
                className={chartToggleButton({
                  isActive: tf === activeTimeframe,
                })}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className={chartHeaderSecondaryRow}>
          {/* Every control here is a toggle button carrying `aria-pressed`, so
              its own state change is what a screen reader reads back. Nothing
              in this panel writes to a live region: the grid's announcer in
              `src/utils/gridAnnouncements.ts` is the app's single owner of
              spoken sentences, and a second one here would talk over it. */}
          <div className={chartControlGroup} role="group" aria-label="Indicators">
            <span className={chartControlGroupLabel} aria-hidden="true">
              Indicators
            </span>
            {OVERLAY_INDICATORS.map((indicator) => (
              <button
                key={indicator.id}
                type="button"
                aria-pressed={enabledIndicators.has(indicator.id)}
                // The visible label is kept inside the accessible name rather
                // than replaced by it: WCAG 2.5.3 Label in Name, so someone
                // driving the app by voice can say the words they can see.
                aria-label={`${indicator.label}: ${indicator.description}`}
                onClick={() => toggleIndicator(indicator.id)}
                className={chartToggleButton({
                  isActive: enabledIndicators.has(indicator.id),
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
          >
            <span className={chartControlGroupLabel} aria-hidden="true">
              Scale
            </span>
            {PRICE_SCALE_OPTIONS.map((option) => (
              <button
                key={option.kind}
                type="button"
                aria-pressed={priceScale === option.kind}
                aria-label={`${option.label}: ${option.description}`}
                onClick={() => setPriceScale(option.kind)}
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
