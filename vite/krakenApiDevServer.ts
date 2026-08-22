/**
 * Mounts the `api/` serverless handlers on the Vite dev server.
 *
 * Without this, `npm run dev` would serve the SPA but not the endpoints that
 * hold the credential, and the only faithful way to run the app would be
 * `npx vercel dev`. Dev would then differ from production in exactly the place
 * this change cares about. The handlers mounted here are the same modules
 * Vercel runs - they take Node's `IncomingMessage`/`ServerResponse`, which is
 * what Vite's connect middleware stack hands out.
 *
 * This file is dev-server-only (`apply: "serve"`) and is never part of a client
 * bundle, so importing the signing code from here does not put it in the browser.
 */

import path from "node:path";
import type { Plugin } from "vite";
import type { ApiHandler } from "../api/_lib/http";
import { isLoopbackHost, LOOPBACK_HOST_NAMES } from "../api/_lib/loopback";
import { resolveServerRuntime } from "../api/_lib/serverConfig";
import { applyLocalEnv } from "./localEnv";

/**
 * Explicit rather than filesystem-derived: the route table is a security
 * surface, and it should be readable in one place.
 */
const ROUTES: Record<string, () => Promise<{ default: ApiHandler }>> = {
  "/api/kraken/status": () => import("../api/kraken/status"),
  "/api/kraken/balance": () => import("../api/kraken/balance"),
  "/api/kraken/ws-token": () => import("../api/kraken/ws-token"),
};

/**
 * How to name a refused bind in the error. An empty host is worth spelling out:
 * it listens on every interface, which is the opposite of what it reads like.
 */
const describeBind = (host: string | boolean | undefined): string => {
  if (host === true) return "every interface";
  if (typeof host === "string" && host.trim() === "") {
    return "an empty host, which listens on every interface";
  }
  return JSON.stringify(host);
};

export const krakenApiDevServer = (rootDir: string): Plugin => ({
  name: "kraken-api-dev-server",
  apply: "serve",
  configureServer(server) {
    applyLocalEnv(path.resolve(rootDir, "local.env"));

    // A live dev server holds the operator's Kraken key and signs for whoever
    // asks, so it may only listen on loopback. Refuse to start rather than warn:
    // a warning scrolls past, and by then the key is reachable from the network.
    //
    // The accepted binds are exactly the host names the per-request guard
    // accepts, so a bind that would start a server refusing its own operator
    // (a live server on 127.0.0.2 answers every request as though it simulated)
    // fails here instead, where the message can say what to use.
    const host = server.config.server.host;
    if (resolveServerRuntime(process.env).mode === "live" && !isLoopbackHost(host)) {
      throw new Error(
        `Refusing to start: live Kraken trading is configured, but the dev server is bound ` +
          `to ${describeBind(host)}, which this app ` +
          "does not serve live. This server signs Kraken requests for any caller that can " +
          "reach it and provides no authentication, so live mode is served only on the " +
          "loopback names " +
          `${LOOPBACK_HOST_NAMES.join(", ")}. Drop the --host flag, pass one of those names, ` +
          "or set KRAKEN_TRADING_MODE=simulation.",
      );
    }

    server.middlewares.use((req, res, next) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

      if (!pathname.startsWith("/api/")) {
        next();
        return;
      }

      const load = ROUTES[pathname];
      if (!load) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: `No such endpoint: ${pathname}` }));
        return;
      }

      void load()
        .then((module) => module.default(req, res))
        .catch((error: unknown) => {
          server.config.logger.error(
            `[kraken-api] ${pathname} failed: ${
              error instanceof Error ? error.stack : String(error)
            }`,
          );
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Internal error" }));
          }
        });
    });
  },
});
