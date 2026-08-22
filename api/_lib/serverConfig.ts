/**
 * The security boundary of this application, expressed as one function.
 *
 * `resolveServerRuntime` decides - server side, from the process environment -
 * whether this deployment may sign anything with a Kraken credential. Nothing
 * else in the codebase is allowed to make that decision, and no code under
 * `src/` can influence it, because none of this ships to the browser.
 *
 * Two rules shape it:
 *
 * 1. **The public deployment is simulation only, and cannot be talked out of
 *    it.** A hosted deployment is reachable by anonymous visitors. If it held a
 *    trading credential, any one of them could place orders on the operator's
 *    Kraken account. So on a hosted deployment live mode is not merely
 *    disabled, it is unreachable: setting `KRAKEN_TRADING_MODE=live`, or
 *    supplying a credential at all, puts the deployment into `misconfigured`
 *    rather than into live mode. Setting one environment variable in a hosting
 *    dashboard therefore cannot cross the boundary - it breaks the deployment
 *    loudly instead.
 *
 * 2. **Ambiguity refuses.** Live mode requires an explicit
 *    `KRAKEN_TRADING_MODE=live`, *and* a complete credential pair, *and* an
 *    explicit `KRAKEN_ALLOW_LOCAL_LIVE=1`, *and* an environment carrying no
 *    hosted signal at all. Anything short of all four - a typo in the mode, a
 *    half-supplied credential pair, a missing opt-in - is `misconfigured`,
 *    never a silent fallback into signing.
 *
 * An unrecognised environment is never assumed to be the operator's own
 * machine. `VERCEL_ENV` is the cleanest hosted signal, but it is a Vercel
 * *system* variable and a project can be configured not to expose it, so its
 * absence proves nothing. Two independent mechanisms cover that: the operator
 * has to opt in positively with `KRAKEN_ALLOW_LOCAL_LIVE`, and any hosted
 * signal in the environment refuses live mode even when they have.
 *
 * Live trading is consequently a local configuration: run the functions on your
 * own machine with `npm run dev`, which mounts the same handlers, or on your own
 * server, with your own key in your own server-side environment. Note that
 * `npx vercel dev` sets `VERCEL`, which is a hosted signal, so it runs in
 * simulation.
 *
 * Live mode is additionally confined to loopback; see `./loopback.ts`.
 */

export interface KrakenCredentials {
  apiKey: string;
  apiSecret: string;
}

export type ServerRuntime =
  | { mode: "simulation" }
  | { mode: "live"; credentials: KrakenCredentials }
  | { mode: "misconfigured"; errors: string[] };

export const TRADING_MODE_VAR = "KRAKEN_TRADING_MODE";
export const API_KEY_VAR = "KRAKEN_API_KEY";
export const API_SECRET_VAR = "KRAKEN_API_PRIVATE_KEY";
/** The operator's positive statement that this process is their own machine. */
export const LOCAL_LIVE_VAR = "KRAKEN_ALLOW_LOCAL_LIVE";

/**
 * Variables that only a hosting platform sets. Any one of them means this
 * process is not the operator's own machine, whatever else the environment
 * claims. `VERCEL` is set by `npx vercel dev` too, which is why that command
 * cannot go live either: it is indistinguishable here from a deployment, and
 * the safe reading of an ambiguous environment is the refusing one.
 */
export const HOSTED_SIGNAL_VARS = [
  "VERCEL",
  "AWS_LAMBDA_FUNCTION_NAME",
  "LAMBDA_TASK_ROOT",
] as const;

/** A `NodeJS.ProcessEnv`-shaped bag, narrowed so the tests can pass a literal. */
export type Env = Record<string, string | undefined>;

/** Empty and whitespace-only are the same thing as unset for every variable here. */
const read = (env: Env, name: string): string => (env[name] ?? "").trim();

