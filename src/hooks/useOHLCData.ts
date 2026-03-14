/**
 * Hook for fetching OHLC candle data from Kraken
 * Uses REST API for initial historical backfill, then WebSocket for real-time updates
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getWebSocketManager,
  convertToKrakenPair,
  type KrakenOHLCData,
} from "../api";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

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

  // Result keys vary — grab the first non-"last" key
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

export const useOHLCData = ({
  symbol,
  interval,
}: UseOHLCDataOptions): UseOHLCDataReturn => {
  const [candles, setCandles] = useState<CandlestickData<UTCTimestamp>[]>([]);
  const [latestCandle, setLatestCandle] =
    useState<CandlestickData<UTCTimestamp> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevIntervalRef = useRef<number | null>(null);

  // Fetch historical data on mount / interval change
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchHistoricalOHLC(symbol, interval)
      .then((data) => {
        if (!cancelled) {
          setCandles(data);
          setLatestCandle(data[data.length - 1] ?? null);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch OHLC");
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

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
        // Real-time update — update latest candle
        const candle = krakenToCandle(relevant[relevant.length - 1]);
        setLatestCandle(candle);
      }
      // We ignore "snapshot" from WS since we already have REST backfill
    },
    [symbol, interval],
  );

  useEffect(() => {
    const manager = getWebSocketManager();

    // Unsubscribe from previous interval if it changed
    if (
      prevIntervalRef.current !== null &&
      prevIntervalRef.current !== interval
    ) {
      manager.unsubscribeOHLC(symbol, prevIntervalRef.current);
    }
    prevIntervalRef.current = interval;

    manager.on("ohlc", handleOHLC);
    manager.subscribeOHLC(symbol, interval).catch(console.error);

    return () => {
      manager.off("ohlc", handleOHLC);
      manager.unsubscribeOHLC(symbol, interval);
    };
  }, [symbol, interval, handleOHLC]);

  return { candles, latestCandle, isLoading, error };
};
