import { lazy, Suspense, type FC } from "react";
import type { OrderConfig } from "../../../types/grid";
import ChartHeader from "./ChartHeader";

// `lightweight-charts` is only ever reachable from this panel, and it is by far
// the largest single dependency in the bundle. Loading it behind `lazy()` keeps
// it - and the chart code that uses it - out of the initial payload, so the
// strategy builder is interactive before the charting library has been fetched.
//
// `ChartHeader` above is imported eagerly on purpose, and it is why
// `priceScaleMode.ts` exists as a module of its own: the header must be able to
// draw before the chart chunk lands, so nothing it reaches may pull the library
// in. See `AGENTS.md` under "The chart panel".
const OrderChartImpl = lazy(() => import("./OrderChart"));

interface LazyOrderChartProps {
  /** Live assembly config - only orders currently in the grid are shown */
  orders: OrderConfig;
}

/**
 * Placeholder shown while the chart chunk is in flight. It reproduces the real
 * panel's frame and its "Loading chart…" treatment so the swap costs no layout
 * shift and no visible change of style.
 *
 * The header is the *same component* the real panel renders, with its controls
 * omitted - not a second header built to match. Two hand-written headers is
 * exactly how they came to differ: once either row wrapped, the real one stood
 * 166px tall at a 1024px viewport against this one's 102px, and the chart body
 * jumped 64px the moment the chunk landed. Height is not something a constant
 * can hold equal here, because what a wrapped row measures depends on the
 * panel's width; sharing the markup holds it equal by construction.
 *
 * The pair is read from the market context by `ChartHeader` rather than named
 * here. It used to say "BTC / USD" outright, which was invisible while the app
 * had one market and becomes a placeholder announcing the wrong pair the moment
 * it has five.
 */
const ChartFallback: FC = () => (
  <div className="flex flex-col h-full bg-bg-primary border-b border-border-neutral">
    <ChartHeader priceLabel="Loading…" />
    <div className="flex-1 min-h-0 flex items-center justify-center">
      <p className="text-[11px] text-text-muted opacity-60">Loading chart…</p>
    </div>
  </div>
);

const LazyOrderChart: FC<LazyOrderChartProps> = ({ orders }) => (
  <Suspense fallback={<ChartFallback />}>
    <OrderChartImpl orders={orders} />
  </Suspense>
);

export default LazyOrderChart;
