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
}));

const chartState = vi.hoisted(() => ({
  instance: null as unknown,
}));

vi.mock("../../../hooks/useKrakenAPI", () => ({
  useKrakenAPI: () => ({
    currentPrice: 50_000,
    tickerError: null,
    publicStatus: "connected",
  }),
}));

vi.mock("../../../hooks/useOHLCData", () => ({
  TIMEFRAME_MAP: { "1m": 1, "1W": 10080 },
  useOHLCData: () => ({
    candles: feed.candles,
    latestCandle: feed.latestCandle,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("./useLightweightChart", () => ({
  useLightweightChart: () => chartState.instance,
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

  const candleSeries = {
    setData: vi.fn(),
    update: vi.fn(),
    createPriceLine: vi.fn((options: unknown) => options),
    removePriceLine: vi.fn(),
    applyOptions: vi.fn(),
  } as unknown as ISeriesApi<"Candlestick">;

  return { chart, candleSeries, lineSeries, priceScaleOptions };
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
    chartState.instance = fakeChart();
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
});