/**
 * Is this process a publicly reachable hosted deployment?
 *
 * `VERCEL_ENV` is injected by the platform and is one of `production`,
 * `preview` or `development`. The first two are the hosted, anonymously
 * reachable deployments. `development` is `vercel dev` on the operator's own
 * machine, and an absent value means the process is not on Vercel at all -
 * a self-hosted server or the Vite dev server. Vercel reserves the `VERCEL_`
 * prefix, so this signal cannot be spoofed from the project's own environment
 * variables.
 */
export const isPublicDeployment = (env: Env): boolean =>
  read(env, "VERCEL_ENV") === "production" || read(env, "VERCEL_ENV") === "preview";

/**
 * Every hosted signal present in this environment, named, so the refusal can
 * say which one it saw. `VERCEL_ENV` counts here as well: `development` is not
 * public, but it is still not proof of a local machine.
 */
export const hostedSignals = (env: Env): string[] => {
  const found = HOSTED_SIGNAL_VARS.filter((name) => read(env, name) !== "");
  return read(env, "VERCEL_ENV") !== "" ? [...found, "VERCEL_ENV"] : [...found];
};

/** Has the operator positively declared this process to be their own machine? */
export const hasLocalLiveOptIn = (env: Env): boolean => {
  const value = read(env, LOCAL_LIVE_VAR).toLowerCase();
  return value === "1" || value === "true" || value === "yes";
};

export const resolveServerRuntime = (env: Env): ServerRuntime => {
  const requestedMode = read(env, TRADING_MODE_VAR).toLowerCase();
  const apiKey = read(env, API_KEY_VAR);
  const apiSecret = read(env, API_SECRET_VAR);
  const hasAnyCredential = Boolean(apiKey || apiSecret);

  if (isPublicDeployment(env)) {
    const errors: string[] = [];

    // Rule 1. Note that this fires on the *presence* of a credential, not on a
    // request to use one: a public deployment must never hold the operator's
    // trading key, whatever mode it claims to be in.
    if (hasAnyCredential) {
      errors.push(
        `${API_KEY_VAR} and ${API_SECRET_VAR} must never be set on a public deployment. ` +
          "Remove them from the hosting project; the public deployment is simulation only.",
      );
    }
    if (requestedMode === "live") {
      errors.push(
        `${TRADING_MODE_VAR}=live is refused on a public deployment. ` +
          "Live trading is a self-hosted or local configuration.",
      );
    }
    if (requestedMode && requestedMode !== "simulation" && requestedMode !== "live") {
      errors.push(unknownModeError(requestedMode));
    }

    return errors.length > 0 ? { mode: "misconfigured", errors } : { mode: "simulation" };
  }

  if (!requestedMode || requestedMode === "simulation") {
    return { mode: "simulation" };
  }

  if (requestedMode !== "live") {
    return { mode: "misconfigured", errors: [unknownModeError(requestedMode)] };
  }

  // Rule 2: live was asked for explicitly, so every remaining requirement is a
  // configuration error when unmet rather than a quiet downgrade to simulation.
  const errors: string[] = [];

  const signals = hostedSignals(env);
  if (signals.length > 0) {
    errors.push(
      `${TRADING_MODE_VAR}=live is refused because this environment carries hosting ` +
        `signals (${signals.join(", ")}). Live trading runs only on the operator's own ` +
        "machine, and an environment that looks hosted is treated as hosted.",
    );
  }

  if (!hasLocalLiveOptIn(env)) {
    errors.push(
      `${TRADING_MODE_VAR}=live also requires ${LOCAL_LIVE_VAR}=1, which states that this ` +
        "process runs on the operator's own machine. An environment that has not said so " +
        "is never assumed to be local.",
    );
  }

  const missing = [
    apiKey ? null : API_KEY_VAR,
    apiSecret ? null : API_SECRET_VAR,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    errors.push(`${TRADING_MODE_VAR}=live requires ${missing.join(" and ")} to be set.`);
  }

  if (errors.length > 0) {
    return { mode: "misconfigured", errors };
  }

  return { mode: "live", credentials: { apiKey, apiSecret } };
};

const unknownModeError = (value: string): string =>
  `${TRADING_MODE_VAR} must be "simulation" or "live", not ${JSON.stringify(value)}.`;
