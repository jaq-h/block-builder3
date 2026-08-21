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
 *    `KRAKEN_TRADING_MODE=live` *and* a complete credential pair *and* a
 *    non-hosted environment. Anything short of all three - a typo in the mode,
 *    a half-supplied credential pair - is `misconfigured`, never a silent
 *    fallback into signing.
 *
 * Live trading is consequently a self-hosted or local configuration: run the
 * functions on your own machine (`npx vercel dev`, or `npm run dev`, which
 * mounts the same handlers) or on your own server, with your own key in your
 * own server-side environment.
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

  // Rule 2: live was asked for explicitly, so a missing half of the credential
  // pair is a configuration error rather than a quiet downgrade to simulation.
  const missing = [
    apiKey ? null : API_KEY_VAR,
    apiSecret ? null : API_SECRET_VAR,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    return {
      mode: "misconfigured",
      errors: [
        `${TRADING_MODE_VAR}=live requires ${missing.join(" and ")} to be set.`,
      ],
    };
  }

  return { mode: "live", credentials: { apiKey, apiSecret } };
};

const unknownModeError = (value: string): string =>
  `${TRADING_MODE_VAR} must be "simulation" or "live", not ${JSON.stringify(value)}.`;
