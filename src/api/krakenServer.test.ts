import { describe, it, expect, vi, afterEach } from "vitest";

import {
  BALANCE_ENDPOINT,
  fetchBalances,
  getWebSocketToken,
  WS_TOKEN_ENDPOINT,
} from "./krakenServer";

const jsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "Service Unavailable",
    json: async () => body,
  }) as Response;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getWebSocketToken", () => {
  it("posts to this app's own endpoint, never to Kraken", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { token: "tok-1" }));

    await expect(getWebSocketToken()).resolves.toBe("tok-1");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(WS_TOKEN_ENDPOINT);
    expect(String(url)).not.toContain("kraken.com");
    expect(init?.method).toBe("POST");
    // No signing material of any kind leaves the browser.
    expect(JSON.stringify(init?.headers ?? {})).not.toContain("API-Sign");
  });

  it("surfaces the server's refusal message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(503, {
        mode: "simulation",
        errors: ["This deployment runs in simulation mode and holds no Kraken credentials."],
      }),
    );

    await expect(getWebSocketToken()).rejects.toThrow(
      "This deployment runs in simulation mode",
    );
  });

  it("falls back to the status line when the server sent no message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => {
        throw new SyntaxError("no body");
      },
    } as unknown as Response);

    await expect(getWebSocketToken()).rejects.toThrow(
      "Failed to get WebSocket token: 503 Service Unavailable",
    );
  });

  it("rejects a success-shaped response that carries no token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, {}));

    await expect(getWebSocketToken()).rejects.toThrow("No token in response");
  });
});

describe("fetchBalances", () => {
  it("reads the balances the server signed for", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { balances: { ZUSD: "100.0000" } }));

    await expect(fetchBalances()).resolves.toEqual({ ZUSD: "100.0000" });
    expect(fetchSpy.mock.calls[0][0]).toBe(BALANCE_ENDPOINT);
  });

  it("surfaces a refusal rather than pretending the account is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(503, { mode: "misconfigured", errors: ["KRAKEN_TRADING_MODE=live requires KRAKEN_API_KEY to be set."] }),
    );

    await expect(fetchBalances()).rejects.toThrow("KRAKEN_TRADING_MODE=live requires");
  });

  it("rejects a response with no balances in it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, {}));

    await expect(fetchBalances()).rejects.toThrow("No balances in response");
  });
});
