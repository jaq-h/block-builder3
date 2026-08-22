/**
 * GET /api/kraken/status
 *
 * Tells the browser which mode the server is in. The browser cannot decide this
 * for itself and is never trusted to: the answer here only drives what the UI
 * offers, while the actual refusal lives in `requireLiveRuntime`, server side,
 * on every credentialed endpoint.
 *
 * The response carries no credential, and never will - only the mode, and the
 * configuration errors when there are any, so a misconfigured deployment says
 * so instead of failing mysteriously.
 *
 * The answer is per caller, because live mode is loopback only. A caller that
 * `/api/kraken/balance` and `/api/kraken/ws-token` will refuse is told it is
 * simulating: telling it otherwise would label its orders "Live API Mode" while
 * every credentialed call it makes comes back 403, and would disclose to an
 * anonymous visitor that this host holds a Kraken key.
 */

import { requireMethod, sendJson, type ApiHandler } from "../_lib/http";
import { isLoopbackAddress } from "../_lib/loopback";
import { getServerRuntime } from "../_lib/runtime";

const handler: ApiHandler = (req, res) => {
  if (!requireMethod(req, res, ["GET"])) return;

  const runtime = getServerRuntime();

  if (runtime.mode === "misconfigured") {
    // 503, not 200: an ambiguous credential configuration is a fault, and it
    // should be loud. The client still degrades to simulation.
    sendJson(res, 503, {
      mode: "misconfigured",
      liveAvailable: false,
      errors: runtime.errors,
    });
    return;
  }

  const live =
    runtime.mode === "live" && isLoopbackAddress(req.socket?.remoteAddress);

  sendJson(res, 200, {
    mode: live ? "live" : "simulation",
    liveAvailable: live,
    errors: [],
  });
};

export default handler;
