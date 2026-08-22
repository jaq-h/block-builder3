import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * The one property this whole change exists to guarantee: **no Kraken
 * credential, and no code able to use one, may reach the browser bundle.**
 *
 * This is the acceptance check, executed. It runs a real production build with
 * the credential variables set to sentinel values, then reads what the build
 * emitted. The bundle is generated public output - every byte of it is served
 * to every visitor - so reading it is the contract itself, not a proxy for one:
 * whatever a refactor does to the source, the question here is only ever what
 * shipped.
 *
 * The source side of the same boundary is covered behaviourally by the
 * `no-restricted-imports` rule in `eslint.config.js`, which fails the lint job
 * the moment `src/` imports the signing code.
 *
 * It lives beside the server-side code rather than beside the client code it
 * covers: `api/` is the boundary, and keeping the client on the far side of it
 * is this directory's responsibility.
 */

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "node_modules", ".tmp", "credential-boundary-dist");

// Distinctive enough that a match cannot be a coincidence, and shaped like the
// real thing: a Kraken private key is base64.
const SENTINEL_KEY = "SENTINELKRAKENAPIKEYzzz0000QQQ";
const SENTINEL_SECRET =
  "U0VOVElORUxLUkFLRU5QUklWQVRFS0VZL0RPTk9UU0hJUC9BQUFBQUFBQUFBQUE9PQ==";

let emitted: { file: string; contents: string }[] = [];

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

beforeAll(() => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  // The credential variables are deliberately present for this build. A build
  // that never sees them proves nothing; the defect being guarded against was a
  // build that saw them and compiled them in.
  const buildEnv = { ...process.env };
  // Vitest sets this, and the config reads it to skip the dev-server plugin.
  // The child is a build, not a test run.
  delete buildEnv.VITEST;

  execFileSync("npx", ["vite", "build", "--outDir", OUT_DIR, "--emptyOutDir"], {
    cwd: ROOT,
    stdio: "pipe",
    env: {
      ...buildEnv,
      KRAKEN_TRADING_MODE: "live",
      KRAKEN_API_KEY: SENTINEL_KEY,
      KRAKEN_API_PRIVATE_KEY: SENTINEL_SECRET,
      KRAKEN_ALLOW_LOCAL_LIVE: "1",
    },
  });

  emitted = walk(OUT_DIR).map((file) => ({
    file: path.relative(OUT_DIR, file),
    contents: fs.readFileSync(file, "latin1"),
  }));
}, 600_000);

afterAll(() => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
});

const filesContaining = (pattern: RegExp): string[] =>
  emitted.filter(({ contents }) => pattern.test(contents)).map(({ file }) => file);

describe("the shipped bundle's credential boundary", () => {
  it("emitted a real build, so an empty scan cannot pass silently", () => {
    expect(emitted.some(({ file }) => file.endsWith(".js"))).toBe(true);
    expect(emitted.some(({ file }) => file.endsWith(".html"))).toBe(true);
  });

  it("carries neither half of the credential it was built with", () => {
    expect(filesContaining(new RegExp(SENTINEL_KEY))).toEqual([]);
    expect(filesContaining(new RegExp(SENTINEL_SECRET.replace(/[+/=]/g, "\\$&")))).toEqual(
      [],
    );
  });

  it("does not so much as name a server credential variable", () => {
    // Not because a variable name is a secret, but because the acceptance check
    // for this change is "grep the built bundle for these names and find
    // nothing", and a string that quotes one turns that into a judgement call.
    expect(
      filesContaining(/KRAKEN_API_KEY|KRAKEN_API_PRIVATE_KEY|KRAKEN_TRADING_MODE/),
    ).toEqual([]);
  });

  it("ships no request-signing primitive the browser could use", () => {
    expect(filesContaining(/createHmac|crypto\.subtle|API-Sign|HMAC|SHA-512/)).toEqual([]);
  });

  it("makes its authenticated calls to this app's own server, not to Kraken", () => {
    // The positive half of the same property: the boundary is not just an
    // absence, it is a call path. Every authenticated request in the bundle is
    // addressed to `/api/kraken/*`.
    const scripts = emitted.filter(({ file }) => file.endsWith(".js"));

    expect(
      scripts.some(({ contents }) => contents.includes("/api/kraken/ws-token")),
    ).toBe(true);
    expect(
      scripts.filter(({ contents }) => /api\.kraken\.com\/0\/private/.test(contents)),
    ).toEqual([]);
  });
});
