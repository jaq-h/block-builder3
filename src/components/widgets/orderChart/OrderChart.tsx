import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type FC,
} from "react";
import { LineStyle } from "lightweight-charts";
import type {
  CandlestickData,
  IPriceLine,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";

import type { OrderConfig } from "../../../types/grid";
import { useKrakenAPI } from "../../../hooks/useKrakenAPI";
import { useOHLCData, TIMEFRAME_MAP } from "../../../hooks/useOHLCData";
import { useLightweightChart } from "./useLightweightChart";
import { useMarket } from "../../../store/useMarket";
import { formatMarketPrice } from "../../../utils/marketFormat";
import { useIndicatorSeries } from "./useIndicatorSeries";
import { appendedCandles, withLatestCandle } from "@utils/liveCandles";
import { orderPriceLines } from "./orderPriceLines";
import { orderAutoscaleProvider } from "./orderAutoscale";
import { DEFAULT_PRICE_SCALE, type PriceScaleKind } from "./priceScale";
import { priceScaleMode } from "./priceScaleMode";
import ChartHeader from "./ChartHeader";
import { DEFAULT_TIMEFRAME } from "./timeframes";

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
  const { market, priceFormat } = useMarket();

  const { currentPrice, tickerError, publicStatus } = useKrakenAPI({
    autoConnect: true,
    pollInterval: 30000,
  });

  const [activeTimeframe, setActiveTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [priceScale, setPriceScale] =
    useState<PriceScaleKind>(DEFAULT_PRICE_SCALE);
  const [enabledIndicators, setEnabledIndicators] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const interval = TIMEFRAME_MAP[activeTimeframe] ?? 60;

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { chart, candleSeries } = useLightweightChart(chartContainerRef);
  const {
    candles,
    latestCandle,
    isLoading,
    error: candleError,
  } = useOHLCData({
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

  // What the candle series currently holds, tagged with the series it was
  // drawn into, so a rebuilt chart is redrawn in full rather than appended to.
  const drawnRef = useRef<{
    series: ISeriesApi<"Candlestick"> | null;
    candles: readonly CandlestickData<UTCTimestamp>[];
  }>({ series: null, candles: [] });

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

  // Set candle data when historical data arrives.
  //
  // An empty list is data too, and it has to reach the series: skipping it left
  // the previous market's bars drawn under the new market's header, price label
  // and axis precision - one asset's price history presented as another's.
  //
  // A bar close is not that, though, and must not be redrawn as one. It only
  // appends the bar that just finished - the very bar already on the chart as
  // the one that was forming - so it is written over itself with `update()` and
  // the rest of the series is left standing. `setData(candles)` there replaced
  // the whole series with a list holding no forming bar, and the newest candle
  // blinked out until the next tick. See `appendedCandles` in `liveCandles.ts`.
  useEffect(() => {
    if (!candleSeries) return;

    const drawn =
      drawnRef.current.series === candleSeries ? drawnRef.current.candles : null;
    drawnRef.current = { series: candleSeries, candles };

    // An empty result is an extension that added nothing - the same bars, in
    // the same order - so the series already shows this list and must be left
    // standing. Only `null`, meaning "not an extension of what is drawn", is a
    // reason to redraw.
    const appended = drawn && appendedCandles(drawn, candles);
    if (appended !== null) {
      for (const bar of appended) candleSeries.update(bar);
      return;
    }

    candleSeries.setData(candles);
  }, [candleSeries, candles]);

  // Apply real-time updates
  useEffect(() => {
    if (!candleSeries || !latestCandle) return;
    candleSeries.update(latestCandle);
  }, [candleSeries, latestCandle]);

  // Draw order level price lines.
  //
  // The teardown runs before the price is consulted, because a market switch
  // drops `currentPrice` to null while the previous pair's lines are still
  // attached - and lightweight-charts keeps price lines across `setData([])`.
  // Returning above the removal loop left BTC levels labelled over an ARB axis,
  // with the range still stretched to reach them, until the new pair's ticker
  // landed - and for good whenever it never did.
  useEffect(() => {
    if (!candleSeries) return;

    // Remove previous price lines
    for (const line of priceLinesRef.current) {
      candleSeries.removePriceLine(line);
    }
    priceLinesRef.current = [];

    // One derivation, shared with the grid's price chip: see `orderPriceLines`.
    // With no price there are no levels, which is a real answer rather than a
    // reason to skip the pass: it is what resets the autoscale provider below.
    const lines = currentPrice ? orderPriceLines(orders, currentPrice) : [];

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

    // Widen the candles' own range so the order levels stay on screen. An empty
    // list gives back the provider that defers to the candles entirely, which is
    // the only way to undo this: `applyOptions` skips an undefined source value,
    // so passing `undefined` would leave the previous market's range installed.
    // See `orderAutoscale.ts`.
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
    ? formatMarketPrice(currentPrice, priceFormat)
    : tickerError
      ? "Price Error"
      : "Loading…";

  // Three states, and each is drawn as what it actually is - the three the
  // owner names, read rather than reassembled.
  //
  // "No price format" has two meanings, and collapsing them left this panel as
  // the one surface still drawing numbers at a width the app does not have for
  // the pair: before the metadata answers the series carries
  // lightweight-charts' own `precision: 2, minMove: 0.01`, so selecting ARB/USD
  // while AssetPairs is in flight draws an axis, a crosshair and every order
  // label reading "0.42" for a 0.4231 price - beside a header, a selector
  // readout and a grid full of chips that all read "n/a" for the same pair.
  // There is no fallback precision anywhere else, and there is none here.
  //
  // So "not known yet" gets the loading treatment this panel already draws,
  // which invents no surface and states the truth, and only a settled answer
  // with no rules for this pair gets the refusal. A sub-second wrong answer is
  // still a wrong answer, and it is wrong on every page load.
  //
  // This panel used to build the distinction itself, out of the hook's
  // `hasPriceFormat` and the store's settled flag. It reads it now: the series'
  // format and this overlay are then answers to one question rather than two
  // that happen to agree, which is what the whole of this lane is about.
  const precisionPending = priceFormat.status === "pending";
  const precisionUnavailable = priceFormat.status === "unavailable";

  return (
    <div className="flex flex-col h-full bg-bg-primary border-b border-border-neutral">
      {/* The header is `ChartHeader`, shared with the placeholder in
          `LazyOrderChart` so the two measure the same at every width. */}
      <ChartHeader
        priceLabel={priceLabel}
        // The manager gives up reconnecting after a fixed number of tries.
        // Without this the app just keeps showing the last price it saw.
        isFeedOffline={publicStatus === "error"}
        controls={{
          activeTimeframe,
          onSelectTimeframe: setActiveTimeframe,
          enabledIndicators,
          onToggleIndicator: toggleIndicator,
          priceScale,
          onSelectPriceScale: setPriceScale,
        }}
      />

      {/* Chart body */}
      <div className="flex-1 min-h-0 relative">
        <div ref={chartContainerRef} className="w-full h-full" />

        {precisionPending ? (
          /* Covered rather than captioned, for the same reason the refusal
             below is: an overlay that lets the plot show through still shows
             an axis written at the library's own default. `z-4` is what makes
             the cover a cover - see the refusal below for the measurement. */
          <div className="absolute inset-0 z-4 flex items-center justify-center px-4 bg-bg-primary">
            <p className="text-[11px] text-text-muted opacity-60">
              Loading chart…
            </p>
          </div>
        ) : precisionUnavailable ? (
          /* The plot is covered rather than merely captioned. Without this
             pair's rules the axis, the crosshair and every order label are
             written at a width this app does not have for it, and there is no
             neutral one to fall back to - which is exactly why
             `formatMarketPrice` draws no number at all in the same state. An
             opaque cover is what stops the panel presenting the drawing as
             authoritative, and it takes the pointer so the crosshair cannot be
             read underneath it.

             **`z-4` is load-bearing and is the whole of "covered".** An opaque
             background is not enough on its own: lightweight-charts positions
             its own layers with explicit z-indexes, measured in Chrome as
             canvas 1, canvas 2 and its attribution anchor 3, and a positioned
             element at `z-index: auto` paints below every one of them whatever
             the DOM order says. Without this the cover was in the tree, opaque,
             `inset-0` and behind the plot: measured at 1440x900 with the rules
             refused, `elementFromPoint` at the centre of the panel returned the
             chart's CANVAS, and the message was drawn as a caption across a
             live axis reading 130000.00 to 50000.00 at the library's two
             decimals with a moving crosshair label. That is exactly the drawing
             this cover exists to withhold. It cannot be caught in jsdom, which
             lays nothing out and implements no canvas, so the class is asserted
             there and the geometry is a browser check. */
          <div className="absolute inset-0 z-4 flex items-center justify-center px-4 bg-bg-primary">
            <p className="text-[11px] text-status-yellow text-center">
              Precision rules unavailable for {market.symbol} - prices cannot be
              drawn
            </p>
          </div>
        ) : (
          <>
            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-[11px] text-text-muted opacity-60">
                  Loading chart…
                </p>
              </div>
            )}

            {/* A failed backfill ends the loading state without ending the
                empty chart, and the panel used to say nothing at all about it -
                an empty plot area under a header naming a pair, with no way to
                tell that from a market that simply has no bars. */}
            {!isLoading && candleError && (
              <div className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none">
                <p className="text-[11px] text-status-yellow text-center">
                  Price history unavailable for {market.symbol}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OrderChart;
