import { describe, it, expect, vi } from "vitest";

import {
  createAuthHeaders,
  createNonceSource,
  formatPostData,
  generateNonce,
  generateSignature,
} from "./krakenSigning";

// =============================================================================
// TEST VECTOR
// =============================================================================

// Published by Kraken in their REST authentication documentation as a worked
// example. The secret is a throwaway the exchange printed for exactly this
// purpose - it is not, and must never be replaced by, a live credential.
//
// This vector used to pin the browser-side signer. It now pins the server-side
// one, unchanged, which is the point: signing moved processes without changing
// a single output byte.
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

const credentials = { apiKey: VECTOR.apiKey, apiSecret: VECTOR.apiSecret };

// =============================================================================
// SIGNING
// =============================================================================

describe("generateSignature", () => {
  it("reproduces Kraken's published API-Sign vector exactly", () => {
    expect(
      generateSignature(
        VECTOR.urlPath,
        VECTOR.postData,
        VECTOR.nonce,
        VECTOR.apiSecret,
      ),
    ).toBe(VECTOR.expectedSignature);
  });

  it("is deterministic for identical inputs", () => {
    const sign = () =>
      generateSignature(
        VECTOR.urlPath,
        VECTOR.postData,
        VECTOR.nonce,
        VECTOR.apiSecret,
      );

    expect(sign()).toBe(sign());
  });

  it("changes when the URI path changes", () => {
    expect(
      generateSignature(
        "/0/private/CancelOrder",
        VECTOR.postData,
        VECTOR.nonce,
        VECTOR.apiSecret,
      ),
    ).not.toBe(VECTOR.expectedSignature);
  });

  it("changes when the nonce changes", () => {
    expect(
      generateSignature(
        VECTOR.urlPath,
        VECTOR.postData,
        VECTOR.nonce + 1,
        VECTOR.apiSecret,
      ),
    ).not.toBe(VECTOR.expectedSignature);
  });

  it("changes when a single character of the post data changes", () => {
    expect(
      generateSignature(
        VECTOR.urlPath,
        VECTOR.postData.replace("37500", "37501"),
        VECTOR.nonce,
        VECTOR.apiSecret,
      ),
    ).not.toBe(VECTOR.expectedSignature);
  });

  it("changes when the secret changes", () => {
    expect(
      generateSignature(
        VECTOR.urlPath,
        VECTOR.postData,
        VECTOR.nonce,
        Buffer.from("a different secret entirely").toString("base64"),
      ),
    ).not.toBe(VECTOR.expectedSignature);
  });

  it("produces a 512-bit signature, base64 encoded", () => {
    const signature = generateSignature(
      VECTOR.urlPath,
      VECTOR.postData,
      VECTOR.nonce,
      VECTOR.apiSecret,
    );

    // HMAC-SHA512 is 64 bytes; base64 of 64 bytes is 88 characters with padding.
    expect(Buffer.from(signature, "base64")).toHaveLength(64);
    expect(signature).toHaveLength(88);
  });

  it("refuses to sign when no secret is configured", () => {
    expect(() =>
      generateSignature(VECTOR.urlPath, VECTOR.postData, VECTOR.nonce, ""),
    ).toThrow("API secret is not configured");
  });

  it("signs an empty body without throwing", () => {
    expect(
      generateSignature(VECTOR.urlPath, "", VECTOR.nonce, VECTOR.apiSecret),
    ).toEqual(expect.any(String));
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

describe("createNonceSource", () => {
  it("still increases when two requests share a millisecond", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const nextNonce = createNonceSource();
    const values = [nextNonce(), nextNonce(), nextNonce()];

    expect(values[1]).toBeGreaterThan(values[0]);
    expect(values[2]).toBeGreaterThan(values[1]);

    vi.useRealTimers();
  });

  it("keeps separate sources independent", () => {
    const a = createNonceSource();
    const b = createNonceSource();

    expect(a()).toEqual(expect.any(Number));
    expect(b()).toEqual(expect.any(Number));
  });
});

// =============================================================================
// HEADERS
// =============================================================================

describe("createAuthHeaders", () => {
  it("sets the key, the signature and the form content type", () => {
    const headers = createAuthHeaders(
      VECTOR.urlPath,
      VECTOR.postData,
      VECTOR.nonce,
      credentials,
    );

    expect(headers["API-Key"]).toBe(VECTOR.apiKey);
    expect(headers["API-Sign"]).toBe(VECTOR.expectedSignature);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("propagates the missing-secret failure rather than sending an unsigned request", () => {
    expect(() =>
      createAuthHeaders(VECTOR.urlPath, VECTOR.postData, VECTOR.nonce, {
        apiKey: VECTOR.apiKey,
        apiSecret: "",
      }),
    ).toThrow("API secret is not configured");
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
