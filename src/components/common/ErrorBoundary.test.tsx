// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ErrorBoundary from "./ErrorBoundary";

// =============================================================================
// HARNESS
// =============================================================================

/** Throws on the first render, then renders normally - like a bad payload. */
const Bomb = ({ throws }: { throws: boolean }) => {
  if (throws) throw new Error("Kraken sent a candle with no close price");
  return <p>chart</p>;
};

/** A parent whose own state must survive a child blowing up. */
const Recoverable = () => {
  const [broken, setBroken] = useState(true);

  return (
    <div>
      <button onClick={() => setBroken(false)}>Repair</button>
      <ErrorBoundary title="The chart could not be displayed">
        <Bomb throws={broken} />
      </ErrorBoundary>
    </div>
  );
};

beforeEach(() => {
  // React logs every caught error itself; the noise is not the test's subject.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// TESTS
// =============================================================================

describe("ErrorBoundary", () => {
  it("renders its children when nothing goes wrong", () => {
    render(
      <ErrorBoundary>
        <p>chart</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("chart")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a real fallback instead of a blank page when a child throws", () => {
    render(
      <ErrorBoundary>
        <Bomb throws />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeVisible();
    expect(screen.getByText("Something went wrong")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("uses the caller's wording so the user is told what still works", () => {
    render(
      <ErrorBoundary
        title="The chart could not be displayed"
        message="Your strategy is unaffected."
      >
        <Bomb throws />
      </ErrorBoundary>,
    );

    expect(screen.getByText("The chart could not be displayed")).toBeVisible();
    expect(screen.getByText("Your strategy is unaffected.")).toBeVisible();
  });

  it("puts the error message behind a details disclosure, not in the user's face", () => {
    render(
      <ErrorBoundary>
        <Bomb throws />
      </ErrorBoundary>,
    );

    expect(
      screen.getByText("Kraken sent a candle with no close price"),
    ).toBeInTheDocument();
    expect(screen.getByText("Technical details")).toBeVisible();
  });

  it("hands the error to the host so it can be reported", () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Bomb throws />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("recovers when the user retries after the cause is gone", async () => {
    const user = userEvent.setup();
    render(<Recoverable />);

    expect(screen.getByRole("alert")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Repair" }));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("chart")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the rest of the page alive around the failure", () => {
    render(<Recoverable />);

    // The whole point: a chart failure must not take the builder with it.
    expect(screen.getByRole("button", { name: "Repair" })).toBeVisible();
  });
});
