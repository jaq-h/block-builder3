/**
 * Server-side client for Kraken's private REST endpoints.
 *
 * The endpoints are an **allowlist, not a proxy**. A generic "sign whatever the
 * browser asks me to sign" endpoint would be a signing oracle: it would hand
 * any caller the ability to place orders with the operator's key, which is the
 * exact failure this boundary exists to prevent. Adding an operation here is a
 * deliberate, reviewable act.
 *
 * Only authenticated *reads* are exposed today. Order submission is a separate
 * change with its own review.
 */

import { createAuthHeaders, createNonceSource, formatPostData } from "./krakenSigning";
import type { KrakenCredentials } from "./serverConfig";

export const KRAKEN_REST_URL = "https://api.kraken.com";

export const PRIVATE_OPERATIONS = {
  Balance: "/0/private/Balance",
  GetWebSocketsToken: "/0/private/GetWebSocketsToken",
} as const;

export type PrivateOperation = keyof typeof PRIVATE_OPERATIONS;

/** A Kraken-side failure, carrying the HTTP status this server should report. */
export class KrakenRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "KrakenRequestError";
    this.status = status;
  }
}

const nextNonce = createNonceSource();

export interface CallPrivateOptions {
  /** Injected by the tests; defaults to the platform `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected by the tests so a signature can be asserted against a fixed nonce. */
  nonce?: number;
}

/**
 * Call one allowlisted private endpoint and return its `result` payload.
 *
 * The nonce is generated here and signed here; a caller cannot supply one, so a
 * replayed or crafted nonce from the browser is not a reachable state.
 */
export const callPrivate = async (
  operation: PrivateOperation,
  credentials: KrakenCredentials,
  options: CallPrivateOptions = {},
): Promise<Record<string, unknown>> => {
  const urlPath = PRIVATE_OPERATIONS[operation];
  if (!urlPath) {
    throw new KrakenRequestError(`Unsupported Kraken operation: ${operation}`, 400);
  }

  const { fetchImpl = fetch, nonce = nextNonce() } = options;

  const postData = formatPostData({ nonce });
  const headers = createAuthHeaders(urlPath, postData, nonce, credentials);

  let response: Response;
  try {
    response = await fetchImpl(`${KRAKEN_REST_URL}${urlPath}`, {
      method: "POST",
      headers,
      body: postData,
    });
  } catch (error) {
    throw new KrakenRequestError(
      `Could not reach Kraken: ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  }

  if (!response.ok) {
    throw new KrakenRequestError(
      `Kraken responded ${response.status} ${response.statusText}`,
      502,
    );
  }

  const body = (await response.json()) as {
    error?: string[];
    result?: Record<string, unknown>;
  };

  if (body.error && body.error.length > 0) {
    throw new KrakenRequestError(`Kraken API error: ${body.error.join(", ")}`, 502);
  }

  if (!body.result) {
    throw new KrakenRequestError("Kraken returned no result payload", 502);
  }

  return body.result;
};
