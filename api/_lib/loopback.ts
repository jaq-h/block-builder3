/**
 * Live mode is a loopback-only configuration.
 *
 * The credentialed endpoints authenticate the *deployment*, not the caller: a
 * live server signs for whoever asks. That is safe on the operator's own
 * machine and nowhere else, because a Kraken WebSocket token carries the key's
 * permissions and an account balance is nobody else's business. So live mode is
 * confined to loopback, and the confinement is enforced twice - once on the
 * bind (see `vite/krakenApiDevServer.ts`, which refuses to start a live server
 * on a non-loopback interface) and once per request here, so a permissive bind
 * on some other host cannot expose the endpoints either.
 *
 * `isOperatorRequest` is the per-request half, and it is three checks, each
 * closing a hole the others leave open:
 *
 * 1. **The peer address** is loopback. The obvious one, and on its own the
 *    weakest.
 * 2. **The `Host` header** names a loopback host. DNS rebinding produces a
 *    loopback peer for a page the operator never opened: an attacker's site
 *    re-resolves its own hostname to `127.0.0.1`, and the browser then treats
 *    this server as same-origin and can read the replies. `Host` is what the
 *    browser will not rewrite.
 * 3. **The origin** is this app itself. See `isSameOriginRequest`.
 *
 * We deliberately provide no authentication layer. This guard establishes that
 * a request came from this machine and from this app, and nothing more: it does
 * not identify who is at the keyboard, so exposing a live instance beyond
 * loopback remains the operator's own problem to solve, with their own
 * protection in front of it.
 */

import type { IncomingMessage } from "node:http";

/**
 * Loopback is `127.0.0.0/8`, `::1`, and the IPv4-mapped forms of both that a
 * dual-stack socket reports. Anything else - including an address we cannot
 * read - is treated as remote, because a guard that cannot see the peer has to
 * assume the worst.
 */
export const isLoopbackAddress = (address: string | undefined): boolean => {
  if (!address) return false;

  const bare = address.trim().replace(/^\[|\]$/g, "").split("%")[0];
  const unmapped = bare.replace(/^::ffff:/i, "");

  if (unmapped === "::1" || unmapped === "0:0:0:0:0:0:0:1") return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(unmapped);
  if (!ipv4) return false;

  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return false;

  return octets[0] === 127;
};

/**
 * Is a Vite/Node bind host confined to loopback?
 *
 * Vite reports `undefined` or `false` for its localhost default and `true` for
 * "every interface"; a string is whatever `--host` was given.
 */
export const isLoopbackHost = (host: string | boolean | undefined): boolean => {
  if (host === undefined || host === false) return true;
  if (host === true) return false;

  const bare = host.trim().replace(/^\[|\]$/g, "");
  if (bare === "") return true;
  if (bare.toLowerCase() === "localhost") return true;

  return isLoopbackAddress(bare);
};

/**
 * The `Host` values a browser sends when the operator really did type a
 * loopback address. Deliberately an exact list rather than the whole of
 * `127.0.0.0/8`: a page served from this app only ever addresses one of these
 * three, and every other name is somebody else's, whatever it resolves to.
 * A port is fine and is ignored; the hostname is what is checked.
 */
const ALLOWED_HOST_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const isLoopbackHostHeader = (value: string | undefined): boolean => {
  if (typeof value !== "string") return false;

  const raw = value.trim();
  // A `Host` header is host[:port] and nothing else. Anything carrying a path,
  // credentials or whitespace is malformed, and malformed is refused.
  if (raw === "" || /[/\\@?#\s]/.test(raw)) return false;

  let hostname: string;
  try {
    hostname = new URL(`http://${raw}`).hostname;
  } catch {
    return false;
  }

  return ALLOWED_HOST_NAMES.has(hostname.toLowerCase());
};

/** Did this request come from this machine, addressed as this machine? */
export const isLoopbackRequest = (req: IncomingMessage): boolean =>
  isLoopbackAddress(req.socket?.remoteAddress) &&
  isLoopbackHostHeader(req.headers?.host);

/**
 * Was this request issued by this app's own page, rather than by some other
 * page the operator happens to have open?
 *
 * Loopback is not enough on its own. While the operator runs live locally, any
 * site they visit can `fetch("http://localhost:3002/api/kraken/ws-token", {
 * method: "POST" })` with none but CORS-safelisted headers, which sends no
 * preflight. That request genuinely comes from the operator's machine and
 * genuinely names a loopback host, so the two checks above both pass. The
 * attacker cannot read the reply, but the server has already burned a Kraken
 * nonce and a slice of the account's rate limit, and in a trading tool that is
 * the operator's own trading being denied by a page they merely visited.
 *
 * `Sec-Fetch-Site` is a forbidden header name, so a page cannot set or suppress
 * it; when it is absent we fall back to `Origin`, and when neither is present
 * the caller is not a browser at all (curl, a script) and there is no other
 * page to be acting on behalf of.
 */
export const isSameOriginRequest = (req: IncomingMessage): boolean => {
  const site = req.headers?.["sec-fetch-site"];
  if (typeof site === "string") {
    // `none` is a user-typed address or a bookmark, which is the operator.
    return site === "same-origin" || site === "none";
  }

  const origin = req.headers?.origin;
  if (origin === undefined) return true;
  if (typeof origin !== "string" || origin === "null") return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const host = typeof req.headers?.host === "string" ? req.headers.host.trim() : "";
  return originHost.toLowerCase() === host.toLowerCase();
};

/**
 * The whole test: this machine, addressed as this machine, by this app.
 */
export const isOperatorRequest = (req: IncomingMessage): boolean =>
  isLoopbackRequest(req) && isSameOriginRequest(req);
