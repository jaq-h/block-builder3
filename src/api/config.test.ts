import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// =============================================================================
// TESTS
// =============================================================================

describe("credential configuration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns about missing credentials at most once, however often it is asked", async () => {
    // `hasValidCredentials()` is called during render, so a warning per call
    // accumulated dozens of identical lines in a dev session and buried the
    // errors that actually mattered.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { hasValidCredentials, getKrakenConfig, validateConfig } =
      await import("./config");

    const afterImport = warn.mock.calls.length;
    expect(afterImport).toBeLessThanOrEqual(1);

    for (let i = 0; i < 50; i++) {
      hasValidCredentials();
      getKrakenConfig();
      validateConfig();
    }

    // Whatever import emitted, 150 further calls must add nothing.
    expect(warn.mock.calls.length).toBe(afterImport);
  });

  it("hands back the same configuration object every time", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getKrakenConfig } = await import("./config");

    expect(getKrakenConfig()).toBe(getKrakenConfig());
  });

  it("reports no credentials when the environment carries none", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { hasValidCredentials, validateConfig } = await import("./config");

    expect(hasValidCredentials()).toBe(false);
    expect(validateConfig()).toEqual({
      valid: false,
      errors: ["KRAKEN_API_KEY is not set", "KRAKEN_API_PRIVATE_KEY is not set"],
    });
  });
});
