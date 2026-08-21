import { describe, it, expect, vi, beforeEach } from "vitest";

// The auth module reads credentials through getKrakenConfig, which in the real
// app resolves them from import.meta.env at build time. Mocking the config module
// keeps the signing tests hermetic and guarantees no real credential is ever
// needed - or read - to run the suite.
vi.mock("@api/config", () => ({
  getKrakenConfig: vi.fn(),
  DEFAULT_SYMBOL: "BTC/USD",
}));

import {
  createAuthHeaders,
  formatPostData,
  generateNonce,
  generateSignature,
  getWebSocketToken,
} from "@api/krakenAuth";
import { getKrakenConfig } from "@api/config";

// =============================================================================
// TEST VECTOR
// =============================================================================

// Published by Kraken in their REST authentication documentation as a worked
// example. The secret is a throwaway the exchange printed for exactly this
// purpose - it is not, and must never be replaced by, a live credential.
const VECTOR = {
  apiSecret:
    "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==",
  apiKey: "test-api-key",
  urlPath: "/0/private/AddOrder",
  nonce: 1616492376594,
  postData:
    "nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25",
  expectedSignature:
    "4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==",
} as const;

const mockConfig = (overrides: Record<string, string> = {}) => {
  vi.mocked(getKrakenConfig).mockReturnValue({
    apiKey: VECTOR.apiKey,
    apiSecret: VECTOR.apiSecret,
    wsUrl: "wss://ws-auth.kraken.com/v2",
    restUrl: "https://api.kraken.com",
    ...overrides,
  });
};

beforeEach(() => {
  mockConfig();
});

// =============================================================================
// SIGNING
// =============================================================================

describe("generateSignature", () => {
  it("reproduces Kraken's published API-Sign vector exactly", async () => {
    await expect(
      generateSignature(VECTOR.urlPath, VECTOR.postData, VECTOR.nonce),
    ).resolves.toBe(VECTOR.expectedSignature);
  });

  it("is deterministic for identical inputs", async () => {
    const [a, b] = await Promise.all([
      generateSignature(VECTOR.urlPath, VECTOR.postData, VECTOR.nonce),
      generateSignature(VECTOR.urlPath, VECTOR.postData, VECTOR.nonce),
    ]);

    expect(a).toBe(b);
  });

  it("changes when the URI path changes", async () => {
    await expect(
      generateSignature("/0/private/CancelOrder", VECTOR.postData, VECTOR.nonce),
    ).resolves.not.toBe(VECTOR.expectedSignature);
  });

  it("changes when the nonce changes", async () => {
    await expect(
      generateSignature(VECTOR.urlPath, VECTOR.postData, VECTOR.nonce + 1),
    ).resolves.not.toBe(VECTOR.expectedSignature);
  });

  it("changes when a single character of the post data changes", async () => {
    await expect(
      generateSignature(
        VECTOR.urlPath,
        VECTOR.postData.replace("37500", "37501"),
        VECTOR.nonce,
      ),
    ).resolves.not.toBe(VECTOR.expectedSignature);
  });

  it("changes when the secret changes", async () => {
    mockConfig({ apiSecret: btoa("a different secret entirely") });

    await expect(
      generateSignature(VECTOR.urlPath, VECTOR.postData, VECTOR.nonce),
    ).resolves.not.toBe(VECTOR.expectedSignature);
  });

  it("produces a 512-bit signature, base64 encoded", async () => {
    const signature = await generateSignature(
      VECTOR.urlPath,
      VECTOR.postData,
      VECTOR.nonce,
    );

    // HMAC-SHA512 is 64 bytes; base64 of 64 bytes is 88 characters with padding.
    expect(atob(signature)).toHaveLength(64);
    expect(signature).toHaveLength(88);
  });

  it("refuses to sign when no secret is configured", async () => {
    mockConfig({ apiSecret: "" });

    await expect(
      generateSignature(VECTOR.urlPath, VECTOR.postData, VECTOR.nonce),
    ).rejects.toThrow("API secret is not configured");
  });

  it("signs an empty body without throwing", async () => {
    await expect(
      generateSignature(VECTOR.urlPath, "", VECTOR.nonce),
    ).resolves.toEqual(expect.any(String));
  });
});

