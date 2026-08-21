import { describe, it, expect } from "vitest";

import { parseTickerUpdate, applyTickerUpdate } from "@api/tickerUpdate";
import type { ParsedTickerData } from "@api/types";

// A ticker frame as Kraken v2 actually sends it: `data` is an array, and the
// values are numbers, not the strings the REST endpoint returns.
const frame = (fields: Record<string, unknown>) => ({
  channel: "ticker",
  type: "update",
  data: [{ symbol: "BTC/USD", ...fields }],
});

const restSnapshot: ParsedTickerData = {
  symbol: "BTC/USD",
  ask: 100,
  bid: 99,
  last: 99.5,
  volume24h: 1000,
  vwap24h: 99.7,
  high24h: 105,
  low24h: 95,
  open: 100,
  trades24h: 4200,
  change24h: -0.5,
  changePercent24h: -0.5,
};

// =============================================================================
// PARSING
// =============================================================================

describe("parseTickerUpdate", () => {
  it("reads the array payload Kraken v2 actually sends", () => {
    expect(parseTickerUpdate(frame({ last: 101.25 }))).toEqual({
      symbol: "BTC/USD",
      last: 101.25,
    });
  });

  it("takes every field the frame carries, not just the last price", () => {
    // Copying only `last` left bid, ask and volume frozen at whatever the REST
    // poll returned, so the "live" numbers were 30 seconds stale.
    const update = parseTickerUpdate(
      frame({
        bid: 98.5,
        ask: 99.5,
        last: 99,
        volume: 1234.5,
        vwap: 98.9,
        high: 110,
        low: 90,
        change: -1,
        change_pct: -1.01,
      }),
    );

    expect(update).toEqual({
      symbol: "BTC/USD",
      bid: 98.5,
      ask: 99.5,
      last: 99,
      volume24h: 1234.5,
      vwap24h: 98.9,
      high24h: 110,
      low24h: 90,
      change24h: -1,
      changePercent24h: -1.01,
    });
  });

  it("accepts a bare object payload as well as an array", () => {
    expect(
      parseTickerUpdate({ channel: "ticker", data: { last: 7 } }),
    ).toEqual({ last: 7 });
  });

  it("uses the newest entry when a frame batches several", () => {
    expect(
      parseTickerUpdate({
        channel: "ticker",
        data: [{ last: 1 }, { last: 2 }, { last: 3 }],
      }),
    ).toEqual({ last: 3 });
  });

  it("tolerates numeric strings rather than dropping the tick", () => {
    expect(parseTickerUpdate(frame({ last: "101.25" }))).toEqual({
      symbol: "BTC/USD",
      last: 101.25,
    });
  });

  it.each([
    ["a heartbeat with no data", { channel: "heartbeat" }],
    ["an empty data array", { channel: "ticker", data: [] }],
    ["a frame with only a symbol", frame({})],
    ["unparseable numbers", frame({ last: "not-a-price" })],
    ["a non-finite number", frame({ last: Number.NaN })],
    ["null", null],
    ["a string", "ticker"],
  ])("returns null for %s", (_label, payload) => {
    expect(parseTickerUpdate(payload)).toBeNull();
  });
});

// =============================================================================
// MERGING
// =============================================================================

describe("applyTickerUpdate", () => {
  it("keeps a tick that arrives before the first REST poll", () => {
    // Returning `prev` when `prev` was null threw away every tick until the
    // 30s poll landed, which is what made the socket feed look dead.
    const result = applyTickerUpdate(null, { symbol: "BTC/USD", last: 101 });

    expect(result).toMatchObject({ last: 101, symbol: "BTC/USD" });
  });

  it.each([
    ["carries no price at all", { symbol: "BTC/USD", bid: 100, ask: 101 }],
    ["states a zero price", { symbol: "BTC/USD", last: 0, bid: 100 }],
  ])("declines to seed a record from a frame that %s", (_label, update) => {
    // Seeding `last: 0` here reaches the grid as a real price of 0, and these
    // numbers are order prices. There is no price yet, so say so.
    expect(applyTickerUpdate(null, update)).toBeNull();
  });

  it("still merges a bid-only frame onto a record that has a price", () => {
    const result = applyTickerUpdate(restSnapshot, { bid: 90 });

    expect(result).toMatchObject({ bid: 90, last: restSnapshot.last });
  });

  it("leaves fields the frame did not mention alone", () => {
    const result = applyTickerUpdate(restSnapshot, { last: 101 });

    expect(result.last).toBe(101);
    expect(result.trades24h).toBe(restSnapshot.trades24h);
    expect(result.open).toBe(restSnapshot.open);
  });

  it("moves bid, ask and volume with the socket, not the poll", () => {
    const result = applyTickerUpdate(restSnapshot, {
      bid: 90,
      ask: 91,
      volume24h: 2000,
    });

    expect(result).toMatchObject({ bid: 90, ask: 91, volume24h: 2000 });
  });

  it("recomputes the day's change from the new price", () => {
    const result = applyTickerUpdate(restSnapshot, { last: 110 });

    expect(result.change24h).toBe(10);
    expect(result.changePercent24h).toBe(10);
  });

  it("prefers the change the frame states over a derived one", () => {
    const result = applyTickerUpdate(restSnapshot, {
      last: 110,
      change24h: 9,
      changePercent24h: 9.1,
    });

    expect(result.change24h).toBe(9);
    expect(result.changePercent24h).toBe(9.1);
  });

  it("does not divide by an unknown opening price", () => {
    const result = applyTickerUpdate(null, { last: 101 });

    expect(result).toMatchObject({ change24h: 0, changePercent24h: 0 });
  });

  it("does not mutate the previous ticker record", () => {
    const previous = { ...restSnapshot };
    applyTickerUpdate(previous, { last: 500 });

    expect(previous).toEqual(restSnapshot);
  });
});
