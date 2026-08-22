/**
 * Shared entry point for handlers that need a live credential.
 *
 * Every credentialed handler asks for the runtime through `requireLiveRuntime`,
 * so there is one code path that can hand out a credential and one place that
 * refuses. A handler cannot accidentally reach `process.env` on its own.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./http";
import { requireLoopbackRequest } from "./loopback";
import {
  resolveServerRuntime,
  type Env,
  type KrakenCredentials,
  type ServerRuntime,
} from "./serverConfig";

export const getServerRuntime = (env: Env = process.env): ServerRuntime =>
  resolveServerRuntime(env);

/**
 * Returns the credentials when - and only when - this deployment is configured
 * for live trading *and* the request came from this machine. Otherwise it
 * answers the request itself and returns null: 503 because the endpoint exists
 * but this deployment will not serve it, or 403 because a live server signs for
 * whoever asks and so only ever answers loopback.
 *
 * The loopback check lives here rather than in each handler so a credentialed
 * endpoint cannot be written without it.
 */
export const requireLiveRuntime = (
  req: IncomingMessage,
  res: ServerResponse,
  env: Env = process.env,
): KrakenCredentials | null => {
  const runtime = getServerRuntime(env);

  if (runtime.mode === "live") {
    return requireLoopbackRequest(req, res) ? runtime.credentials : null;
  }

  if (runtime.mode === "misconfigured") {
    sendJson(res, 503, {
      mode: runtime.mode,
      errors: runtime.errors,
    });
    return null;
  }

  sendJson(res, 503, {
    mode: runtime.mode,
    errors: [
      "This deployment runs in simulation mode and holds no Kraken credentials.",
    ],
  });
  return null;
};
