import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * **The chart panel is code-split, and `lightweight-charts` may not appear in
 * the eager chunk.** That rule is written down in the **Deployment** and **The
 * chart panel** sections of `AGENTS.md`; this is the same rule, executed.
 *
 * It matters because breaking it is silent. A value import from anything
 * `ChartHeader` reaches - the `Suspense` fallback is drawn by the same component
 * as the real header, so it is eager - puts the app's largest dependency back
 * into the initial payload. Nothing errors, the build still succeeds, and the
 * only symptom is a slower first paint that nobody attributes to a stray
 * import. `priceScaleMode.ts` was split out of `priceScale.ts` for exactly
 * this reason: `PriceScaleMode` is an enum, so naming it is a value import, and
 * the function mapping onto it therefore lives in its own module on the lazy
 * side while `priceScale.ts` keeps the library-free vocabulary.
 *
 * It reads the artifact rather than the source, for the reason
 * `api/_lib/credentialBoundary.test.ts` gives: whatever a refactor does to the
 * imports, the question here is only ever what shipped. **What "eager" means is
 * taken from the build's own manifest** - the entry chunk plus the chunks it
 * statically imports, transitively - rather than from a filename pattern, so a
 * rollup that starts emitting a shared vendor chunk is covered without this
 * file being told about it. `dynamicImports` are deliberately not followed:
 * being reached only by a dynamic import is the whole property under test.
 *
 * It lives under `vite/` rather than beside the chart, and rather than beside
 * the two bundle scans in `api/_lib/`, on the same principle those two follow:
 * a test about the whole repository sits with whatever owns the fact, not with
 * its subject. Those two are `api/`'s because the credential boundary and the
 * public route surface are. Which module lands in which chunk is the Vite
 * build's, so it is this directory's - along with the node types the scan
 * needs, which `src` is not typechecked with.
 */

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.join(ROOT, "node_modules", ".tmp", "eager-chunk-dist");

/**
 * Strings `lightweight-charts` emits into its own minified output: the class it
 * puts on every chart container, the id of its attribution link, and the name in
 * that link. The package specifier itself does not survive minification, so a
 * scan for it would pass no matter what shipped.
 *
 * All three are asserted *present* in the lazy chunk below, so a release that
 * renames one fails this file rather than quietly weakening it.
 */
const LIBRARY_MARKERS = ["tv-lightweight-charts", "tv-attr-logo", "TradingView"];

type ManifestChunk = {
  file: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
};

let manifest: Record<string, ManifestChunk>;
let eagerScripts: { file: string; contents: string }[] = [];
let lazyScripts: { file: string; contents: string }[] = [];

const read = (file: string) => ({
  file,
  contents: fs.readFileSync(path.join(OUT_DIR, file), "latin1"),
});

/** The entry chunk plus everything it statically imports, transitively. */
const eagerChunkKeys = (): string[] => {
  const entries = Object.entries(manifest)
    .filter(([, chunk]) => chunk.isEntry)
    .map(([key]) => key);

  const seen = new Set<string>();
  const queue = [...entries];

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(...(manifest[key]?.imports ?? []));
  }

  return [...seen];
};

beforeAll(() => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  const env = { ...process.env };
  // Vitest sets this, and the config reads it to skip the dev-server plugin.
  // The child is a build, not a test run.
  delete env.VITEST;
  // Vitest also sets NODE_ENV=test, and Vite only defaults it to production
  // when it is unset. Left alone the child emits a development-flavoured
  // artifact, which is not what a deploy code-splits.
  env.NODE_ENV = "production";

  execFileSync(
    "npx",
    ["vite", "build", "--outDir", OUT_DIR, "--emptyOutDir", "--manifest"],
    { cwd: ROOT, stdio: "pipe", env },
  );

  manifest = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, ".vite", "manifest.json"), "utf8"),
  ) as Record<string, ManifestChunk>;

  const eager = new Set(eagerChunkKeys());

  eagerScripts = [...eager].map((key) => read(manifest[key].file));
  lazyScripts = Object.entries(manifest)
    .filter(([key, chunk]) => !eager.has(key) && chunk.file.endsWith(".js"))
    .map(([, chunk]) => read(chunk.file));
}, 600_000);

afterAll(() => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
});

describe("the chart library's place in the shipped bundle", () => {
  it("emitted a real build with an entry chunk, so an empty scan cannot pass silently", () => {
    expect(Object.values(manifest).some((chunk) => chunk.isEntry)).toBe(true);
    expect(eagerScripts.every(({ contents }) => contents.length > 0)).toBe(true);
    expect(eagerScripts.filter(({ file }) => file.endsWith(".js"))).not.toEqual([]);
  });

  it("still reaches the chart panel through a dynamic import", () => {
    // The other half of the property, and what keeps the scan below honest: the
    // library has to be *somewhere*, and behind a dynamic entry is where. A
    // build that dropped `lightweight-charts` altogether, or a release that
    // renamed every marker, would otherwise satisfy the absence assertion
    // without the code split doing any work.
    expect(Object.values(manifest).some((chunk) => chunk.isDynamicEntry)).toBe(true);

    for (const marker of LIBRARY_MARKERS) {
      expect(
        lazyScripts.filter(({ contents }) => contents.includes(marker)).map((s) => s.file),
      ).not.toEqual([]);
    }
  });

  it("keeps lightweight-charts out of the eager chunk", () => {
    for (const marker of LIBRARY_MARKERS) {
      expect(
        eagerScripts.filter(({ contents }) => contents.includes(marker)).map((s) => s.file),
      ).toEqual([]);
    }
  });
});
