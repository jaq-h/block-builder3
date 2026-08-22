// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { PriceScaleMode } from "lightweight-charts";
import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  LineData,
  UTCTimestamp,
} from "lightweight-charts";

import OrderChart from "./OrderChart";
import { simpleMovingAverage } from "./indicators";
import { withLatestCandle } from "@utils/liveCandles";

// =============================================================================
// HARNESS
// =============================================================================
//
// The chart panel wired to stand-ins for the three things it cannot have in a
// test: the ticker, the OHLC feed and a real canvas. Everything between them -
// the live-candle merge, the registry, `useIndicatorSeries` - is the real code,
// because the defect this file was written for lived in the wiring rather than
// in any one of them.

/** The slice of the library's price-scale options this panel actually sets. */
interface PriceScaleOptions {
  mode?: PriceScaleMode;
  autoScale?: boolean;
}

interface FakeLineSeries {
  options: { color: string };
  data: LineData<UTCTimestamp>[];
}

const feed = vi.hoisted(() => ({
  candles: [] as CandlestickData<UTCTimestamp>[],
  latestCandle: null as CandlestickData<UTCTimestamp> | null,
  isLoading: false,
  error: null as string | null,
}));

const chartState = vi.hoisted(() => ({
  instance: null as unknown,
  hasPriceFormat: true,
}));

/** The ticker, which goes silent for the moment a market switch takes. */
const ticker = vi.hoisted(() => ({
  currentPrice: 50_000 as number | null,
}));

/** The selected pair, and whether Kraken's rules for it are known. */
const marketState = vi.hoisted(() => ({
  symbol: "BTC/USD",
  base: "BTC",
  quote: "USD",
  hasPrecision: true,
  metadataSettled: true,
}));

vi.mock("../../../hooks/useKrakenAPI", () => ({
  useKrakenAPI: () => ({
    currentPrice: ticker.currentPrice,
    tickerError: null,
    publicStatus: "connected",
  }),
}));

vi.mock("../../../store/useMarket", () => ({
  useMarket: () => {
    const market = {
      symbol: marketState.symbol,
      base: marketState.base,
      quote: marketState.quote,
      name: marketState.base,
      quotePrefix: "$",
    };
    const precision = marketState.hasPrecision
      ? {
          symbol: marketState.symbol,
          priceDecimals: 1,
          quantityDecimals: 8,
          tickSize: 0.1,
          orderMin: 0.00005,
        }
      : null;
    return {
      market,
      precision,
      activeMarket: { market, precision },
      markets: [market],
      selectMarket: () => false,
      metadataError: null,
      metadataSettled: marketState.metadataSettled,
    };
  },
}));

vi.mock("../../../hooks/useOHLCData", () => ({
  TIMEFRAME_MAP: { "1m": 1, "1W": 10080 },
  useOHLCData: () => ({
    candles: feed.candles,
    latestCandle: feed.latestCandle,
    isLoading: feed.isLoading,
    error: feed.error,
  }),
}));

vi.mock("./useLightweightChart", () => ({
  useLightweightChart: () => ({
    ...(chartState.instance as object),
    hasPriceFormat: chartState.hasPriceFormat,
  }),
}));

const fakeChart = () => {
  const lineSeries: FakeLineSeries[] = [];
  /** Every option the panel has applied to the right price scale, in order. */
  const priceScaleOptions: PriceScaleOptions[] = [];

  const chart = {
    addSeries: (_definition: unknown, options: { color: string }) => {
      const entry: FakeLineSeries = { options, data: [] };
      lineSeries.push(entry);
      return {
        setData: (data: LineData<UTCTimestamp>[]) => {
          entry.data = data;
        },
      } as unknown as ISeriesApi<"Line">;
    },
    removeSeries: () => {},
    priceScale: () => ({
      applyOptions: (options: PriceScaleOptions) => {
        priceScaleOptions.push(options);
      },
    }),
  } as unknown as IChartApi;

  /** Every list the panel has handed the candle series, in order. */
  const setData = vi.fn();
  const createPriceLine = vi.fn((options: unknown) => options);
  const removePriceLine = vi.fn();
  const seriesApplyOptions = vi.fn();

  const candleSeries = {
    setData,
    update: vi.fn(),
    createPriceLine,
    removePriceLine,
    applyOptions: seriesApplyOptions,
  } as unknown as ISeriesApi<"Candlestick">;

  return {
    chart,
    candleSeries,
    setData,
    createPriceLine,
    removePriceLine,
    seriesApplyOptions,
    lineSeries,
    priceScaleOptions,
  };
};

const PERIOD = 20;
const BAR_SECONDS = 60;

/** A closed backfill bar. Rising closes, so a stale average is unmistakable. */
const bar = (index: number, close: number): CandlestickData<UTCTimestamp> => ({
  time: ((1_700_000_000 + index * BAR_SECONDS) as UTCTimestamp),
  open: close,
  high: close,
  low: close,
  close,
});

