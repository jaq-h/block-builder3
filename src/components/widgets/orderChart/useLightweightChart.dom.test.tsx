// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { useRef, type FC } from "react";

// =============================================================================
// THE CHART DRAWS PRICES AT THE PAIR'S OWN PRECISION
// =============================================================================
//
// Lightweight-charts defaults a series to `precision: 2, minMove: 0.01`, which
// is indistinguishable from correct on BTC/USD and wrong on every sub-dollar
// pair this change adds. At four decimals an ARB candle of 0.4231 draws "0.42",
// the axis gridlines land 2.4% apart, and two order price lines a whole percent
// apart collapse onto one label - while the panel header beside it and every
// grid chip read "$0.4231".
//
// The library is stubbed so the assertions are about the options the series is
// actually configured with, at creation and on every change, rather than about
// anything in the source. A real chart cannot be measured here anyway: it draws
// to a canvas jsdom does not implement.

// jsdom ships no ResizeObserver, and the hook observes its container to keep
// the chart sized. Nothing here resizes, so a no-op is the whole requirement.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", NoopResizeObserver);

const addSeries = vi.fn();
const applyOptions = vi.fn();
const seriesApplyOptions = vi.fn();
const remove = vi.fn();

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addSeries,
    applyOptions,
    remove,
    priceScale: () => ({ applyOptions: vi.fn() }),
  })),
  CandlestickSeries: "candlestick-series",
  ColorType: { Solid: "solid" },
  CrosshairMode: { Normal: 0 },
}));

import { useLightweightChart } from "./useLightweightChart";
import { MarketContext, type MarketContextValue } from "@store/MarketContext";
import { MARKETS, findMarket } from "@data/markets";
import { ARB_USD, BTC_USD } from "@/test/marketFixtures";
import type { MarketPrecision } from "@/types/markets";

const Probe = () => {
  const ref = useRef<HTMLDivElement>(null);
  useLightweightChart(ref);
  return <div ref={ref} />;
};

/**
 * One component for every render, so a rerender updates the tree rather than
 * replacing it. A fresh wrapper function per render is a different component
 * type to React, which unmounts the chart and rebuilds it - hiding whether the
 * hook rebuilds it too, which is the thing worth knowing.
 */
const Harness: FC<{ symbol: string; precision: MarketPrecision | null }> = ({
  symbol,
  precision,
}) => {
  const market = findMarket(symbol)!;
  const value: MarketContextValue = {
    market,
    precision,
    activeMarket: { market, precision },
    markets: MARKETS,
    selectMarket: () => false,
    metadataError: null,
  };

  return (
    <MarketContext.Provider value={value}>
      <Probe />
    </MarketContext.Provider>
  );
};

/** Every `priceFormat` the series has been configured with, in order. */
const priceFormats = () => {
  const atCreation = addSeries.mock.calls.map(
    ([, options]) => options?.priceFormat,
  );
  const applied = seriesApplyOptions.mock.calls
    .map(([options]) => options?.priceFormat)
    .filter(Boolean);
  return [...atCreation, ...applied].filter(Boolean);
};

beforeEach(() => {
  vi.clearAllMocks();
  addSeries.mockReturnValue({ applyOptions: seriesApplyOptions });
});

describe("the candlestick series' price format", () => {
  it("follows a four-decimal pair rather than the library's two", () => {
    render(<Harness symbol="ARB/USD" precision={ARB_USD} />);

    // Kraken's own numbers for ARB/USD: `pair_decimals` 4, `tick_size` 0.0001.
    expect(priceFormats()).toContainEqual({
      type: "price",
      precision: 4,
      minMove: 0.0001,
    });
    // The library's default would have drawn 0.4231 as "0.42".
    priceFormats().forEach((format) => {
      expect(format).not.toEqual({
        type: "price",
        precision: 2,
        minMove: 0.01,
      });
    });
  });

  it("follows a one-decimal pair just as closely", () => {
    render(<Harness symbol="BTC/USD" precision={BTC_USD} />);

    expect(priceFormats()).toContainEqual({
      type: "price",
      precision: 1,
      minMove: 0.1,
    });
  });

  // Kraken's rules arrive after the chart is built, so the first frame has no
  // precision to draw at. Configuring nothing leaves the library's own default
  // in place for that frame only; what must not happen is a width invented here.
  it("configures no format at all until the pair's rules have loaded", () => {
    render(<Harness symbol="ARB/USD" precision={null} />);

    expect(addSeries).toHaveBeenCalled();
    expect(priceFormats()).toEqual([]);
  });

  it("re-applies the format when the metadata lands under a live chart", () => {
    const { rerender } = render(
      <Harness symbol="ARB/USD" precision={null} />,
    );
    expect(priceFormats()).toEqual([]);

    rerender(<Harness symbol="ARB/USD" precision={ARB_USD} />);

    // Applied to the existing series rather than by rebuilding the chart: a
    // teardown here would drop the candles already drawn.
    expect(remove).not.toHaveBeenCalled();
    expect(seriesApplyOptions).toHaveBeenCalledWith({
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
  });
});