// =============================================================================
// NONCE
// =============================================================================

describe("generateNonce", () => {
  it("returns the clock in microseconds, as Kraken expects", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    expect(generateNonce()).toBe(Date.now() * 1000);
    expect(generateNonce()).toBe(1767225600000000);

    vi.useRealTimers();
  });

  it("never goes backwards as the clock advances", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const first = generateNonce();
    vi.advanceTimersByTime(1);
    const second = generateNonce();

    expect(second).toBeGreaterThan(first);

    vi.useRealTimers();
  });
});

// =============================================================================
// HEADERS
// =============================================================================

describe("createAuthHeaders", () => {
  it("sets the key, the signature and the form content type", async () => {
    const headers = await createAuthHeaders(
      VECTOR.urlPath,
      VECTOR.postData,
      VECTOR.nonce,
    );

    expect(headers.get("API-Key")).toBe(VECTOR.apiKey);
    expect(headers.get("API-Sign")).toBe(VECTOR.expectedSignature);
    expect(headers.get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("propagates the missing-secret failure rather than sending an unsigned request", async () => {
    mockConfig({ apiSecret: "" });

    await expect(
      createAuthHeaders(VECTOR.urlPath, VECTOR.postData, VECTOR.nonce),
    ).rejects.toThrow("API secret is not configured");
  });
});

// =============================================================================
// POST BODY ENCODING
// =============================================================================

describe("formatPostData", () => {
  it("url-encodes the parameters it is given", () => {
    expect(formatPostData({ nonce: 1, pair: "XBT/USD" })).toBe(
      "nonce=1&pair=XBT%2FUSD",
    );
  });

  it("stringifies numbers and booleans", () => {
    expect(formatPostData({ volume: 1.25, validate: true })).toBe(
      "volume=1.25&validate=true",
    );
  });

  it("drops undefined values instead of sending the string 'undefined'", () => {
    expect(formatPostData({ nonce: 1, price: undefined })).toBe("nonce=1");
  });

  it("keeps a deliberately empty value", () => {
    expect(formatPostData({ nonce: 1, userref: "" })).toBe("nonce=1&userref=");
  });

  it("returns an empty string for no parameters", () => {
    expect(formatPostData({})).toBe("");
  });
});

// =============================================================================
// WEBSOCKET TOKEN
// =============================================================================

describe("getWebSocketToken", () => {
  const okResponse = (body: unknown) =>
    ({
      ok: true,
      statusText: "OK",
      json: async () => body,
    }) as Response;

  it("posts a signed, nonce-bearing request and returns the token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse({ error: [], result: { token: "tok-1" } }));

    await expect(getWebSocketToken()).resolves.toBe("tok-1");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.kraken.com/0/private/GetWebSocketsToken");
    expect(init?.method).toBe("POST");
    expect(init?.body).toMatch(/^nonce=\d+$/);

    // The body must be signed with the same nonce it carries, or Kraken rejects it.
    const nonce = String(init?.body).split("=")[1];
    const headers = init?.headers as Headers;
    expect(headers.get("API-Sign")).toBe(
      await generateSignature(
        "/0/private/GetWebSocketsToken",
        `nonce=${nonce}`,
        Number(nonce),
      ),
    );
  });

  it("surfaces a transport failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      statusText: "Service Unavailable",
    } as Response);

    await expect(getWebSocketToken()).rejects.toThrow(
      "Failed to get WebSocket token: Service Unavailable",
    );
  });

  it("surfaces the exchange's own error list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse({ error: ["EAPI:Invalid key", "EGeneral:Permission denied"] }),
    );

    await expect(getWebSocketToken()).rejects.toThrow(
      "Kraken API error: EAPI:Invalid key, EGeneral:Permission denied",
    );
  });

  it("rejects a success-shaped response that carries no token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse({ error: [], result: {} }),
    );

    await expect(getWebSocketToken()).rejects.toThrow("No token in response");
  });
});
