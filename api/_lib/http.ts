/**
 * The small amount of HTTP plumbing the Kraken handlers need.
 *
 * The handlers are written against Node's own `IncomingMessage` / `ServerResponse`
 * rather than a framework request object, so the identical function runs as a
 * Vercel serverless function, as Vite dev-server middleware (see
 * `vite/krakenApiDevServer.ts`) and under a plain stub in the tests. None of the
 * handlers read a request body, which keeps them free of the one place those
 * three environments genuinely differ.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export type ApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

export const sendJson = (
  res: ServerResponse,
  status: number,
  body: unknown,
): void => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // These answers describe credential state and short-lived tokens. Nothing
  // between the browser and this function may keep a copy.
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

/**
 * Enforce the method a handler accepts. Returns false, having already answered
 * with 405, when the request should go no further.
 */
export const requireMethod = (
  req: IncomingMessage,
  res: ServerResponse,
  allowed: string[],
): boolean => {
  if (req.method && allowed.includes(req.method)) {
    return true;
  }

  res.setHeader("Allow", allowed.join(", "));
  sendJson(res, 405, { error: `Method not allowed: ${req.method ?? "unknown"}` });
  return false;
};
