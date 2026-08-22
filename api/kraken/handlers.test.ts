import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

import statusHandler from "./status";
import balanceHandler from "./balance";
import wsTokenHandler from "./ws-token";

// =============================================================================
// A ServerResponse stand-in
// =============================================================================

interface FakeResponse extends ServerResponse {
  readonly capturedHeaders: Record<string, string>;
  readonly json: () => unknown;
}

const createResponse = (): FakeResponse => {
  const capturedHeaders: Record<string, string> = {};
  let payload = "";

  const res = {
    statusCode: 200,
    headersSent: false,
    capturedHeaders,
    setHeader(name: string, value: unknown) {
      capturedHeaders[name] = String(value);
    },
    end(body?: string) {
      payload = body ?? "";
      (res as { headersSent: boolean }).headersSent = true;
    },
    json: () => JSON.parse(payload) as unknown,
  };

  return res as unknown as FakeResponse;
};

const request = (method: string, remoteAddress = "127.0.0.1"): IncomingMessage =>
  ({ method, socket: { remoteAddress } }) as IncomingMessage;

// =============================================================================
// Environment
// =============================================================================

const CREDENTIAL_VARS = [
  "KRAKEN_API_KEY",
  "KRAKEN_API_PRIVATE_KEY",
  "KRAKEN_TRADING_MODE",
  "KRAKEN_ALLOW_LOCAL_LIVE",
  "VERCEL_ENV",
  "VERCEL",
  "AWS_LAMBDA_FUNCTION_NAME",
  "LAMBDA_TASK_ROOT",
];

const SECRET =
  "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==";

const goLive = () => {
  vi.stubEnv("KRAKEN_TRADING_MODE", "live");
  vi.stubEnv("KRAKEN_ALLOW_LOCAL_LIVE", "1");
  vi.stubEnv("KRAKEN_API_KEY", "test-api-key");
  vi.stubEnv("KRAKEN_API_PRIVATE_KEY", SECRET);
};

beforeEach(() => {
  // The suite must not inherit a developer's real environment, and CI and a
  // laptop have to agree on what these handlers see.
  for (const name of CREDENTIAL_VARS) vi.stubEnv(name, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const okResponse = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  }) as Response;

// =============================================================================
// STATUS
// =============================================================================

describe("GET /api/kraken/status", () => {
  it("reports simulation, and no credential, when nothing is configured", async () => {
    const res = createResponse();
    await statusHandler(request("GET"), res);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      mode: "simulation",
      liveAvailable: false,
      errors: [],
    });
  });

  it("reports live when the server is configured to sign", async () => {
    goLive();
    const res = createResponse();
    await statusHandler(request("GET"), res);

    expect(res.json()).toMatchObject({ mode: "live", liveAvailable: true });
  });

  it("never puts a credential in the response", async () => {
    goLive();
    const res = createResponse();
    await statusHandler(request("GET"), res);

    const body = JSON.stringify(res.json());
    expect(body).not.toContain("test-api-key");
    expect(body).not.toContain(SECRET);
  });

  it("answers 503 and refuses live when the configuration is ambiguous", async () => {
    vi.stubEnv("KRAKEN_TRADING_MODE", "live"); // no credentials
    const res = createResponse();
    await statusHandler(request("GET"), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      mode: "misconfigured",
      liveAvailable: false,
    });
  });

  it("refuses live on the public deployment however it is configured", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    goLive();
    const res = createResponse();
    await statusHandler(request("GET"), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ mode: "misconfigured", liveAvailable: false });
  });

  it("is never cached", async () => {
    const res = createResponse();
    await statusHandler(request("GET"), res);

    expect(res.capturedHeaders["Cache-Control"]).toBe("no-store");
  });

  it("rejects a method it does not implement", async () => {
    const res = createResponse();
    await statusHandler(request("POST"), res);

    expect(res.statusCode).toBe(405);
    expect(res.capturedHeaders["Allow"]).toBe("GET");
  });
});

// =============================================================================
// BALANCE - the authenticated read that proves the boundary
// =============================================================================

describe("GET /api/kraken/balance", () => {
  it("signs the request server-side and returns only the balances", async () => {
    goLive();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse({ error: [], result: { ZUSD: "100.0000" } }));

    const res = createResponse();
    await balanceHandler(request("GET"), res);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ balances: { ZUSD: "100.0000" } });

    // The signature went to Kraken; nothing about it came back to the browser.
    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["API-Sign"]).toEqual(expect.any(String));
    expect(JSON.stringify(res.json())).not.toContain(headers["API-Sign"]);
  });

  it("refuses in simulation mode without calling Kraken at all", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = createResponse();
    await balanceHandler(request("GET"), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ mode: "simulation" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses when the configuration is ambiguous", async () => {
    vi.stubEnv("KRAKEN_TRADING_MODE", "live");
    vi.stubEnv("KRAKEN_API_KEY", "test-api-key"); // secret missing
    const res = createResponse();
    await balanceHandler(request("GET"), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ mode: "misconfigured" });
  });

  it("refuses a request that did not come from this machine", async () => {
    // The bind is not the only thing standing between a live server and the
    // network, because the bind is not always ours to choose.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await balanceHandler(request("GET", "203.0.113.7"), res);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      error: expect.stringContaining("loopback"),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("serves the IPv6 loopback and its IPv4-mapped form", async () => {
    goLive();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse({ error: [], result: { ZUSD: "1.0" } }),
    );

    for (const address of ["::1", "::ffff:127.0.0.1"]) {
      const res = createResponse();
      await balanceHandler(request("GET", address), res);
      expect(res.statusCode).toBe(200);
    }
  });

  it("refuses when the peer address cannot be read at all", async () => {
    // A guard that cannot see who is calling has to assume the worst.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = createResponse();
    await balanceHandler({ method: "GET" } as IncomingMessage, res);

    expect(res.statusCode).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes a Kraken-side failure through as a 502", async () => {
    goLive();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse({ error: ["EAPI:Invalid key"] }),
    );

    const res = createResponse();
    await balanceHandler(request("GET"), res);

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: expect.stringContaining("EAPI:Invalid key") });
  });
});

// =============================================================================
// WEBSOCKET TOKEN
// =============================================================================

describe("POST /api/kraken/ws-token", () => {
  it("returns the token the exchange minted", async () => {
    goLive();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse({ error: [], result: { token: "tok-1", expires: 900 } }),
    );

    const res = createResponse();
    await wsTokenHandler(request("POST"), res);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ token: "tok-1", expires: 900 });
  });

  it("rejects a success-shaped response that carries no token", async () => {
    goLive();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse({ error: [], result: {} }),
    );

    const res = createResponse();
    await wsTokenHandler(request("POST"), res);

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "No token in response" });
  });

  it("refuses in simulation mode", async () => {
    const res = createResponse();
    await wsTokenHandler(request("POST"), res);

    expect(res.statusCode).toBe(503);
  });

  it("refuses to mint a token for a request from off this machine", async () => {
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await wsTokenHandler(request("POST", "10.0.0.4"), res);

    expect(res.statusCode).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is a POST, because every call burns a nonce", async () => {
    const res = createResponse();
    await wsTokenHandler(request("GET"), res);

    expect(res.statusCode).toBe(405);
    expect(res.capturedHeaders["Allow"]).toBe("POST");
  });
});
