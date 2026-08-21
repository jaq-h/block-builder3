/**
 * The browser's view of what the server will and will not do.
 *
 * The server decides whether this deployment may trade for real; the browser
 * only asks. This module holds that answer in a module-level store so the
 * non-React callers (the WebSocket manager, the orders store) can read it
 * synchronously, and so React can subscribe to it through
 * `useTradingMode` without prop-drilling it through the tree.
 *
 * The default is deliberately the safe one: until the server has answered,
 * live trading is unavailable and the app simulates. A network failure, a
 * misconfigured deployment and a hostile response all land in the same place.
 */

export type TradingMode = "unknown" | "simulation" | "live" | "misconfigured";

export interface TradingModeStatus {
  mode: TradingMode;
  /** True only when the server has said, in this session, that it will sign. */
  liveAvailable: boolean;
  /** Configuration problems the server reported, for display and for the console. */
  errors: string[];
}

export const STATUS_ENDPOINT = "/api/kraken/status";

const UNKNOWN: TradingModeStatus = {
  mode: "unknown",
  liveAvailable: false,
  errors: [],
};

let status: TradingModeStatus = UNKNOWN;
let inFlight: Promise<TradingModeStatus> | null = null;
let settled = false;
const listeners = new Set<() => void>();

const setStatus = (next: TradingModeStatus): TradingModeStatus => {
  status = next;
  for (const listener of listeners) listener();
  return status;
};

export const getTradingModeStatus = (): TradingModeStatus => status;

/**
 * Synchronous gate used by the non-React callers. False until proven otherwise.
 */
export const isLiveTradingAvailable = (): boolean => status.liveAvailable;

export const subscribeTradingMode = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Ask the server. Concurrent callers share one request, and once the server has
 * given a definitive answer it is kept for the rest of the page's life - every
 * component that mounts can call this freely.
 *
 * A request that never reached the server is not definitive, so the next caller
 * retries rather than leaving the app stuck in a fallback for a blip.
 */
export const loadTradingMode = (): Promise<TradingModeStatus> => {
  if (settled) return Promise.resolve(status);

  inFlight ??= requestTradingMode().finally(() => {
    inFlight = null;
  });

  return inFlight;
};

const requestTradingMode = async (): Promise<TradingModeStatus> => {
  let response: Response;
  try {
    response = await fetch(STATUS_ENDPOINT, {
      headers: { Accept: "application/json" },
    });
  } catch {
    // No server boundary reachable - for instance a purely static host with no
    // functions. Simulation is the only honest answer, and the next caller may
    // try again because nothing here came from the server.
    return setStatus({
      mode: "simulation",
      liveAvailable: false,
      errors: ["Could not reach the trading-mode endpoint; simulating."],
    });
  }

  settled = true;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return setStatus({
      mode: "simulation",
      liveAvailable: false,
      errors: ["The trading-mode endpoint did not return JSON; simulating."],
    });
  }

  const parsed = body as Partial<TradingModeStatus> | null;
  const errors = Array.isArray(parsed?.errors) ? parsed.errors.map(String) : [];

  if (parsed?.mode === "misconfigured" || !response.ok) {
    if (errors.length > 0) {
      console.error("Kraken trading mode is misconfigured:", errors.join(" "));
    }
    return setStatus({ mode: "misconfigured", liveAvailable: false, errors });
  }

  // `liveAvailable` is believed only when the server also says it is live, so a
  // malformed or truncated response cannot enable live mode by accident.
  const liveAvailable = parsed?.mode === "live" && parsed?.liveAvailable === true;

  return setStatus({
    mode: parsed?.mode === "live" ? "live" : "simulation",
    liveAvailable,
    errors,
  });
};

/** Test seam: drops the cached answer and every subscriber. */
export const resetTradingMode = (): void => {
  status = UNKNOWN;
  inFlight = null;
  settled = false;
  listeners.clear();
};
