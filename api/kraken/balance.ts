/**
 * GET /api/kraken/balance
 *
 * The authenticated read that proves the boundary works end to end: the browser
 * asks for account balances, the server signs the request with a key the
 * browser has never seen, and only the balances come back.
 */

import { requireMethod, sendJson, type ApiHandler } from "../_lib/http";
import { requireLiveRuntime } from "../_lib/runtime";
import { callPrivate, KrakenRequestError } from "../_lib/krakenClient";

const handler: ApiHandler = async (req, res) => {
  if (!requireMethod(req, res, ["GET"])) return;

  const credentials = requireLiveRuntime(req, res);
  if (!credentials) return;

  try {
    const balances = await callPrivate("Balance", credentials);
    sendJson(res, 200, { balances });
  } catch (error) {
    sendJson(res, error instanceof KrakenRequestError ? error.status : 500, {
      error: error instanceof Error ? error.message : "Balance request failed",
    });
  }
};

export default handler;
