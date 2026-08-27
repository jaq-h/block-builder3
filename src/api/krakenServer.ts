/**
 * The browser's only route to an authenticated Kraken call.
 *
 * Every function here talks to this app's own `/api/kraken/*` endpoints, which
 * hold the credential and do the signing. The browser sends an intent and
 * receives a result; it never sees a key, and there is no code path left in the
 * bundle that could sign anything even if it did.
 *
 * Every call carries `API_REQUEST_HEADERS`, which the server requires: a
 * credentialed endpoint serves only a caller that can set its own headers, and
 * a foreign page cannot.
 */

import { API_REQUEST_HEADERS } from "./appRequestHeader";

export const WS_TOKEN_ENDPOINT = "/api/kraken/ws-token";
export const BALANCE_ENDPOINT = "/api/kraken/balance";

/** Account balances, keyed by Kraken's asset code, as decimal strings. */
export type Balances = Record<string, string>;

/**
 * Read the server's error message when it sent one, so a refusal ("this
 * deployment runs in simulation mode") reaches the user instead of a bare
 * status code.
 */
const describeFailure = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: unknown; errors?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      return body.errors.map(String).join(" ");
    }
  } catch {
    // Fall through to the generic message below.
  }
  return `${fallback}: ${response.status} ${response.statusText}`;
};

/**
 * Mint a Kraken WebSocket authentication token.
 *
 * The token, unlike the key that produced it, is short-lived and scoped to the
 * socket, which is why it is allowed to cross to the browser at all. That
 * scoping is only real if the mint can be called off with the connection:
 * `signal` is passed straight to `fetch`, so a caller that abandons its
 * connection attempt cancels the request rather than leaving the server to
 * mint a live trading credential for a socket that will never exist.
 */
export const getWebSocketToken = async (
  signal?: AbortSignal,
): Promise<string> => {
  const response = await fetch(WS_TOKEN_ENDPOINT, {
    method: "POST",
    headers: API_REQUEST_HEADERS,
    signal,
  });

  if (!response.ok) {
    throw new Error(
      await describeFailure(response, "Failed to get WebSocket token"),
    );
  }

  const body = (await response.json()) as { token?: unknown };

  if (typeof body.token !== "string" || body.token.length === 0) {
    throw new Error("No token in response");
  }

  return body.token;
};

/**
 * The authenticated read that demonstrates the boundary: signed on the server,
 * with a key this bundle has never contained.
 */
export const fetchBalances = async (): Promise<Balances> => {
  const response = await fetch(BALANCE_ENDPOINT, {
    headers: API_REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new Error(await describeFailure(response, "Failed to fetch balances"));
  }

  const body = (await response.json()) as { balances?: unknown };

  if (!body.balances || typeof body.balances !== "object") {
    throw new Error("No balances in response");
  }

  return body.balances as Balances;
};
