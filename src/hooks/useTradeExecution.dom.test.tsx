// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

// =============================================================================
// THE SUCCESS MESSAGE IS DISMISSED ON A TIMER, AND THE TIMER HAS ONE OWNER
// =============================================================================
//
// The post-submission success message carries a focusable control ("View
// Active Orders", the tab switch that replaced the router's `/active` link),
// so the dismissal removes content a user may be in the middle of reaching.
// Every defect pinned here was invisible for as long as the message never
// rendered at all: the strip was gated on `orderCount > 0`, and a successful
// submit empties the grid in the same React update that raises the message.
//
// - 3s took the control away mid-Tab.
// - The timer was never cancelled, so a second submission's message was
//   cleared early by the *first* submission's timer, and loading a strategy
//   for edit left one running behind it.
// - Even at 20s the limit took the strip away while the user was on it. The
//   dismissal now waits for focus to leave rather than relocating it, which
//   would be a change of context the user never asked for.
// - A window blur reports itself as a `focusout` with no `relatedTarget`,
//   which is also what leaving the strip looks like, so switching application
//   handed the control back at an arbitrary moment instead of at the limit.

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
 * `renderHook` would exercise neither the unmount cleanup nor the strip the
 * dismissal consults.
 *
 * The strip mirrors the real one in the two respects the dismissal depends on:
 * it carries the ref the hook hands out, and it holds a focusable control that
 * goes away with the message.
 */
const Harness = () => {
  const { showSuccess, feedbackRef, handleConfigChange, handleExecuteTrade, loadConfig } =
    useTradeExecution();

  return (
    <div>
      {showSuccess && (
        <div ref={feedbackRef}>
          <span>Orders submitted successfully!</span>
          <button type="button">View Active Orders</button>
          <button type="button">dismiss</button>
        </div>
      )}
      <button type="button" id="elsewhere">
        elsewhere
      </button>
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
      <button
        type="button"
        onClick={() =>
          loadConfig({ entry: { primary: { blocks: [] } } } as never)
        }
      >
        edit a strategy
      </button>
    </div>
  );
};

const successMessage = () =>
  screen.queryByText("Orders submitted successfully!");

const viewActiveOrders = () =>
  screen.getByRole("button", { name: "View Active Orders" });

const elsewhere = () => screen.getByRole("button", { name: "elsewhere" });

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

/**
 * A focus change and the tick that settles it: `document.activeElement` has
 * not moved yet while `focusout` is dispatching, so the dismissal reads it
 * afterwards and so does anything asserting on what it decided.
 */
const focusOn = async (element: HTMLElement) => {
  await act(async () => {
    element.focus();
    vi.advanceTimersByTime(0);
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

describe("the success message's time limit", () => {
  it("keeps the message up long enough to read it and reach its control", async () => {
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

  it("gives a second submission's message a full limit of its own", async () => {
    render(<Harness />);

    await submit();
    await advance(15_000);
    expect(successMessage()).not.toBeNull();

    // The route a user actually takes from one message to the next, step by
    // step: building again clears the first message, and the submit that
    // follows raises a second one. Uncancelled, the first submission's timer
    // fires 5s into that second message and takes it away with 15s to run.
    await act(async () => {
      screen.getByRole("button", { name: "build" }).click();
    });
    expect(successMessage()).toBeNull();

    await act(async () => {
      screen.getByRole("button", { name: "submit" }).click();
    });
    expect(successMessage()).not.toBeNull();

    await advance(10_000);
    expect(successMessage()).not.toBeNull();

    // ...and the second message then runs its own limit out, rather than
    // inheriting anything from the first.
    await advance(10_000);
    expect(successMessage()).toBeNull();
  });

  it("cancels the pending dismissal when a strategy is loaded for edit", async () => {
    render(<Harness />);
    await submit();

    await act(async () => {
      screen.getByRole("button", { name: "edit a strategy" }).click();
    });

    // `loadConfig` clears the message, so the dismissal it was scheduled for no
    // longer has anything to dismiss and must not be left in flight.
    expect(successMessage()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the pending dismissal when the hook unmounts", async () => {
    const { unmount } = render(<Harness />);
    await submit();

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the time limit and the focused control", () => {
  it("does not take the strip away while it holds the focused element", async () => {
    render(<Harness />);
    await submit();

    await focusOn(viewActiveOrders());
    await advance(60_000);

    // Removing the control the user is on drops focus to `<body>` and restarts
    // the next Tab at the top of the document - the very failure the tab
    // switch's focus handoff exists to avoid.
    expect(successMessage()).not.toBeNull();
    expect(viewActiveOrders()).toHaveFocus();
  });

  it("dismisses the message once focus leaves the strip", async () => {
    render(<Harness />);
    await submit();

    await focusOn(viewActiveOrders());
    await advance(20_000);
    expect(successMessage()).not.toBeNull();

    await focusOn(elsewhere());

    expect(successMessage()).toBeNull();
    expect(elsewhere()).toHaveFocus();
  });

  it("dismisses on the limit when focus is elsewhere in the page", async () => {
    render(<Harness />);
    await submit();

    await focusOn(elsewhere());
    await advance(20_000);

    expect(successMessage()).toBeNull();
  });

  it("does not read a window blur as focus leaving the strip", async () => {
    render(<Harness />);
    await submit();

    await focusOn(viewActiveOrders());
    await advance(20_000);

    // Switching to another application, another browser tab or the URL bar:
    // the focused element inside the strip fires `focusout` with no
    // `relatedTarget`, and the page's own focus does not move - the control
    // is still `document.activeElement`. Indistinguishable from a Tab out by
    // the event alone, which is why the event is not what decides.
    await act(async () => {
      viewActiveOrders().dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
      );
      vi.advanceTimersByTime(0);
    });

    expect(successMessage()).not.toBeNull();
    expect(viewActiveOrders()).toHaveFocus();

    // Coming back and tabbing out for real still dismisses it: the re-arm is
    // held open by the blur rather than spent by it.
    await focusOn(elsewhere());

    expect(successMessage()).toBeNull();
  });

  it("keeps the strip up while focus only moves within it", async () => {
    render(<Harness />);
    await submit();

    await focusOn(viewActiveOrders());
    await advance(20_000);

    await focusOn(screen.getByRole("button", { name: "dismiss" }));

    expect(successMessage()).not.toBeNull();
  });
});
