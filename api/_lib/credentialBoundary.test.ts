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
let resolved: { isProduction: boolean; mode: string };

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

/**
 * The environment the artifact under test is built in. The credential variables
 * are deliberately present: a build that never sees them proves nothing, and the
 * defect being guarded against was a build that saw them and compiled them in.
 */
const buildEnvironment = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };

  // Vitest sets this, and the config reads it to skip the dev-server plugin.
  // The child is a build, not a test run.
  delete env.VITEST;

  return {
    ...env,
    // Vitest also sets NODE_ENV=test, and Vite only defaults it to production
    // when it is unset. Left alone, the child would emit a development-flavoured
    // artifact - `import.meta.env.PROD` false - which is not what ships.
    NODE_ENV: "production",
    KRAKEN_TRADING_MODE: "live",
    KRAKEN_API_KEY: SENTINEL_KEY,
    KRAKEN_API_PRIVATE_KEY: SENTINEL_SECRET,
    KRAKEN_ALLOW_LOCAL_LIVE: "1",
  };
};

/**
 * Asks Vite itself what it makes of that environment, rather than assuming.
 *
 * `build` is the command and `production` the default mode, exactly as the CLI
 * invokes it. The default *NODE_ENV* is deliberately left alone, so
 * `isProduction` comes back true only because the environment really carries
 * `NODE_ENV=production` and not because Vite filled in a default.
 */
const RESOLVE_CONFIG =
  "import { resolveConfig } from 'vite';" +
  "const config = await resolveConfig({}, 'build', 'production');" +
  "process.stdout.write(JSON.stringify({ isProduction: config.isProduction, mode: config.mode }));";

beforeAll(() => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  const env = buildEnvironment();

  resolved = JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", RESOLVE_CONFIG], {
      cwd: ROOT,
      encoding: "utf8",
      env,
    }),
  ) as typeof resolved;

  execFileSync("npx", ["vite", "build", "--outDir", OUT_DIR, "--emptyOutDir"], {
    cwd: ROOT,
    stdio: "pipe",
    env,
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
  it("scans the artifact that ships, built as a production build", () => {
    // Not an assumption: this is Vite's own resolved config for the exact
    // environment the build ran in. A build resolving `isProduction` false
    // strips anything guarded by `import.meta.env.PROD`, so the scan below
    // would be reading a different artifact from the one a deploy publishes.
    expect(resolved).toEqual({ isProduction: true, mode: "production" });
  });

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
