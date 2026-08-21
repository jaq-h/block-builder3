/**
 * Parsing for the Kraken v2 `ticker` WebSocket channel.
 *
 * The socket frame is not the REST shape: `data` is an *array* of ticker
 * snapshots with numeric fields, and it carries only the fields that the
 * ticker channel publishes - never `open` or the trade count. Everything here
 * is therefore a partial update to be merged onto whatever the REST poll last
 * returned, rather than a whole `ParsedTickerData`.
 */

import type { ParsedTickerData } from "./types";

/** The fields a ticker frame can actually carry. */
export type TickerUpdate = Partial<
  Pick<
    ParsedTickerData,
    | "symbol"
    | "ask"
    | "bid"
    | "last"
    | "volume24h"
    | "vwap24h"
    | "high24h"
    | "low24h"
    | "change24h"
    | "changePercent24h"
  >
>;

/** Kraken sends numbers, but tolerate numeric strings rather than drop a tick. */
const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

/** Copy `source[from]` onto `target[to]` only when it parses to a real number. */
const assignNumber = <K extends keyof TickerUpdate>(
  target: TickerUpdate,
  to: K,
  source: Record<string, unknown>,
  from: string,
): void => {
  const value = toNumber(source[from]);
  if (value !== undefined) {
    (target[to] as number) = value;
  }
};

/**
 * Pull a ticker update out of a raw `ticker` frame.
 *
 * Returns `null` for anything that carries no usable numbers, so a caller can
 * ignore heartbeats, acknowledgements and malformed payloads with one check.
 */
export const parseTickerUpdate = (raw: unknown): TickerUpdate | null => {
  if (typeof raw !== "object" || raw === null) return null;

  const { data } = raw as { data?: unknown };
  // v2 sends an array; accept a bare object too so a single-entry payload from
  // any other Kraken surface still works.
  const entry = Array.isArray(data) ? data[data.length - 1] : data;
  if (typeof entry !== "object" || entry === null) return null;

  const source = entry as Record<string, unknown>;
  const update: TickerUpdate = {};

  if (typeof source.symbol === "string") update.symbol = source.symbol;

  assignNumber(update, "ask", source, "ask");
  assignNumber(update, "bid", source, "bid");
  assignNumber(update, "last", source, "last");
  assignNumber(update, "volume24h", source, "volume");
  assignNumber(update, "vwap24h", source, "vwap");
  assignNumber(update, "high24h", source, "high");
  assignNumber(update, "low24h", source, "low");
  assignNumber(update, "change24h", source, "change");
  assignNumber(update, "changePercent24h", source, "change_pct");

  // A frame with only a symbol tells the UI nothing.
  const hasNumbers = Object.keys(update).some((key) => key !== "symbol");
  return hasNumbers ? update : null;
};

/**
 * Merge a ticker update onto the last known ticker state.
 *
 * `previous` is `null` until the first REST poll lands. Ticks that arrive
 * before it used to be thrown away; instead they seed a record from the update
 * itself, so the price the user sees is the socket's, not the 30s poll's.
 *
 * A frame that cannot establish a price - bid/ask only, or a non-positive
 * `last` - is not allowed to seed, and `previous` is handed straight back. The
 * zero it would otherwise seed reads downstream as a real price of 0, and these
 * numbers become order prices.
 */
export function applyTickerUpdate(
  previous: ParsedTickerData,
  update: TickerUpdate,
): ParsedTickerData;
export function applyTickerUpdate(
  previous: ParsedTickerData | null,
  update: TickerUpdate,
): ParsedTickerData | null;
export function applyTickerUpdate(
  previous: ParsedTickerData | null,
  update: TickerUpdate,
): ParsedTickerData | null {
  // Merging onto an existing record always yields one; only seeding can decline.
  if (previous === null && !(update.last !== undefined && update.last > 0)) {
    return null;
  }

  const base: ParsedTickerData = previous ?? {
    symbol: update.symbol ?? "",
    ask: 0,
    bid: 0,
    last: 0,
    volume24h: 0,
    vwap24h: 0,
    high24h: 0,
    low24h: 0,
    open: 0,
    trades24h: 0,
    change24h: 0,
    changePercent24h: 0,
  };

  const merged: ParsedTickerData = { ...base, ...update };

  // The ticker channel never publishes `open`, so derive the day's change from
  // it whenever we know it and the frame did not state the change itself.
  if (merged.open > 0) {
    if (update.change24h === undefined) {
      merged.change24h = merged.last - merged.open;
    }
    if (update.changePercent24h === undefined) {
      merged.changePercent24h =
        ((merged.last - merged.open) / merged.open) * 100;
    }
  }

  return merged;
}
