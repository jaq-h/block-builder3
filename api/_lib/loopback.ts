/**
 * Live mode is a loopback-only configuration.
 *
 * The credentialed endpoints authenticate the *deployment*, not the caller: a
 * live server signs for whoever asks. That is safe on the operator's own
 * machine and nowhere else, because a Kraken WebSocket token carries the key's
 * permissions and an account balance is nobody else's business. So live mode is
 * confined to loopback, and the confinement is enforced twice - once on the
 * bind (see `vite/krakenApiDevServer.ts`, which refuses to start a live server
 * on anything but a loopback host name) and once per request here, so a
 * permissive bind on some other host cannot expose the endpoints either.
 *
 * `isOperatorRequest` is the per-request half, and every check has to pass:
 *
 * 1. **The peer address** is loopback. The obvious one, and on its own the
 *    weakest.
 * 2. **The `Host` header** names a loopback host. DNS rebinding produces a
 *    loopback peer for a page the operator never opened: an attacker's site
 *    re-resolves its own hostname to `127.0.0.1`, and the browser then treats
 *    this server as same-origin and can read the replies. `Host` is what the
 *    browser will not rewrite.
 * 3. **The app's own request header** is present. See `hasAppRequestHeader`.
 *    This is the affirmative one: the caller proves it is allowed to reach a
 *    credentialed endpoint instead of the server inferring it.
 * 4. **No foreign origin is declared.** See `isForeignOriginRequest`.
 *
 * We deliberately provide no authentication layer. This guard establishes that
 * a request came from this machine and from a caller that can set an arbitrary
 * header on it, and nothing more: it does not identify who is at the keyboard,
 * so exposing a live instance beyond loopback remains the operator's own
 * problem to solve, with their own protection in front of it.
 */

import type { IncomingMessage } from "node:http";

/**
 * Loopback is `127.0.0.0/8`, `::1`, and the IPv4-mapped forms of both that a
 * dual-stack socket reports. Anything else - including an address we cannot
 * read - is treated as remote, because a guard that cannot see the peer has to
 * assume the worst.
 *
 * This is about the *peer* of an established connection, which the operator
 * does not choose and which the kernel may report as any address in the range.
 * The names this app may be addressed by are a much shorter list, below.
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
 * The loopback host names this app supports, and the only ones. Deliberately an
 * exact list rather than the whole of `127.0.0.0/8`: a page served from this app
 * only ever addresses one of these three, and every other name is somebody
 * else's, whatever it resolves to.
 *
 * One list, used by both halves of the confinement: the bind check below and
 * the per-request `Host` check. Two lists that merely happened to agree is how a
 * live server bound to `127.0.0.2` came to start happily and then refuse every
 * request it received, telling the operator it was simulating.
 */
export const LOOPBACK_HOST_NAMES = ["localhost", "127.0.0.1", "::1"] as const;

const LOOPBACK_HOST_NAME_SET: ReadonlySet<string> = new Set(LOOPBACK_HOST_NAMES);

/** Is this hostname one of the three, in any of its written forms? */
export const isLoopbackHostName = (name: string): boolean =>
  LOOPBACK_HOST_NAME_SET.has(name.trim().replace(/^\[|\]$/g, "").toLowerCase());

/**
 * Is a Vite/Node bind host confined to loopback?
 *
 * Vite reports `undefined` or `false` for its localhost default and `true` for
 * "every interface"; a string is whatever `--host` was given.
 */
export const isLoopbackHost = (host: string | boolean | undefined): boolean => {
  if (host === undefined || host === false) return true;
  if (host === true) return false;

  const bare = host.trim();
  if (bare === "") return true;

  return isLoopbackHostName(bare);
};

/**
 * The `Host` values a browser sends when the operator really did type one of
 * those three names. A port is fine and is ignored; the hostname is what is
 * checked.
 */
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

  return isLoopbackHostName(hostname);
};

/** Did this request come from this machine, addressed as this machine? */
export const isLoopbackRequest = (req: IncomingMessage): boolean =>
  isLoopbackAddress(req.socket?.remoteAddress) &&
  isLoopbackHostHeader(req.headers?.host);

/**
 * The header this app puts on every request it makes to its own `/api/kraken/*`
 * endpoints. Kept in step with `APP_REQUEST_HEADER` in
 * `src/api/appRequestHeader.ts`, which is the client's copy; the two trees may
 * not import from each other, and `api/kraken/handlers.test.ts` builds a
 * request from the client's constant so a drift fails there rather than in a
 * browser.
 */
export const APP_REQUEST_HEADER = "x-block-builder-app";

/**
 * Did the caller set this app's own request header?
 *
 * This is the affirmative proof, and it exists because every attempt to *infer*
 * a caller's identity from whichever optional headers happened to be present
 * was bypassed by a request shape that omits them. A cross-origin `fetch`
 * carrying a header outside the CORS safelist triggers a preflight, and this
 * server answers `OPTIONS` with a 405 and no `Access-Control-Allow-*` headers,
 * so the real request is never sent. An `<img src>`, a `<script src>` and a
 * form post cannot set a header at all. So a request that carries this header
 * came from something that can choose its own headers: this app's page, curl,
 * or a script the operator ran.
 *
 * It is not a secret and is not authentication - anything on this machine can
 * send it. It is the thing a *foreign page* structurally cannot send.
 */
export const hasAppRequestHeader = (req: IncomingMessage): boolean => {
  const value = req.headers?.[APP_REQUEST_HEADER];
  return typeof value === "string" && value.trim() !== "";
};

/**
 * Has the caller declared an origin that is not this app's own page?
 *
 * This is the negative half of the origin test, and deliberately no longer the
 * whole of it. While the operator runs live locally, any site they visit can
 * `fetch("http://localhost:3002/api/kraken/ws-token", { method: "POST" })` with
 * none but CORS-safelisted headers, which sends no preflight. That request
 * genuinely comes from the operator's machine and genuinely names a loopback
 * host, so the peer and `Host` checks both pass. The attacker cannot read the
 * reply, but the server has already burned a Kraken nonce and a slice of the
 * account's rate limit, and in a trading tool that is the operator's own
 * trading being denied by a page they merely visited. `Sec-Fetch-Site` is a
 * forbidden header name, so such a page can neither set nor suppress it, and
 * `Origin` catches the same shape on browsers that send no Fetch Metadata.
 *
 * An absent pair proves nothing either way, and is not read as one: a browser
 * predating Fetch Metadata (Safari below 16.4) sends neither header for a
 * no-cors GET, so an `<img src>` or a form post from an attacker's page arrives
 * looking exactly like curl. Telling those apart is `hasAppRequestHeader`'s
 * job, not this function's.
 */
export const isForeignOriginRequest = (req: IncomingMessage): boolean => {
  const site = req.headers?.["sec-fetch-site"];
  if (typeof site === "string") {
    // `none` is a user-typed address or a bookmark, which is the operator.
    return !(site === "same-origin" || site === "none");
  }

  const origin = req.headers?.origin;
  if (origin === undefined) return false;
  if (typeof origin !== "string" || origin === "null") return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }

  const host = typeof req.headers?.host === "string" ? req.headers.host.trim() : "";
  return originHost.toLowerCase() !== host.toLowerCase();
};

/**
 * The whole test: this machine, addressed as this machine, by a caller that
 * says so and declares no other origin.
 */
export const isOperatorRequest = (req: IncomingMessage): boolean =>
  isLoopbackRequest(req) &&
  hasAppRequestHeader(req) &&
  !isForeignOriginRequest(req);
