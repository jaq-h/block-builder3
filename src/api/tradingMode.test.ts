import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  getTradingModeStatus,
  isLiveTradingAvailable,
  loadTradingMode,
  resetTradingMode,
  STATUS_ENDPOINT,
  subscribeTradingMode,
} from "./tradingMode";

const jsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  }) as Response;

beforeEach(() => {
  resetTradingMode();
});

afterEach(() => {
  resetTradingMode();
  vi.restoreAllMocks();
});

describe("the default before the server has answered", () => {
  it("is simulation, so nothing can trade on an unanswered question", () => {
    expect(isLiveTradingAvailable()).toBe(false);
    expect(getTradingModeStatus()).toEqual({
      mode: "unknown",
      liveAvailable: false,
      errors: [],
    });
  });
});

describe("loadTradingMode", () => {
  it("adopts a live answer from the server", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { mode: "live", liveAvailable: true, errors: [] }),
    );

    await loadTradingMode();

    expect(isLiveTradingAvailable()).toBe(true);
    expect(getTradingModeStatus().mode).toBe("live");
  });

  it("asks the endpoint the server actually serves", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { mode: "simulation" }));

    await loadTradingMode();

    expect(fetchSpy).toHaveBeenCalledWith(STATUS_ENDPOINT, expect.anything());
  });

  it("refuses to believe `liveAvailable` without a live mode beside it", async () => {
    // A truncated, cached or tampered response must not be able to unlock live
    // trading in the UI.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { liveAvailable: true }),
    );

    await loadTradingMode();

    expect(isLiveTradingAvailable()).toBe(false);
    expect(getTradingModeStatus().mode).toBe("simulation");
  });

  it("records a misconfigured server without enabling anything", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(503, {
        mode: "misconfigured",
        liveAvailable: false,
        errors: ["KRAKEN_TRADING_MODE=live requires KRAKEN_API_KEY to be set."],
      }),
    );

    await loadTradingMode();

    expect(getTradingModeStatus()).toMatchObject({
      mode: "misconfigured",
      liveAvailable: false,
    });
    expect(getTradingModeStatus().errors).toHaveLength(1);
  });

  it("falls back to simulation when there is no endpoint to ask", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Failed to fetch"));

    await loadTradingMode();

    expect(getTradingModeStatus().mode).toBe("simulation");
    expect(isLiveTradingAvailable()).toBe(false);
  });

  it("falls back to simulation when a static host answers with HTML", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);

    await loadTradingMode();

    expect(getTradingModeStatus().mode).toBe("simulation");
  });

  it("asks the server once, however many callers want the answer", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { mode: "simulation" }));

    await Promise.all([loadTradingMode(), loadTradingMode()]);
    await loadTradingMode();

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("retries after a failure that never reached the server", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(jsonResponse(200, { mode: "live", liveAvailable: true }));

    await loadTradingMode();
    expect(isLiveTradingAvailable()).toBe(false);

    await loadTradingMode();
    expect(isLiveTradingAvailable()).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("subscribeTradingMode", () => {
  it("notifies subscribers when the answer arrives, and stops on unsubscribe", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { mode: "live", liveAvailable: true }),
    );

    const listener = vi.fn();
    const unsubscribe = subscribeTradingMode(listener);

    await loadTradingMode();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    resetTradingMode();
    await loadTradingMode();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("hands out a stable snapshot between changes, as useSyncExternalStore requires", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { mode: "simulation" }),
    );

    await loadTradingMode();

    expect(getTradingModeStatus()).toBe(getTradingModeStatus());
  });
});
