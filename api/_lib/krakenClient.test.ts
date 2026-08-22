import { describe, it, expect, vi } from "vitest";

import { callPrivate, KrakenRequestError, PRIVATE_OPERATIONS } from "./krakenClient";
import { generateSignature } from "./krakenSigning";

const credentials = {
  apiKey: "test-api-key",
  apiSecret:
    "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==",
};

const okResponse = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  }) as Response;

describe("callPrivate", () => {
  it("exposes only authenticated reads - order placement is not reachable", () => {
    // The allowlist is the reason this server is not a signing oracle. Growing
    // it is a deliberate act, and this assertion is the tripwire.
    expect(Object.keys(PRIVATE_OPERATIONS).sort()).toEqual([
      "Balance",
      "GetWebSocketsToken",
    ]);
  });

  it("posts a signed, nonce-bearing request and returns the result", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okResponse({ error: [], result: { token: "tok-1" } }));

    await expect(
      callPrivate("GetWebSocketsToken", credentials, {
        fetchImpl,
        nonce: 1616492376594,
      }),
    ).resolves.toEqual({ token: "tok-1" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.kraken.com/0/private/GetWebSocketsToken");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe("nonce=1616492376594");

    // The body must be signed with the same nonce it carries, or Kraken rejects it.
    const headers = init?.headers as Record<string, string>;
    expect(headers["API-Key"]).toBe(credentials.apiKey);
    expect(headers["API-Sign"]).toBe(
      generateSignature(
        "/0/private/GetWebSocketsToken",
        "nonce=1616492376594",
        1616492376594,
        credentials.apiSecret,
      ),
    );
  });

  it("generates its own nonce when the caller does not supply one", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okResponse({ error: [], result: {} }));

    await callPrivate("Balance", credentials, { fetchImpl });

    const [, init] = fetchImpl.mock.calls[0];
    expect(String(init?.body)).toMatch(/^nonce=\d+$/);
  });

  it("surfaces a transport failure as a 502", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    await expect(
      callPrivate("Balance", credentials, { fetchImpl }),
    ).rejects.toMatchObject({ status: 502, message: /Could not reach Kraken/ });
  });

  it("surfaces a non-OK HTTP response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as Response);

    await expect(
      callPrivate("Balance", credentials, { fetchImpl }),
    ).rejects.toThrow("Kraken responded 503 Service Unavailable");
  });

  it("surfaces the exchange's own error list", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        okResponse({ error: ["EAPI:Invalid key", "EGeneral:Permission denied"] }),
      );

    await expect(
      callPrivate("Balance", credentials, { fetchImpl }),
    ).rejects.toThrow("Kraken API error: EAPI:Invalid key, EGeneral:Permission denied");
  });

  it("rejects a success-shaped response that carries no result", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okResponse({ error: [] }));

    await expect(
      callPrivate("Balance", credentials, { fetchImpl }),
    ).rejects.toThrow("Kraken returned no result payload");
  });

  it("refuses to sign for an operation that is not on the allowlist", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      // Cast, because the type system already refuses this at compile time. The
      // check exists for a caller that reaches the function through `any`.
      callPrivate("AddOrder" as "Balance", credentials, { fetchImpl }),
    ).rejects.toBeInstanceOf(KrakenRequestError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
