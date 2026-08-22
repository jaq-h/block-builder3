import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

import statusHandler from "./status";
import balanceHandler from "./balance";
import wsTokenHandler from "./ws-token";
import { API_REQUEST_HEADERS } from "../../src/api/appRequestHeader";

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

/**
 * The headers the client really sends, lowercased the way Node delivers them.
 * Taken from the client's own constant rather than retyped, because the header
 * name is one contract held in two trees that may not import each other: a
 * rename on either side has to fail here rather than in a browser.
 */
const APP_HEADERS: Record<string, string> = Object.fromEntries(
  Object.entries(API_REQUEST_HEADERS).map(([name, value]) => [
    name.toLowerCase(),
    value,
  ]),
);

/** What the app's own page sends, and what a foreign page sends instead. */
const SAME_ORIGIN = { ...APP_HEADERS, "sec-fetch-site": "same-origin" };
const CROSS_SITE = { ...APP_HEADERS, "sec-fetch-site": "cross-site" };

const request = (
  method: string,
  remoteAddress = "127.0.0.1",
  host: string | undefined = "localhost:3002",
  headers: Record<string, string> = SAME_ORIGIN,
): IncomingMessage =>
  ({
    method,
    socket: { remoteAddress },
    headers: { host, ...headers },
  }) as IncomingMessage;

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
    // credentialed call is refused would label its orders "Live API Mode",
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

  it("leaves a remote caller unable to tell a live host from a simulating one", async () => {
    // The disclosure this closes: status saying "simulation" is worth nothing if
    // the next endpoint answers "this endpoint holds a Kraken credential". Every
    // reply a stranger can obtain has to be byte-identical on both hosts.
    const remote = () => request("GET", "198.51.100.4");
    const remotePost = () => request("POST", "198.51.100.4");

    const probe = async () => {
      const status = createResponse();
      await statusHandler(remote(), status);

      const balance = createResponse();
      await balanceHandler(remote(), balance);

      const token = createResponse();
      await wsTokenHandler(remotePost(), token);

      return [status, balance, token].map((res) => ({
        statusCode: res.statusCode,
        body: res.json(),
      }));
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const simulating = await probe();
    goLive();
    const live = await probe();

    expect(live).toEqual(simulating);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("tells a DNS-rebound caller that it simulates, though its peer address is loopback", async () => {
    // The attacker's page re-resolved its own hostname to 127.0.0.1, so the peer
    // address looks local. The Host header is what gives it away.
    goLive();
    const res = createResponse();
    await statusHandler(request("GET", "127.0.0.1", "kraken-rebind.example"), res);

    expect(res.json()).toMatchObject({ mode: "simulation", liveAvailable: false });
  });

  it("tells a headerless local caller that it simulates, as the credentialed endpoints do", async () => {
    // Status has to agree with what the caller would actually be served, and an
    // img tag or a form post is served nothing.
    goLive();
    const res = createResponse();
    await statusHandler(request("GET", "127.0.0.1", "localhost:3002", {}), res);

    expect(res.json()).toEqual({
      mode: "simulation",
      liveAvailable: false,
      errors: [],
    });
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

    expect(res.statusCode).toBe(503);
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

  it("refuses a cross-site caller even when it does present the app header", async () => {
    // The independent proof of the origin check: this request satisfies the peer
    // address, the Host header and the app header, and is refused on
    // Sec-Fetch-Site alone. Nothing here rests on the header being hard to set.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await balanceHandler(
      request("GET", "127.0.0.1", "localhost:3002", {
        ...CROSS_SITE,
        accept: "application/json",
        origin: "http://evil.example",
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin fetch that sends only CORS-safelisted headers", async () => {
    // The shape that triggers no preflight, and therefore the shape a foreign
    // page can actually send: Accept alone, from the operator's own machine,
    // naming the genuine loopback host. It carries no app header, because it
    // could not.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await balanceHandler(
      request("GET", "127.0.0.1", "localhost:3002", {
        accept: "application/json",
        origin: "http://evil.example",
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin caller identified by Origin alone", async () => {
    // Older browsers send no Sec-Fetch-Site, so Origin is the fallback.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await balanceHandler(
      request("GET", "127.0.0.1", "localhost:3002", {
        ...APP_HEADERS,
        origin: "http://evil.example",
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("serves the app's own page, and a script that sends the app's header", async () => {
    goLive();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse({ error: [], result: { ZUSD: "1.0" } }),
    );

    const callers: Record<string, string>[] = [
      // The app itself, on both header generations.
      SAME_ORIGIN,
      { ...APP_HEADERS, origin: "http://localhost:3002" },
      // A user-typed address, and curl, which sends neither origin header.
      { ...APP_HEADERS, "sec-fetch-site": "none" },
      APP_HEADERS,
    ];

    for (const headers of callers) {
      const res = createResponse();
      await balanceHandler(request("GET", "127.0.0.1", "localhost:3002", headers), res);
      expect(res.statusCode).toBe(200);
    }
  });

  it("refuses an otherwise perfect same-origin call that omits the app header", async () => {
    // The header is what the guard rests on now, so its absence alone has to be
    // enough to refuse: everything else about this request is the app's.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await balanceHandler(
      request("GET", "127.0.0.1", "localhost:3002", {
        "sec-fetch-site": "same-origin",
        accept: "application/json",
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ mode: "simulation" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses an img tag on a page the operator visited, which sets no header at all", async () => {
    // The shape the old "neither header present, so this is curl" fallback let
    // through: `<img src="http://localhost:3002/api/kraken/balance">` on
    // evil.example, in a browser predating Fetch Metadata (Safari below 16.4).
    // A no-cors GET carries no Origin and that browser sends no Sec-Fetch-Site,
    // so the peer address and the Host header look exactly like the operator's.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await balanceHandler(request("GET", "127.0.0.1", "localhost:3002", {}), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ mode: "simulation" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a DNS rebind, whose peer address is loopback but whose Host is not", async () => {
    // The attack the peer-address check alone does not stop: an attacker's page
    // re-resolves its own hostname to 127.0.0.1, so the request arrives from
    // loopback, is same-origin to that page, and would hand it the account.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await balanceHandler(request("GET", "127.0.0.1", "kraken-rebind.example"), res);

    expect(res.statusCode).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a Host header that is malformed rather than guessing at it", async () => {
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    for (const host of ["", "   ", "localhost@evil.example", "evil.example/localhost"]) {
      const res = createResponse();
      await balanceHandler(request("GET", "127.0.0.1", host), res);
      expect(res.statusCode).toBe(503);
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

    expect(res.statusCode).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses when the peer address cannot be read at all", async () => {
    // A guard that cannot see who is calling has to assume the worst.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = createResponse();
    await balanceHandler({ method: "GET" } as IncomingMessage, res);

    expect(res.statusCode).toBe(503);
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

    expect(res.statusCode).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses to mint a token for a cross-origin page, burning no nonce", async () => {
    // The finding this closes: a page the operator merely visited could spend
    // their Kraken nonce and rate limit even though it could not read the token.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await wsTokenHandler(
      request("POST", "127.0.0.1", "localhost:3002", {
        ...CROSS_SITE,
        accept: "application/json",
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a form post from a page the operator visited, which sets no header either", async () => {
    // `<form method="post" action="http://localhost:3002/api/kraken/ws-token">`
    // submits cross-origin with no scripting and no preflight, and on a browser
    // that sends no Fetch Metadata it names no origin either. Every call to this
    // endpoint burns a Kraken nonce, which is what makes refusing it matter even
    // though the attacker could never read the token.
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await wsTokenHandler(
      request("POST", "127.0.0.1", "localhost:3002", {
        "content-type": "application/x-www-form-urlencoded",
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ mode: "simulation" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses to mint a token for a DNS-rebound page", async () => {
    goLive();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = createResponse();
    await wsTokenHandler(request("POST", "127.0.0.1", "kraken-rebind.example"), res);

    expect(res.statusCode).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is a POST, because every call burns a nonce", async () => {
    const res = createResponse();
    await wsTokenHandler(request("GET"), res);

    expect(res.statusCode).toBe(405);
    expect(res.capturedHeaders["Allow"]).toBe("POST");
  });
});
