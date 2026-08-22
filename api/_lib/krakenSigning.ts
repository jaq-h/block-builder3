/**
 * Kraken REST request signing.
 *
 * This module runs **on the server only**. It is the reason the whole `api/`
 * directory exists: the private key never leaves the process that imports this
 * file, and nothing under `src/` may import it.
 *
 * Every function takes the secret as an argument rather than reading it from
 * the environment, so the tests can pin Kraken's own published vector without
 * any environment at all, and so there is exactly one place - `serverConfig.ts` -
 * that decides where a credential comes from.
 */

import { createHash, createHmac } from "node:crypto";

/**
 * Kraken requires a unique, monotonically increasing nonce per API key. The
 * clock in microseconds satisfies both and needs no persisted counter.
 */
export const generateNonce = (): number => Date.now() * 1000;

/**
 * Build the `API-Sign` header value for a Kraken private REST call.
 *
 * HMAC-SHA512(base64_decode(secret), urlPath || SHA256(nonce || postData)),
 * base64 encoded - exactly as Kraken's REST authentication documentation
 * specifies. `nonce` must be the same nonce the body carries or the exchange
 * rejects the request.
 */
export const generateSignature = (
  urlPath: string,
  postData: string,
  nonce: number,
  apiSecret: string,
): string => {
  if (!apiSecret) {
    throw new Error("API secret is not configured");
  }

  const sha256 = createHash("sha256")
    .update(`${nonce}${postData}`, "utf8")
    .digest();

  const message = Buffer.concat([Buffer.from(urlPath, "utf8"), sha256]);

  return createHmac("sha512", Buffer.from(apiSecret, "base64"))
    .update(message)
    .digest("base64");
};

/**
 * Headers for an authenticated Kraken REST call. The key and the signature
 * belong together: a request carrying one without the other is never valid, so
 * they are produced in the same place.
 */
export const createAuthHeaders = (
  urlPath: string,
  postData: string,
  nonce: number,
  credentials: { apiKey: string; apiSecret: string },
): Record<string, string> => ({
  "API-Key": credentials.apiKey,
  "API-Sign": generateSignature(urlPath, postData, nonce, credentials.apiSecret),
  "Content-Type": "application/x-www-form-urlencoded",
});

/**
 * URL-encode a parameter object into a Kraken POST body. `undefined` values are
 * dropped rather than sent as the string "undefined".
 */
export const formatPostData = (
  params: Record<string, string | number | boolean | undefined>,
): string => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  return searchParams.toString();
};

/**
 * Kraken rejects a nonce that does not strictly exceed the previous one for the
 * same key. `Date.now()` has millisecond resolution, so two requests issued in
 * the same millisecond would otherwise sign with an identical nonce and the
 * second would be refused. The source hands out strictly increasing values,
 * falling forward by a microsecond when the clock has not moved.
 */
export const createNonceSource = (): (() => number) => {
  let last = 0;
  return () => {
    const next = Math.max(generateNonce(), last + 1);
    last = next;
    return next;
  };
};
