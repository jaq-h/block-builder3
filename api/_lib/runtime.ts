/**
 * Shared entry point for handlers that need a live credential.
 *
 * Every credentialed handler asks for the runtime through `requireLiveRuntime`,
 * so there is one code path that can hand out a credential and one place that
 * refuses. A handler cannot accidentally reach `process.env` on its own.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./http";
import { isOperatorRequest } from "./loopback";
import {
  resolveServerRuntime,
  type Env,
  type KrakenCredentials,
  type ServerRuntime,
} from "./serverConfig";

export const getServerRuntime = (env: Env = process.env): ServerRuntime =>
  resolveServerRuntime(env);

/**
 * The single answer a caller gets when it will not be served a credential,
 * whether because this deployment holds none or because this caller is not the
 * operator. It is one message on purpose.
 *
 * A live server that refused a stranger with "this endpoint holds a Kraken
 * credential" would tell that stranger precisely what `/api/kraken/status`
 * declines to: that this host has a trading key on it. A remote caller must not
 * be able to tell a live host from a simulating one, and it cannot do that by
 * comparing two responses that are identical.
 */
const refuseAsSimulating = (res: ServerResponse): null => {
  sendJson(res, 503, {
    mode: "simulation",
    errors: [
      "This deployment runs in simulation mode and holds no Kraken credentials.",
    ],
  });
  return null;
};

/**
 * Returns the credentials when - and only when - this deployment is configured
 * for live trading *and* the request came from the operator's own page on this
 * machine (`isOperatorRequest`). Otherwise it answers the request itself and
 * returns null.
 *
 * The caller check lives here rather than in each handler so a credentialed
 * endpoint cannot be written without it.
 */
export const requireLiveRuntime = (
  req: IncomingMessage,
  res: ServerResponse,
  env: Env = process.env,
): KrakenCredentials | null => {
  const runtime = getServerRuntime(env);

  if (runtime.mode === "misconfigured") {
    // Deliberately loud, and deliberately the one thing that is loud to every
    // caller: a key added to a hosting dashboard has to break the deployment
    // visibly, and this state signs nothing, so there is nothing to conceal.
    sendJson(res, 503, {
      mode: runtime.mode,
      errors: runtime.errors,
    });
    return null;
  }

  if (runtime.mode !== "live" || !isOperatorRequest(req)) {
    return refuseAsSimulating(res);
  }

  return runtime.credentials;
};
