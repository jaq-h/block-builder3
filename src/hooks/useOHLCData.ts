/**
 * Hook for fetching OHLC candle data from Kraken
 * Uses REST API for initial historical backfill, then WebSocket for real-time updates
 */

import { useState, useEffect, useCallback } from "react";
import {
  getWebSocketManager,
  convertToKrakenPair,
  type KrakenOHLCData,
} from "../api";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { withLatestCandle } from "@utils/liveCandles";

// Map UI timeframe labels to Kraken interval values (minutes)
export const TIMEFRAME_MAP: Record<string, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1D": 1440,
  "1W": 10080,
};

interface UseOHLCDataOptions {
  symbol: string;
  interval: number; // Kraken interval in minutes
}

interface UseOHLCDataReturn {
  candles: CandlestickData<UTCTimestamp>[];
  latestCandle: CandlestickData<UTCTimestamp> | null;
  isLoading: boolean;
  error: string | null;
}

/** Convert an RFC3339 / ISO timestamp to a UTC unix timestamp (seconds) */
const toUTCTimestamp = (isoString: string): UTCTimestamp => {
  return (Math.floor(new Date(isoString).getTime() / 1000)) as UTCTimestamp;
};

/** Convert a Kraken OHLC data point to Lightweight Charts CandlestickData */
const krakenToCandle = (d: KrakenOHLCData): CandlestickData<UTCTimestamp> => ({
  time: toUTCTimestamp(d.interval_begin),
  open: d.open,
  high: d.high,
  low: d.low,
  close: d.close,
});

/** Fetch historical OHLC from Kraken REST */
const fetchHistoricalOHLC = async (
  symbol: string,
  interval: number,
): Promise<CandlestickData<UTCTimestamp>[]> => {
  const pair = convertToKrakenPair(symbol);
  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OHLC fetch failed: ${res.status}`);
  const json = await res.json();
  if (json.error?.length) throw new Error(json.error.join(", "));

  // Result keys vary - grab the first non-"last" key
  const dataKey = Object.keys(json.result).find((k) => k !== "last");
  if (!dataKey) return [];

  const raw: (string | number)[][] = json.result[dataKey];
  return raw.map((row) => ({
    time: (row[0] as number) as UTCTimestamp,
    open: parseFloat(row[1] as string),
    high: parseFloat(row[2] as string),
    low: parseFloat(row[3] as string),
    close: parseFloat(row[4] as string),
  }));
};

/**
 * Everything a completed request produced, tagged with the request it came from.
 * Keeping the tag in the same state as the data is what lets `isLoading` and
 * `error` be derived during render: state that belongs to a different
 * symbol/interval is simply not this request's, so there is nothing to reset
 * from an effect and no cascading render on every timeframe change. The tag is
 * also what makes the accumulation below start clean on a new symbol or
 * interval, rather than carrying bars across from the previous series.
 *
 * `candles` is every bar that has closed - the REST backfill plus each bar the
 * socket has since finished writing - and `latestCandle` is the bar still being
 * written. Splitting them is what keeps `candles` identity-stable between bar
 * closes; `withLatestCandle` is the one fold that puts them back together, and
 * both this hook and its consumers go through it. See `liveCandles.ts`.
 */
interface OHLCState {
  requestKey: string;
  candles: CandlestickData<UTCTimestamp>[];
  latestCandle: CandlestickData<UTCTimestamp> | null;
  error: string | null;
}

// Stable identity, so a consumer's effect deps do not churn while loading.
const NO_CANDLES: CandlestickData<UTCTimestamp>[] = [];

const INITIAL_STATE: OHLCState = {
  requestKey: "",
  candles: NO_CANDLES,
  latestCandle: null,
  error: null,
};

export const useOHLCData = ({
  symbol,
  interval,
}: UseOHLCDataOptions): UseOHLCDataReturn => {
  const requestKey = `${symbol}:${interval}`;
  const [state, setState] = useState<OHLCState>(INITIAL_STATE);

  // Until the fetch for this exact symbol/interval resolves, we are loading and
  // hold nothing for it.
  const isCurrent = state.requestKey === requestKey;
  const candles = isCurrent ? state.candles : NO_CANDLES;
  const latestCandle = isCurrent ? state.latestCandle : null;
  const error = isCurrent ? state.error : null;
  const isLoading = !isCurrent;

  // Fetch historical data on mount / interval change
  useEffect(() => {
    let cancelled = false;

    fetchHistoricalOHLC(symbol, interval)
      .then((data) => {
        if (cancelled) return;
        setState({
          requestKey,
          candles: data,
          latestCandle: data[data.length - 1] ?? null,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          requestKey,
          candles: NO_CANDLES,
          latestCandle: null,
          error: err instanceof Error ? err.message : "Failed to fetch OHLC",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, interval, requestKey]);

  // WebSocket subscription for real-time updates
  const handleOHLC = useCallback(
    (data: unknown) => {
      const msg = data as {
        channel?: string;
        type?: string;
        data?: KrakenOHLCData[];
      };
      if (msg.channel !== "ohlc" || !msg.data?.length) return;

      // Only process candles matching our current interval
      const relevant = msg.data.filter(
        (d) => d.symbol === symbol && d.interval === interval,
      );
      if (!relevant.length) return;

      if (msg.type === "update") {
        // Real-time update, applied only onto the request this tick actually
        // belongs to.
        const candle = krakenToCandle(relevant[relevant.length - 1]);
        setState((prev) => {
          if (prev.requestKey !== requestKey) return prev;

          // A tick for a bar older than the one being written arrived out of
          // order. What we already hold is the more complete record, so it wins
          // rather than being rewound.
          if (prev.latestCandle && candle.time < prev.latestCandle.time) {
            return prev;
          }

          // The interval has rolled over, so the bar we were writing is final
          // and joins the accumulated list; this one takes its place. Between
          // rollovers `candles` keeps its identity, which is what stops a
          // consumer's effect from churning on every tick.
          const candles =
            prev.latestCandle && candle.time > prev.latestCandle.time
              ? withLatestCandle(prev.candles, prev.latestCandle)
              : prev.candles;

          return { ...prev, candles, latestCandle: candle };
        });
      }
      // We ignore "snapshot" from WS since we already have REST backfill
    },
    [symbol, interval, requestKey],
  );

  useEffect(() => {
    const manager = getWebSocketManager();

    manager.on("ohlc", handleOHLC);
    manager.subscribeOHLC(symbol, interval).catch(console.error);

    // The cleanup releases exactly the channel this run subscribed, so both a
    // timeframe change and a market change are already covered: React tears
    // this effect down with the old `symbol` and `interval` still in scope
    // before running it again with the new ones. A separate "unsubscribe the
    // previous interval" branch used to sit above, tracking the last interval
    // in a ref; it fired a *second* release for a channel the cleanup had just
    // let go of. That was inert while nothing counted references, and is not
    // once the manager does - it would take a channel away from a consumer
    // still holding it.
    return () => {
      manager.off("ohlc", handleOHLC);
      manager.unsubscribeOHLC(symbol, interval);
    };
  }, [symbol, interval, handleOHLC]);

  return { candles, latestCandle, isLoading, error };
};
