/**
 * Shared entry point for handlers that need a live credential.
 *
 * Every credentialed handler asks for the runtime through `requireLiveRuntime`,
 * so there is one code path that can hand out a credential and one place that
 * refuses. A handler cannot accidentally reach `process.env` on its own.
 */

import type { ServerResponse } from "node:http";
import { sendJson } from "./http";
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
 * for live trading. Otherwise it answers the request itself and returns null:
 * 503, because the endpoint exists but this deployment will not serve it.
 */
export const requireLiveRuntime = (
  res: ServerResponse,
  env: Env = process.env,
): KrakenCredentials | null => {
  const runtime = getServerRuntime(env);

  if (runtime.mode === "live") {
    return runtime.credentials;
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
