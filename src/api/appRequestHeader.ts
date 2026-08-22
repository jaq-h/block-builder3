/**
 * The header this app puts on every request to its own `/api/kraken/*`
 * endpoints.
 *
 * The server serves a credentialed endpoint only to a caller that sets this,
 * because a foreign page structurally cannot: a cross-origin `fetch` carrying a
 * header outside the CORS safelist triggers a preflight the server refuses, and
 * an `<img src>` or a form post cannot set a header at all. It is not a secret,
 * carries no credential, and is not authentication - see the docblock on
 * `hasAppRequestHeader` in `api/_lib/loopback.ts`, which is the server's half of
 * this contract and holds the same header name.
 */

export const APP_REQUEST_HEADER = "X-Block-Builder-App";

/**
 * What every call to this app's own endpoints sends. Frozen because it is
 * shared by every caller and `fetch` only ever reads it.
 */
export const API_REQUEST_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  Accept: "application/json",
  [APP_REQUEST_HEADER]: "1",
});
