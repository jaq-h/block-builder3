// =============================================================================
// TIMEFRAMES - what the chart's title bar offers
// =============================================================================
//
// Its own module rather than a constant inside `ChartHeader.tsx` because the
// real panel and the placeholder both need the default, and a component file
// that also exports constants breaks React Fast Refresh.
//
// These keys must stay in step with `TIMEFRAME_MAP` in
// `src/hooks/useOHLCData.ts`, which turns the one selected here into Kraken's
// interval in minutes. A key here with no entry there falls back to 60 - an
// hourly series drawn under a label saying something else.

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

/** What the panel opens on, shared with the placeholder so it draws the same. */
export const DEFAULT_TIMEFRAME = "1W";
