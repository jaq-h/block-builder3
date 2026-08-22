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
 * We deliberately provide no authentication layer. Exposing this beyond
 * loopback is the operator's own problem to solve, with their own protection in
 * front of it.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./http";

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
 * Guards a credentialed endpoint. Returns false, having already answered with
 * 403, when the request did not come from this machine.
 */
export const requireLoopbackRequest = (
  req: IncomingMessage,
  res: ServerResponse,
): boolean => {
  if (isLoopbackAddress(req.socket?.remoteAddress)) return true;

  sendJson(res, 403, {
    error:
      "This endpoint holds a Kraken credential and serves loopback requests only. " +
      "Live trading is a local configuration; this server provides no authentication " +
      "for remote callers and must not be exposed beyond localhost.",
  });
  return false;
};
