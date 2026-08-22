// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  // Rendered rather than captured, so what the assertions read is what a
  // consumer of the hook would actually have to render from.
  const { hasPriceFormat } = useLightweightChart(ref);
  return (
    <div ref={ref} data-testid="has-price-format">
      {String(hasPriceFormat)}
    </div>
  );
};

/** What the hook reported about the format on the series it handed back. */
const reportedPriceFormat = () =>
  screen.getByTestId("has-price-format").textContent;

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
    metadataSettled: true,
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

// =============================================================================
// SAYING WHEN THE PLOT IS NOT THIS PAIR'S
// =============================================================================
//
// There is no format to apply without a `MarketPrecision`, and a series keeps
// whatever it was last given - the previous pair's rules, or the library's
// two-decimal default. Neither can be presented as this pair's prices, and
// there is no neutral width to substitute, so the hook reports the state and
// the panel covers the plot rather than captioning a drawing it cannot trust.

describe("what the hook reports about the format it applied", () => {
  it("reports a format once the pair's own rules are in hand", () => {
    render(<Harness symbol="ARB/USD" precision={ARB_USD} />);

    expect(reportedPriceFormat()).toBe("true");
  });

  it("reports none while the pair has no rules", () => {
    render(<Harness symbol="ARB/USD" precision={null} />);

    expect(reportedPriceFormat()).toBe("false");
  });

  // The market-switch case: a chart already formatted for BTC, moved to a pair
  // the metadata does not describe. The series still carries BTC's one decimal,
  // which is exactly why the answer here has to be false.
  it("stops reporting one when the selection moves to a pair with no rules", () => {
    const { rerender } = render(
      <Harness symbol="BTC/USD" precision={BTC_USD} />,
    );
    expect(reportedPriceFormat()).toBe("true");

    rerender(<Harness symbol="ARB/USD" precision={null} />);

    expect(reportedPriceFormat()).toBe("false");
    // Nothing was invented to fill the gap.
    expect(priceFormats()).not.toContainEqual({
      type: "price",
      precision: 2,
      minMove: 0.01,
    });
  });
});
