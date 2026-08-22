// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { useKrakenAPI } from "./useKrakenAPI";
import {
  getWebSocketManager,
  resetWebSocketManager,
  resetTradingMode,
  STATUS_ENDPOINT,
} from "@/api";

/**
 * The private socket opens on the server's answer, not on mount.
 *
 * `GET /api/kraken/status` cannot have resolved by the time the first component
 * mounts, so a mount-scoped connect reads "no credentials" and never opens the
 * private socket at all. These tests hold the status response open across the
 * mount to reproduce exactly that ordering.
 */

const Probe = () => {
  useKrakenAPI({ autoConnect: true, pollInterval: 0 });
  return null;
};

/** A status response the test hands over only when it chooses to. */
const deferredStatus = (body: unknown) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes(STATUS_ENDPOINT)) {
      await gate;
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as Response;
    }

    // The ticker poll. Irrelevant here, and answered so nothing rejects.
    return {
      ok: true,
      status: 200,
      json: async () => ({ error: [], result: {} }),
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return { release };
};

let connectPrivate: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetTradingMode();
  resetWebSocketManager();

  const manager = getWebSocketManager();
  vi.spyOn(manager, "subscribeTicker").mockResolvedValue(undefined);
  connectPrivate = vi
    .spyOn(manager, "connectPrivate")
    .mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTradingMode();
  resetWebSocketManager();
});

describe("useKrakenAPI's private socket", () => {
  it("connects once the server reports live, though it mounted before the answer", async () => {
    const { release } = deferredStatus({
      mode: "live",
      liveAvailable: true,
      errors: [],
    });

    render(<Probe />);

    // The regression: at this point the hook has mounted and run its effects
    // with `liveAvailable` still false.
    await waitFor(() => expect(connectPrivate).not.toHaveBeenCalled());

    release();

    await waitFor(() => expect(connectPrivate).toHaveBeenCalled());
  });

  it("never connects when the server reports simulation", async () => {
    const { release } = deferredStatus({
      mode: "simulation",
      liveAvailable: false,
      errors: [],
    });

    render(<Probe />);
    release();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(connectPrivate).not.toHaveBeenCalled();
  });
});
