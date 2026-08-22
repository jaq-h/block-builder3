import { lazy, Suspense, type FC } from "react";
import type { OrderConfig } from "../../../types/grid";
import {
  chartControlGroupLabel,
  chartHeader,
  chartHeaderPrimaryRow,
  chartHeaderSecondaryRow,
} from "./OrderChart.styles";

// `lightweight-charts` is only ever reachable from this panel, and it is by far
// the largest single dependency in the bundle. Loading it behind `lazy()` keeps
// it - and the chart code that uses it - out of the initial payload, so the
// strategy builder is interactive before the charting library has been fetched.
const OrderChartImpl = lazy(() => import("./OrderChart"));

interface LazyOrderChartProps {
  /** Live assembly config - only orders currently in the grid are shown */
  orders: OrderConfig;
}

/**
 * Placeholder shown while the chart chunk is in flight. It reproduces the real
 * panel's frame and its "Loading chart…" treatment so the swap costs no layout
 * shift and no visible change of style.
 */
const ChartFallback: FC = () => (
  <div className="flex flex-col h-full bg-bg-primary border-b border-border-neutral">
    {/* Both header rows are reproduced, empty. The real header is two rows
        tall, and a one-row placeholder would jump the chart body upward the
        moment the chunk lands. */}
    <div className={chartHeader}>
      <div className={chartHeaderPrimaryRow}>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-text-primary">
            BTC / USD
          </span>
          <span className="text-[11px] text-text-muted">Loading…</span>
        </div>
      </div>
      <div className={chartHeaderSecondaryRow} aria-hidden="true">
        <span className={chartControlGroupLabel}>Indicators</span>
        <span className={chartControlGroupLabel}>Scale</span>
      </div>
    </div>
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
