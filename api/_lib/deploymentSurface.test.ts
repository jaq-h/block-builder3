import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Which endpoints this repository publishes.
 *
 * Vercel's zero-config function detection is the consumer here, and its rule is
 * mechanical: every file under `api/` becomes a Serverless Function at the path
 * that mirrors its location, unless a path segment starts with an underscore or
 * `.vercelignore` excludes it. That rule is a deployment contract, and it is
 * easy to add to by accident: a colocated test under `api/kraken/` deploys as a
 * route that imports `vitest` and exports no handler.
 *
 * This models the rule over the real tree and the real ignore file, and asserts
 * the resulting route set. Adding a genuine endpoint means updating this list,
 * which is the point: the public surface of the app should not change without
 * somebody saying so.
 */

const ROOT = path.resolve(process.cwd());
const API_DIR = path.join(ROOT, "api");

/** Exactly the endpoints README's "Server endpoints" table documents. */
const DOCUMENTED_ROUTES = [
  "/api/kraken/balance",
  "/api/kraken/status",
  "/api/kraken/ws-token",
];

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

/**
 * `.vercelignore` uses gitignore glob syntax. This translates the subset the
 * file actually uses - `**` for any run of directories, `*` within a segment,
 * `?` for one character - into the equivalent matcher, so the assertions below
 * run against the file's meaning rather than against its text.
 */
const toMatcher = (pattern: string): RegExp => {
  // Every wildcard becomes a placeholder first and a regex fragment second, so
  // that the fragments cannot be rewritten by a later pass over the same string.
  const ANY_DIRS = "\u0001";
  const ANY_CHARS = "\u0002";
  const ONE_CHAR = "\u0003";

  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, ANY_DIRS)
    .replace(/\*/g, ANY_CHARS)
    .replace(/\?/g, ONE_CHAR)
    .replaceAll(ANY_DIRS, "(?:[^/]+/)*")
    .replaceAll(ANY_CHARS, "[^/]*")
    .replaceAll(ONE_CHAR, "[^/]");

  return new RegExp(`^${source}(?:/.*)?$`);
};

const ignoreMatchers = (): RegExp[] => {
  const file = path.join(ROOT, ".vercelignore");
  // A deleted ignore file excludes nothing, which the route assertion then
  // reports as the extra routes it would publish.
  if (!fs.existsSync(file)) return [];

  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map(toMatcher);
};

const publishedRoutes = (): string[] => {
  const matchers = ignoreMatchers();
  const isIgnored = (file: string) => matchers.some((matcher) => matcher.test(file));

  return walk(API_DIR)
    .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
    .filter((file) => !isIgnored(file))
    // Vercel's underscore rule, applied to every segment: `api/_lib/...` and a
    // file such as `api/kraken/_helper.ts` are shared code, not entrypoints.
    .filter((file) => !file.split("/").some((segment) => segment.startsWith("_")))
    .map((file) => `/${file.replace(/\.[^./]+$/, "")}`)
    .sort();
};

describe("the routes a deploy publishes from api/", () => {
  it("publishes exactly the documented endpoints and nothing else", () => {
    expect(publishedRoutes()).toEqual(DOCUMENTED_ROUTES);
  });

  it("would publish a colocated test as a route if the ignore file stopped covering it", () => {
    // The failure this guards against, made concrete: without the exclusion the
    // handler tests deploy as `/api/kraken/handlers.test`.
    const withoutIgnores = walk(API_DIR)
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
      .filter((file) => !file.split("/").some((segment) => segment.startsWith("_")))
      .map((file) => `/${file.replace(/\.[^./]+$/, "")}`);

    expect(withoutIgnores).toContain("/api/kraken/handlers.test");
    expect(publishedRoutes()).not.toContain("/api/kraken/handlers.test");
  });
});
