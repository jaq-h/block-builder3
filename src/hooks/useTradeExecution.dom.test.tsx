// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

// =============================================================================
// THE SUCCESS MESSAGE IS DISMISSED ON A TIMER, AND THERE IS ONLY EVER ONE
// =============================================================================
//
// The post-submission success message carries a focusable control ("View
// Active Orders", the tab switch that replaced the router's `/active` link),
// so the dismissal timer removes content a user may be in the middle of
// reaching. Both defects pinned here were invisible for as long as the message
// never rendered at all: the strip was gated on `orderCount > 0`, and a
// successful submit empties the grid in the same React update that raises
// `showSuccess`.
//
// - 3s took the control away mid-Tab. WCAG 2.2.1 asks for at least 20s.
// - The timer was never cancelled, so a second submission's message was
//   cleared early by the *first* submission's timer.

const submitOrders = vi.fn(async () => true);

vi.mock("../store", () => ({
  useOrdersStore: () => ({
    submitOrders,
    isSubmitting: false,
    error: null,
    clearError: vi.fn(),
    isSimulationMode: true,
    toggleSimulationMode: vi.fn(),
  }),
}));

vi.mock("./useTradingMode", () => ({
  useTradingMode: () => ({ liveAvailable: false }),
}));

import { useTradeExecution } from "./useTradeExecution";

// =============================================================================
// HARNESS
// =============================================================================

/**
 * The hook driven through a component, because that is how it runs: a bare
 * `renderHook` would not exercise the unmount cleanup this also asserts.
 */
const Harness = () => {
  const { showSuccess, handleConfigChange, handleExecuteTrade } =
    useTradeExecution();

  return (
    <div>
      {showSuccess && <span>Orders submitted successfully!</span>}
      <button
        type="button"
        onClick={() =>
          handleConfigChange({ entry: { primary: { blocks: [] } } } as never)
        }
      >
        build
      </button>
      <button type="button" onClick={() => void handleExecuteTrade()}>
        submit
      </button>
    </div>
  );
};

const successMessage = () =>
  screen.queryByText("Orders submitted successfully!");

/**
 * A successful submission, in two commits: `handleExecuteTrade` reads
 * `orderConfig` from state, so the config has to land in its own render before
 * the submit sees anything to send.
 */
const submit = async () => {
  await act(async () => {
    screen.getByRole("button", { name: "build" }).click();
  });
  await act(async () => {
    screen.getByRole("button", { name: "submit" }).click();
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  submitOrders.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// TESTS
// =============================================================================

describe("the success message's dismissal timer", () => {
  it("keeps the message up for at least the 20s WCAG 2.2.1 allows", async () => {
    render(<Harness />);
    await submit();

    expect(successMessage()).not.toBeNull();

    // The old 3s limit removed the focusable control while a keyboard user was
    // still tabbing toward it.
    await advance(19_000);
    expect(successMessage()).not.toBeNull();
  });

  it("dismisses the message once the limit has passed", async () => {
    render(<Harness />);
    await submit();

    await advance(20_000);

    expect(successMessage()).toBeNull();
  });

  it("does not let an earlier submission's timer clear a later message", async () => {
    render(<Harness />);

    await submit();
    await advance(15_000);

    // A second success restarts the limit. Uncancelled, the first timer fires
    // 5s into this second message and takes it away with 15s still to run.
    await submit();
    await advance(10_000);

    expect(successMessage()).not.toBeNull();
  });

  it("cancels the pending dismissal when the hook unmounts", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = render(<Harness />);
    await submit();

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
