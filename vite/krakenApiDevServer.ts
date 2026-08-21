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

export const krakenApiDevServer = (rootDir: string): Plugin => ({
  name: "kraken-api-dev-server",
  apply: "serve",
  configureServer(server) {
    applyLocalEnv(path.resolve(rootDir, "local.env"));

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
