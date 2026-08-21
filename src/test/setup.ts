// Global test setup, loaded by Vitest before every test file.
//
// `@testing-library/jest-dom/vitest` registers the DOM matchers (toBeInTheDocument,
// toBeDisabled, ...) on Vitest's `expect` and augments its types, so importing it
// here makes them available - and type-check - across the whole suite.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount anything rendered by a test so DOM state never leaks between tests.
// Harmless in the node environment, where no test has rendered anything.
afterEach(() => {
  cleanup();
});
