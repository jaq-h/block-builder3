/**
 * Reads `local.env` for the dev server.
 *
 * `local.env` is not one of the `.env*` names Vite's own `loadEnv` picks up, so
 * it has to be read explicitly. It is read here, in the dev server, and never by
 * anything that reaches a bundle: the values it carries are server-side
 * credentials.
 */

import fs from "node:fs";

/**
 * Parse the subset of dotenv syntax this project needs: `KEY=value`, blank
 * lines, `#` comments, and optional matching single or double quotes around the
 * value. Anything more elaborate belongs in a real dotenv dependency, and this
 * file should grow one rather than a parser.
 */
export const parseEnvFile = (contents: string): Record<string, string> => {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      value.length >= 2 &&
      (value.startsWith('"') || value.startsWith("'")) &&
      value.endsWith(value[0])
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
};

/**
 * Merge `local.env` into `process.env` for the dev server, leaving anything
 * already set in the real environment alone - an explicit shell variable should
 * win over a file.
 */
export const applyLocalEnv = (filePath: string, env = process.env): string[] => {
  if (!fs.existsSync(filePath)) return [];

  const values = parseEnvFile(fs.readFileSync(filePath, "utf8"));
  const applied: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined) {
      env[key] = value;
      applied.push(key);
    }
  }

  return applied;
};
