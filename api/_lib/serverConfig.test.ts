import { describe, it, expect } from "vitest";

import {
  isPublicDeployment,
  resolveServerRuntime,
  type Env,
} from "./serverConfig";

const KEY = "a-key";
const SECRET = "c2VjcmV0";

// A local or self-hosted process: no Vercel environment at all.
const local = (extra: Env = {}): Env => ({ ...extra });

// The public deployment: hosted, anonymously reachable.
const hosted = (extra: Env = {}): Env => ({ VERCEL_ENV: "production", ...extra });

describe("isPublicDeployment", () => {
  it("treats the hosted production and preview deployments as public", () => {
    expect(isPublicDeployment({ VERCEL_ENV: "production" })).toBe(true);
    expect(isPublicDeployment({ VERCEL_ENV: "preview" })).toBe(true);
  });

  it("does not treat `vercel dev` or a bare process as public", () => {
    expect(isPublicDeployment({ VERCEL_ENV: "development" })).toBe(false);
    expect(isPublicDeployment({})).toBe(false);
  });
});

// =============================================================================
// THE PUBLIC DEPLOYMENT
// =============================================================================

describe("resolveServerRuntime on a public deployment", () => {
  it("simulates when nothing is configured", () => {
    expect(resolveServerRuntime(hosted())).toEqual({ mode: "simulation" });
  });

  it("refuses live mode outright, however it is asked for", () => {
    const runtime = resolveServerRuntime(
      hosted({
        KRAKEN_TRADING_MODE: "live",
        KRAKEN_API_KEY: KEY,
        KRAKEN_API_PRIVATE_KEY: SECRET,
      }),
    );

    expect(runtime.mode).toBe("misconfigured");
  });

  it("refuses merely holding a credential, even in simulation mode", () => {
    // This is the rule that makes the boundary uncrossable from a hosting
    // dashboard: adding the key does not switch the deployment to live, it
    // breaks it loudly.
    const runtime = resolveServerRuntime(
      hosted({
        KRAKEN_TRADING_MODE: "simulation",
        KRAKEN_API_KEY: KEY,
        KRAKEN_API_PRIVATE_KEY: SECRET,
      }),
    );

    expect(runtime.mode).toBe("misconfigured");
    expect(runtime).toMatchObject({
      errors: [expect.stringContaining("must never be set on a public deployment")],
    });
  });

  it("refuses a half-supplied credential just as firmly", () => {
    expect(resolveServerRuntime(hosted({ KRAKEN_API_KEY: KEY })).mode).toBe(
      "misconfigured",
    );
    expect(
      resolveServerRuntime(hosted({ KRAKEN_API_PRIVATE_KEY: SECRET })).mode,
    ).toBe("misconfigured");
  });

  it("never returns live, whatever the environment says", () => {
    const environments: Env[] = [
      hosted({ KRAKEN_TRADING_MODE: "live" }),
      hosted({ KRAKEN_TRADING_MODE: "LIVE", KRAKEN_API_KEY: KEY, KRAKEN_API_PRIVATE_KEY: SECRET }),
      { VERCEL_ENV: "preview", KRAKEN_TRADING_MODE: "live", KRAKEN_API_KEY: KEY, KRAKEN_API_PRIVATE_KEY: SECRET },
    ];

    for (const env of environments) {
      expect(resolveServerRuntime(env).mode).not.toBe("live");
    }
  });
});

// =============================================================================
// LOCAL AND SELF-HOSTED
// =============================================================================

describe("resolveServerRuntime off the public deployment", () => {
  it("simulates when the mode is unset", () => {
    expect(resolveServerRuntime(local())).toEqual({ mode: "simulation" });
  });

  it("simulates when the mode is explicitly simulation, credentials or not", () => {
    expect(
      resolveServerRuntime(
        local({
          KRAKEN_TRADING_MODE: "simulation",
          KRAKEN_API_KEY: KEY,
          KRAKEN_API_PRIVATE_KEY: SECRET,
        }),
      ),
    ).toEqual({ mode: "simulation" });
  });

  it("stays in simulation when a credential is present but live was never asked for", () => {
    expect(
      resolveServerRuntime(
        local({ KRAKEN_API_KEY: KEY, KRAKEN_API_PRIVATE_KEY: SECRET }),
      ),
    ).toEqual({ mode: "simulation" });
  });

  it("goes live only with the explicit mode and a complete credential pair", () => {
    expect(
      resolveServerRuntime(
        local({
          KRAKEN_TRADING_MODE: "live",
          KRAKEN_API_KEY: KEY,
          KRAKEN_API_PRIVATE_KEY: SECRET,
        }),
      ),
    ).toEqual({ mode: "live", credentials: { apiKey: KEY, apiSecret: SECRET } });
  });

  it("accepts `vercel dev`, which is the operator's own machine", () => {
    expect(
      resolveServerRuntime({
        VERCEL_ENV: "development",
        KRAKEN_TRADING_MODE: "live",
        KRAKEN_API_KEY: KEY,
        KRAKEN_API_PRIVATE_KEY: SECRET,
      }).mode,
    ).toBe("live");
  });
});

// =============================================================================
// AMBIGUITY REFUSES
// =============================================================================

describe("resolveServerRuntime when the configuration is ambiguous", () => {
  it("refuses live mode with no credentials rather than quietly simulating", () => {
    const runtime = resolveServerRuntime(local({ KRAKEN_TRADING_MODE: "live" }));

    expect(runtime.mode).toBe("misconfigured");
    expect(runtime).toMatchObject({
      errors: [expect.stringContaining("KRAKEN_API_KEY and KRAKEN_API_PRIVATE_KEY")],
    });
  });

  it("refuses live mode with only half the credential pair", () => {
    expect(
      resolveServerRuntime(
        local({ KRAKEN_TRADING_MODE: "live", KRAKEN_API_KEY: KEY }),
      ),
    ).toMatchObject({
      mode: "misconfigured",
      errors: [expect.stringContaining("KRAKEN_API_PRIVATE_KEY")],
    });
  });

  it("treats a whitespace-only credential as absent", () => {
    expect(
      resolveServerRuntime(
        local({
          KRAKEN_TRADING_MODE: "live",
          KRAKEN_API_KEY: KEY,
          KRAKEN_API_PRIVATE_KEY: "   ",
        }),
      ).mode,
    ).toBe("misconfigured");
  });

  it("refuses a mode it does not recognise instead of guessing", () => {
    expect(
      resolveServerRuntime(local({ KRAKEN_TRADING_MODE: "production" })),
    ).toMatchObject({
      mode: "misconfigured",
      errors: [expect.stringContaining('not "production"')],
    });
  });

  it("accepts the mode case-insensitively, since a hosting dashboard shouts", () => {
    expect(
      resolveServerRuntime(
        local({
          KRAKEN_TRADING_MODE: "Live",
          KRAKEN_API_KEY: KEY,
          KRAKEN_API_PRIVATE_KEY: SECRET,
        }),
      ).mode,
    ).toBe("live");
  });
});
