// Global test setup, loaded by Vitest before every test file.
//
// `@testing-library/jest-dom/vitest` registers the DOM matchers (toBeInTheDocument,
// toBeDisabled, ...) on Vitest's `expect` and augments its types, so importing it
// here makes them available - and type-check - across the whole suite.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { KRAKEN_ASSET_PAIRS_RESPONSE } from "./marketFixtures";

// Unmount anything rendered by a test so DOM state never leaks between tests.
// Harmless in the node environment, where no test has rendered anything.
afterEach(() => {
  cleanup();
});

// =============================================================================
// THE SUITE MAKES NO OUTBOUND REQUEST
// =============================================================================
//
// `MarketProvider` fetches Kraken's asset metadata on mount, so every test that
// renders a tree containing it - `App.test.tsx` above all - would otherwise call
// `https://api.kraken.com` for real on every run. That is the exact dependency
// `marketFixtures.ts` exists to remove: CI must not need the exchange to be
// reachable, and a suite that quietly reaches it passes or fails on somebody
// else's uptime.
//
// So `fetch` is replaced here rather than in one test file, because the trap is
// the mount, not the file: any future test that renders the provider inherits
// the fix. Kraken's AssetPairs endpoint is answered from the same fixture the
// parser test reads, so the provider sees the real per-pair rules and the grid
// is priced exactly as it is in the browser. Everything else is refused by
// name, which is what a test that reaches for the network deserves to see.
//
// This is a plain assignment, not `vi.stubGlobal`, so a test that stubs or
// spies on `fetch` for its own purposes still gets this back when Vitest
// restores globals rather than getting the real one.

const assetPairsResponse = (): Response =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => KRAKEN_ASSET_PAIRS_RESPONSE,
  }) as Response;

globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input instanceof Request ? input.url : input);

  if (url.includes("/0/public/AssetPairs")) {
    return assetPairsResponse();
  }

  throw new Error(
    `The test suite makes no network requests. Something asked for ${url} - ` +
      `stub fetch in the test that needs it.`,
  );
}) as typeof fetch;

// =============================================================================
// RESIZE OBSERVER
// =============================================================================
//
// jsdom implements no layout, so it ships no `ResizeObserver` - and a component
// that constructs one throws on mount rather than degrading, which takes down
// every test that renders it however little the test cares about resizing.
//
// A no-op stand-in is the honest answer rather than a shim with behaviour: in a
// document where nothing is laid out, no box ever changes size, so a faithful
// implementation would call its callback exactly as often as this one does -
// never. Anything a test needs to assert about what the callback DOES is
// asserted by calling it directly, not by waiting for jsdom to notice a resize
// it cannot see.
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= NoopResizeObserver;
