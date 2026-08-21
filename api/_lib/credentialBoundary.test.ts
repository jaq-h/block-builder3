import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The one property this whole change exists to guarantee: **no Kraken
 * credential, and no code able to use one, may reach the browser bundle.**
 *
 * A test that only checked the built output would pass on the day someone
 * reintroduced the import and failed only after a build. This scans the source
 * that feeds the bundle, so the mistake is caught where it is made.
 *
 * It lives beside the server-side code rather than beside the client code it
 * inspects: `api/` is the boundary, and keeping the client on the far side of
 * it is this directory's responsibility.
 */

const ROOT = process.cwd();

const walk = (dir: string, extensions: string[]): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, extensions);
    return extensions.includes(path.extname(entry.name)) ? [full] : [];
  });
};

// Only the files that can actually reach a bundle. Test files are not reachable
// from `src/main.tsx`, and some of them legitimately quote the server's error
// messages, variable names and all.
const CLIENT_FILES = walk(path.join(ROOT, "src"), [".ts", ".tsx"]).filter(
  (file) => !/\.(test|spec)\.tsx?$/.test(file) && !file.includes(`${path.sep}test${path.sep}`),
);

const contentsOf = (file: string) => fs.readFileSync(file, "utf8");

describe("the client bundle's credential boundary", () => {
  it("has files to check, so a broken glob cannot pass silently", () => {
    expect(CLIENT_FILES.length).toBeGreaterThan(20);
  });

  it("never names a server environment variable anywhere under src/", () => {
    // Not because a variable *name* is a secret, but because the acceptance
    // check for this change is "grep the built bundle for these names and find
    // nothing". A help string that quotes one turns that clean check into a
    // judgement call, and the browser has no business explaining server
    // configuration in the first place - the server sends its own message.
    const offenders = CLIENT_FILES.filter((file) =>
      /KRAKEN_API_KEY|KRAKEN_API_PRIVATE_KEY|KRAKEN_TRADING_MODE/.test(
        contentsOf(file),
      ),
    );

    expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
  });

  it("never imports the server-side signing code into the client tree", () => {
    // `api/` is bundled by the host, not by Vite. An import from `src/` would
    // pull the signer - and everything it can reach - into the browser.
    const offenders = CLIENT_FILES.filter((file) =>
      /["'][^"']*(?:\.\.\/)+api\/(?:_lib|kraken)\//.test(contentsOf(file)),
    );

    expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
  });

  it("contains no request-signing primitive in the client tree", () => {
    const offenders = CLIENT_FILES.filter((file) =>
      /node:crypto|createHmac|HMAC|SHA-512/.test(contentsOf(file)),
    );

    expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
  });

  it("keeps the build config free of any credential substitution", () => {
    // `define` compiles its values into the bundle as literals. This is the
    // exact mechanism that used to publish the private key.
    const config = fs.readFileSync(path.join(ROOT, "vite.config.ts"), "utf8");

    expect(config).not.toMatch(/KRAKEN_API/);
    expect(config).not.toMatch(/\bdefine\s*:/);
  });
});
