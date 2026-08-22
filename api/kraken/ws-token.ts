/**
 * POST /api/kraken/ws-token
 *
 * Mints a Kraken WebSocket authentication token. The token is short-lived and
 * scoped to the socket, which is why it may cross to the browser while the key
 * that produced it may not.
 *
 * POST rather than GET because it is not idempotent: every call burns a nonce
 * and asks the exchange for a fresh token.
 */

import { requireMethod, sendJson, type ApiHandler } from "../_lib/http";
import { requireLiveRuntime } from "../_lib/runtime";
import { callPrivate, KrakenRequestError } from "../_lib/krakenClient";

const handler: ApiHandler = async (req, res) => {
  if (!requireMethod(req, res, ["POST"])) return;

  const credentials = requireLiveRuntime(req, res);
  if (!credentials) return;

  try {
    const result = await callPrivate("GetWebSocketsToken", credentials);
    const token = result.token;

    if (typeof token !== "string" || token.length === 0) {
      sendJson(res, 502, { error: "No token in response" });
      return;
    }

    sendJson(res, 200, { token, expires: result.expires ?? null });
  } catch (error) {
    sendJson(res, error instanceof KrakenRequestError ? error.status : 500, {
      error: error instanceof Error ? error.message : "WebSocket token request failed",
    });
  }
};

export default handler;
