import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { applyLocalEnv, parseEnvFile } from "./localEnv";

describe("parseEnvFile", () => {
  it("reads plain KEY=value pairs", () => {
    expect(parseEnvFile("KRAKEN_TRADING_MODE=live\nOTHER=1")).toEqual({
      KRAKEN_TRADING_MODE: "live",
      OTHER: "1",
    });
  });

  it("ignores comments and blank lines", () => {
    expect(parseEnvFile("# a comment\n\n  \nA=1\n")).toEqual({ A: "1" });
  });

  it("strips matching quotes but keeps the value intact otherwise", () => {
    expect(parseEnvFile(`A="one two"\nB='three'\nC=un"quoted`)).toEqual({
      A: "one two",
      B: "three",
      C: 'un"quoted',
    });
  });

  it("keeps base64 padding and every other character of a secret", () => {
    const secret = "kQH5HW/8p1uGOVjbgWA7Fun+AmGO8lsSUXNsu3eow76sz84Q18fWxnyRz==";
    expect(parseEnvFile(`KRAKEN_API_PRIVATE_KEY=${secret}`)).toEqual({
      KRAKEN_API_PRIVATE_KEY: secret,
    });
  });

  it("keeps an `=` that appears inside the value", () => {
    expect(parseEnvFile("A=b=c")).toEqual({ A: "b=c" });
  });

  it("skips a line with no key", () => {
    expect(parseEnvFile("=novalue\nA=1")).toEqual({ A: "1" });
  });
});

describe("applyLocalEnv", () => {
  const withTempFile = (contents: string, run: (file: string) => void) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-env-"));
    const file = path.join(dir, "local.env");
    fs.writeFileSync(file, contents);
    try {
      run(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("does nothing when there is no file, which is the normal case", () => {
    const env: Record<string, string | undefined> = {};
    expect(applyLocalEnv("/nonexistent/local.env", env)).toEqual([]);
    expect(env).toEqual({});
  });

  it("fills in only the variables the real environment has not already set", () => {
    withTempFile("A=from-file\nB=from-file", (file) => {
      const env: Record<string, string | undefined> = { A: "from-shell" };

      expect(applyLocalEnv(file, env)).toEqual(["B"]);
      expect(env).toEqual({ A: "from-shell", B: "from-file" });
    });
  });
});
