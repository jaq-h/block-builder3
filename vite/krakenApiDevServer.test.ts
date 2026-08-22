import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { krakenApiDevServer } from "./krakenApiDevServer";

// A root with no `local.env`, so the plugin cannot pick up a developer's real
// credentials while the suite runs.
const EMPTY_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-dev-server-"));

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

const createServer = (host: string | boolean | undefined) => {
  const middlewares: Middleware[] = [];
  return {
    middlewares: {
      use: (fn: Middleware) => {
        middlewares.push(fn);
      },
    },
    config: {
      server: { host },
      logger: { error: vi.fn() },
    },
    mounted: middlewares,
  };
};

const start = (server: ReturnType<typeof createServer>) => {
  const plugin = krakenApiDevServer(EMPTY_ROOT);
  const configureServer = plugin.configureServer as (s: unknown) => void;
  configureServer(server);
};

const ENV_VARS = [
  "KRAKEN_API_KEY",
  "KRAKEN_API_PRIVATE_KEY",
  "KRAKEN_TRADING_MODE",
  "KRAKEN_ALLOW_LOCAL_LIVE",
  "VERCEL_ENV",
  "VERCEL",
  "AWS_LAMBDA_FUNCTION_NAME",
  "LAMBDA_TASK_ROOT",
];

const goLive = () => {
  vi.stubEnv("KRAKEN_TRADING_MODE", "live");
  vi.stubEnv("KRAKEN_ALLOW_LOCAL_LIVE", "1");
  vi.stubEnv("KRAKEN_API_KEY", "test-api-key");
  vi.stubEnv("KRAKEN_API_PRIVATE_KEY", "c2VjcmV0");
};

beforeEach(() => {
  for (const name of ENV_VARS) vi.stubEnv(name, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the dev server's loopback rule", () => {
  it("refuses to start a live server bound to every interface", () => {
    goLive();

    expect(() => start(createServer(true))).toThrow(/loopback/);
  });

  it("refuses to start a live server bound to a routable address", () => {
    goLive();

    expect(() => start(createServer("0.0.0.0"))).toThrow(/Refusing to start/);
  });

  it("names the flag to drop, so the operator can act on the refusal", () => {
    goLive();

    expect(() => start(createServer(true))).toThrow(/--host/);
  });

  it("starts a live server on the loopback default", () => {
    goLive();

    for (const host of [undefined, false, "localhost", "127.0.0.1", "::1"]) {
      expect(() => start(createServer(host))).not.toThrow();
    }
  });

  it("leaves a simulating server alone, whatever it is bound to", () => {
    // Nothing to protect: there is no credential in this process.
    expect(() => start(createServer(true))).not.toThrow();
  });
});

describe("the dev server's routes", () => {
  const respond = async (url: string) => {
    const server = createServer(undefined);
    start(server);

    let payload = "";
    let statusCode = 200;
    const res = {
      set statusCode(value: number) {
        statusCode = value;
      },
      get statusCode() {
        return statusCode;
      },
      headersSent: false,
      setHeader: () => {},
      end: (body?: string) => {
        payload = body ?? "";
      },
    } as unknown as ServerResponse;

    const req = {
      url,
      method: "GET",
      socket: { remoteAddress: "127.0.0.1" },
      headers: { host: "localhost:3002" },
    } as IncomingMessage;

    const next = vi.fn();
    server.mounted[0](req, res, next);
    // The route loads its handler through a dynamic import.
    await vi.waitFor(() => expect(payload).not.toBe(""));

    return { status: res.statusCode, body: JSON.parse(payload) as unknown, next };
  };

  it("serves the same status handler the deployment runs", async () => {
    const { status, body } = await respond("/api/kraken/status");

    expect(status).toBe(200);
    expect(body).toMatchObject({ mode: "simulation", liveAvailable: false });
  });

  it("answers an unknown /api/ path itself rather than falling through to the SPA", async () => {
    const { status, next } = await respond("/api/kraken/nope");

    expect(status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes everything outside /api/ to the rest of the stack", () => {
    const server = createServer(undefined);
    start(server);

    const next = vi.fn();
    server.mounted[0](
      { url: "/index.html", method: "GET" } as IncomingMessage,
      {} as ServerResponse,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });
});
