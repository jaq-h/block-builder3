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

const request = (
  method: string,
  remoteAddress = "127.0.0.1",
  host: string | undefined = "localhost:3002",
): IncomingMessage =>
  ({ method, socket: { remoteAddress }, headers: { host } }) as IncomingMessage;

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

  it("reports live to a caller on this machine when the server is configured to sign", async () => {
    goLive();
    const res = createResponse();
    await statusHandler(request("GET", "127.0.0.1"), res);

    expect(res.json()).toMatchObject({ mode: "live", liveAvailable: true });
  });

  it("tells a caller off this machine that it simulates, because that is what it gets", async () => {
    // Live mode is loopback only. Answering `live` to a peer whose every
    // credentialed call comes back 403 would label its orders "Live API Mode",
    // and would tell an anonymous visitor that this host holds a Kraken key.
    goLive();
    const res = createResponse();
    await statusHandler(request("GET", "203.0.113.7"), res);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      mode: "simulation",
      liveAvailable: false,
      errors: [],
    });
  });

  it("agrees with what the credentialed endpoints do for the same caller", async () => {
    goLive();
    const remote = () => request("GET", "198.51.100.4");

    const status = createResponse();
    await statusHandler(remote(), status);

    const balance = createResponse();
    await balanceHandler(remote(), balance);

    expect(status.json()).toMatchObject({ liveAvailable: false });
    expect(balance.statusCode).toBe(403);
  });

  it("tells a DNS-rebound caller that it simulates, though its peer address is loopback", async () => {
    // The attacker's page re-resolved its own hostname to 127.0.0.1, so the peer
    // address looks local. The Host header is what gives it away.
    goLive();
    const res = createResponse();
    await statusHandler(request("GET", "127.0.0.1", "kraken-rebind.example"), res);

    expect(res.json()).toMatchObject({ mode: "simulation", liveAvailable: false });
  });

  it("simulates when the peer address cannot be read at all", async () => {
    goLive();
    const res = createResponse();
    await statusHandler({ method: "GET" } as IncomingMessage, res);

    expect(res.json()).toMatchObject({ mode: "simulation", liveAvailable: false });
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

  it("serves every loopback host a browser actually addresses", async () => {
    goLive();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse({ error: [], result: { ZUSD: "1.0" } }),
    );

    for (const host of ["localhost", "localhost:3002", "127.0.0.1:3002", "[::1]:3002"]) {
      const res = createResponse();
      await balanceHandler(request("GET", "127.0.0.1", host), res);
      expect(res.statusCode).toBe(200);
    }
  });

  it("refuses a DNS rebind, whose peer address is loopback but whose Host is not", async () => {
    // The attack the peer-address check alone does not stop: an attacker's page
    // re-resolves its own hostname to 127.0.0.1, so the request arrives from
    // loopback, is same-origin to that page, and would hand it the account.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await balanceHandler(request("GET", "127.0.0.1", "kraken-rebind.example"), res);

    expect(res.statusCode).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a Host header that is malformed rather than guessing at it", async () => {
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    for (const host of ["", "   ", "localhost@evil.example", "evil.example/localhost"]) {
      const res = createResponse();
      await balanceHandler(request("GET", "127.0.0.1", host), res);
      expect(res.statusCode).toBe(403);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a request carrying no Host header at all", async () => {
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await balanceHandler(
      { method: "GET", socket: { remoteAddress: "127.0.0.1" }, headers: {} } as IncomingMessage,
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it("refuses to mint a token for a DNS-rebound page", async () => {
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await wsTokenHandler(request("POST", "127.0.0.1", "kraken-rebind.example"), res);

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