const backfill = Array.from({ length: 25 }, (_, i) => bar(i, 100 + i));

const lastValue = (series: FakeLineSeries) => series.data.at(-1)!.value;
const lastTime = (series: FakeLineSeries) => series.data.at(-1)!.time;

const expectedSMA = (candles: CandlestickData<UTCTimestamp>[]) =>
  simpleMovingAverage(candles, PERIOD).at(-1)!;

// =============================================================================
// TESTS
// =============================================================================

describe("OrderChart", () => {
  beforeEach(() => {
    feed.candles = backfill;
    feed.latestCandle = backfill.at(-1)!;
    feed.isLoading = false;
    feed.error = null;
    chartState.instance = fakeChart();
    chartState.hasPriceFormat = true;
    ticker.currentPrice = 50_000;
    marketState.symbol = "BTC/USD";
    marketState.base = "BTC";
    marketState.hasPrecision = true;
    marketState.metadataSettled = true;
  });

  /**
   * Mounts the panel and hands back a `tick`, which is what a WebSocket
   * message does to the feed: a bar that has rolled over is final and joins
   * `candles`, the new bar becomes the one being written, and `candles` keeps
   * its identity while that bar forms.
   *
   * The stand-in honours that contract through the same fold the hook itself
   * uses; that the real `useOHLCData` accumulates this way is pinned in
   * `useOHLCData.test.ts`, against a real socket.
   */
  const mount = () => {
    const harness = chartState.instance as ReturnType<typeof fakeChart>;
    const { rerender } = render(<OrderChart orders={{}} />);
    const tick = (candle: CandlestickData<UTCTimestamp>) => {
      if (feed.latestCandle && candle.time > feed.latestCandle.time) {
        feed.candles = withLatestCandle(feed.candles, feed.latestCandle);
      }
      feed.latestCandle = candle;
      rerender(<OrderChart orders={{}} />);
    };
    return { ...harness, tick };
  };

  const enableSMA20 = () =>
    fireEvent.click(screen.getByRole("button", { name: /SMA 20/ }));

  it("names its toggles so the visible text is part of the accessible name", () => {
    // WCAG 2.5.3 Label in Name: a voice-control user says what they can see.
    // `getByRole` matches on the accessible name, so these queries failing is
    // exactly the failure that person would hit.
    mount();

    expect(
      screen.getByRole("button", {
        name: "SMA 20: 20-period simple moving average",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Log: Logarithmic price scale" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Linear: Linear price scale" }),
    ).toBeInTheDocument();
  });

  it("switches the chart's own price scale when the toggle is operated", () => {
    // What a user sees when they press Log: the axis stops being uniform. The
    // mode reaching `priceScale("right")` is the whole of that, and the button
    // reporting its new state is what a screen-reader user hears instead - the
    // panel deliberately has no live region, so `aria-pressed` is the
    // announcement. Nothing else may change: the scale is presentation only.
    const { priceScaleOptions } = mount();
    const modes = () =>
      priceScaleOptions
        .filter((options) => options.mode !== undefined)
        .map((options) => options.mode);

    expect(modes().at(-1)).toBe(PriceScaleMode.Normal);
    expect(
      screen.getByRole("button", { name: /^Linear:/ }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /^Log:/ }));

    expect(modes().at(-1)).toBe(PriceScaleMode.Logarithmic);
    expect(screen.getByRole("button", { name: /^Log:/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /^Linear:/ }));

    expect(modes().at(-1)).toBe(PriceScaleMode.Normal);
  });

  it("advances a moving average as the bar being written moves", () => {
    // The regression. `useOHLCData` splits its output in two: `candles`, the
    // REST backfill, and `latestCandle`, the bar the WebSocket is still
    // writing. The candle series consumes both; fed the backfill alone the
    // overlay froze at the fetch and drew a stale line that looked live.
    const { lineSeries, tick } = mount();
    enableSMA20();

    const atFetch = lastValue(lineSeries[0]);
    expect(atFetch).toBe(expectedSMA(backfill).value);

    // A tick rewrites the close of the bar already on screen.
    const forming = { ...backfill.at(-1)!, close: 900 };
    tick(forming);

    expect(lineSeries).toHaveLength(1);
    expect(lastTime(lineSeries[0])).toBe(forming.time);
    expect(lastValue(lineSeries[0])).not.toBe(atFetch);
    expect(lastValue(lineSeries[0])).toBe(
      expectedSMA([...backfill.slice(0, -1), forming]).value,
    );
  });

  it("advances a moving average when the interval rolls over into a new bar", () => {
    const { lineSeries, tick } = mount();
    enableSMA20();

    const pointsAtFetch = lineSeries[0].data.length;

    const rolled = bar(backfill.length, 500);
    tick(rolled);

    // Same series object: recreating it on a tick flashes the line off and on.
    expect(lineSeries).toHaveLength(1);
    expect(lineSeries[0].data).toHaveLength(pointsAtFetch + 1);
    expect(lastTime(lineSeries[0])).toBe(rolled.time);
    expect(lastValue(lineSeries[0])).toBe(
      expectedSMA([...backfill, rolled]).value,
    );
  });

  it("keeps every bar that closes, so consecutive rollovers leave no gap", () => {
    // One rollover was the case the broken feed happened to get right. The
    // defect only shows from the second onwards: each new bar replaced the last
    // one instead of following it, so the average was taken across a hole while
    // still returning a finite number and drawing what looks like a live line.
    const { lineSeries, tick } = mount();
    enableSMA20();

    const rolled = [
      bar(backfill.length, 500),
      bar(backfill.length + 1, 501),
      bar(backfill.length + 2, 502),
    ];
    for (const candle of rolled) tick(candle);

    const contiguous = [...backfill, ...rolled];

    expect(lineSeries).toHaveLength(1);
    expect(lineSeries[0].data).toHaveLength(contiguous.length - PERIOD + 1);

    // Every bar accounted for, in time order, none skipped.
    expect(lineSeries[0].data.map((point) => point.time)).toEqual(
      contiguous.slice(PERIOD - 1).map((candle) => candle.time),
    );
    expect(lastValue(lineSeries[0])).toBe(expectedSMA(contiguous).value);
  });

  it("still rewrites the forming bar after the interval has rolled over", () => {
    const { lineSeries, tick } = mount();
    enableSMA20();

    const rolled = bar(backfill.length, 500);
    tick(rolled);
    const points = lineSeries[0].data.length;

    const forming = { ...rolled, close: 900 };
    tick(forming);

    // A rewrite of the bar being written moves the last point, it does not add
    // one, and it must not lose the bar that closed before it.
    expect(lineSeries[0].data).toHaveLength(points);
    expect(lastTime(lineSeries[0])).toBe(forming.time);
    expect(lastValue(lineSeries[0])).toBe(
      expectedSMA([...backfill, forming]).value,
    );
  });

  // ===========================================================================
  // A MARKET THE PANEL HOLDS NO BARS FOR
  // ===========================================================================
  //
  // Selecting another pair changes `useOHLCData`'s request key, so the hook
  // holds nothing for the new pair until its own fetch answers. The panel's
  // header, price label and axis precision have already switched: whatever is
  // drawn under them is being presented as this pair's price history.

  /** Re-renders the panel after the feed has been pointed at another market. */
  const switchMarket = (
    rerender: (ui: React.ReactElement) => void,
    { error }: { error: string | null },
  ) => {
    feed.candles = [];
    feed.latestCandle = null;
    feed.isLoading = error === null;
    feed.error = error;
    rerender(<OrderChart orders={{}} />);
  };

  it("clears the candles rather than leaving the previous market's on screen", () => {
    const { setData } = chartState.instance as ReturnType<typeof fakeChart>;
    const { rerender } = render(<OrderChart orders={{}} />);

    expect(setData).toHaveBeenLastCalledWith(backfill);

    switchMarket(rerender, { error: null });

    // The regression: the effect used to return early on an empty list, so the
    // series kept the bars of a market the panel was no longer naming.
    expect(setData).toHaveBeenLastCalledWith([]);
  });

  it("says the history is unavailable when the fetch for the new market fails", () => {
    const { setData } = chartState.instance as ReturnType<typeof fakeChart>;
    const { rerender } = render(<OrderChart orders={{}} />);

    switchMarket(rerender, { error: "OHLC fetch failed: 500" });

    // A rejected backfill ends the loading state without producing any bars, so
    // without this the panel is an empty plot area that says nothing - and,
    // before the clearing above, a full one showing the wrong asset.
    expect(setData).toHaveBeenLastCalledWith([]);
    expect(
      screen.getByText(/Price history unavailable for BTC\/USD/),
    ).toBeInTheDocument();
  });

  it("says nothing about a fetch that is still running", () => {
    const { rerender } = render(<OrderChart orders={{}} />);

    switchMarket(rerender, { error: null });

    expect(screen.queryByText(/Price history unavailable/)).toBeNull();
    expect(screen.getByText("Loading chart…")).toBeInTheDocument();
  });

  // ===========================================================================
  // THE PREVIOUS MARKET'S ORDER LEVELS
  // ===========================================================================
  //
  // A switch drops `currentPrice` to null until the new pair's ticker lands,
  // and lightweight-charts keeps price lines across `setData([])`. Skipping the
  // whole pass while there is no price left BTC levels labelled over an ARB
  // axis, with the range still stretched to reach them - and permanently so
  // whenever the new pair's ticker never answers.

  /** An entry limit 25% below the market, so it draws exactly one line. */
  const oneOrder = { "sa-limit-1": { col: 0, row: 1, type: "limit", yPosition: 25, direction: "downside" as const } };

  it("removes the previous market's price lines when its price goes", () => {
    const { removePriceLine, createPriceLine } = chartState.instance as ReturnType<
      typeof fakeChart
    >;
    const { rerender } = render(<OrderChart orders={oneOrder} />);

    const drawn = createPriceLine.mock.results.map((result) => result.value);
    expect(drawn).toHaveLength(1);
    expect(removePriceLine).not.toHaveBeenCalled();

    ticker.currentPrice = null;
    marketState.symbol = "ARB/USD";
    marketState.base = "ARB";
    rerender(<OrderChart orders={oneOrder} />);

    // Every line the previous market put on the series is taken off it, and no
    // line takes its place while there is no price to derive one from.
    expect(removePriceLine.mock.calls.map(([line]) => line)).toEqual(drawn);
    expect(createPriceLine).toHaveBeenCalledTimes(1);
  });

  it("stops the previous market's levels stretching the new pair's axis", () => {
    const { seriesApplyOptions } = chartState.instance as ReturnType<
      typeof fakeChart
    >;
    const { rerender } = render(<OrderChart orders={oneOrder} />);

    /** What the candles alone ask for, before any order level widens it. */
    const fromCandles = () => () => ({
      priceRange: { minValue: 0.4, maxValue: 0.45 },
    });
    const installed = () =>
      seriesApplyOptions.mock.calls.at(-1)?.[0]?.autoscaleInfoProvider;

    // While BTC had a price, its 37,500 level was pulled into the range - an
    // ARB-sized range stretched to four figures.
    expect(installed()(fromCandles()).priceRange.maxValue).toBeGreaterThan(
      1_000,
    );

    ticker.currentPrice = null;
    marketState.symbol = "ARB/USD";
    rerender(<OrderChart orders={oneOrder} />);

    // Now it defers to the candles entirely. Passing `undefined` would not have
    // done this: `applyOptions` skips an undefined value, leaving the previous
    // market's provider installed and the new pair's candles flattened against
    // the bottom of a plot scaled for BTC.
    expect(installed()(fromCandles())).toEqual({
      priceRange: { minValue: 0.4, maxValue: 0.45 },
    });
  });

  // ===========================================================================
  // A PAIR WHOSE RULES THE APP DOES NOT HAVE
  // ===========================================================================
  //
  // `formatMarketPrice` refuses to draw a single number without a
  // `MarketPrecision`. The series has no such option: it keeps whatever format
  // it was last given, so it would draw a whole axis, crosshair and set of
  // order labels at the previous pair's width. There is no neutral precision to
  // substitute - so the plot is covered rather than captioned.

  const plotArea = () =>
    document.querySelector(".flex-1.min-h-0.relative") as HTMLElement;

  it("covers the plot when the selected pair has no precision", () => {
    chartState.hasPriceFormat = false;
    marketState.symbol = "ARB/USD";
    marketState.hasPrecision = false;
    render(<OrderChart orders={{}} />);

    const message = screen.getByText(/Precision rules unavailable for ARB\/USD/);
    expect(message).toBeInTheDocument();

    // Opaque and pointer-taking: a cover that let the crosshair through would
    // still be reading prices off an axis written in another pair's units.
    const cover = message.closest("div")!;
    expect(cover.className).toContain("bg-bg-primary");
    expect(cover.className).not.toContain("pointer-events-none");
    expect(cover).toHaveClass("absolute", "inset-0");
    expect(plotArea()).toContainElement(cover);
  });

  it("says one thing at a time, not this over the loading caption", () => {
    chartState.hasPriceFormat = false;
    marketState.hasPrecision = false;
    feed.isLoading = true;
    render(<OrderChart orders={{}} />);

    expect(screen.queryByText("Loading chart…")).toBeNull();
    expect(screen.getByText(/Precision rules unavailable/)).toBeInTheDocument();
  });

  it("presents the plot as usual once the pair's rules are known", () => {
    render(<OrderChart orders={{}} />);

    expect(screen.queryByText(/Precision rules unavailable/)).toBeNull();
  });

  // Before the metadata answers, no precision means "not known yet". Covering
  // the plot then would report the ordinary first second of every page load as
  // a missing rule.
  it("waits for the metadata to answer before covering anything", () => {
    chartState.hasPriceFormat = false;
    marketState.hasPrecision = false;
    marketState.metadataSettled = false;
    feed.isLoading = true;
    render(<OrderChart orders={{}} />);

    expect(screen.queryByText(/Precision rules unavailable/)).toBeNull();
    expect(screen.getByText("Loading chart…")).toBeInTheDocument();
  });
});
