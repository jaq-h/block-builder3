// @vitest-environment jsdom
//
// The success message's time limit, through the real chain that carries it.
//
// The limit may not remove the strip while it holds the focused element, and
// the only thing that lets `useTradeExecution` know is a ref drilled
// App -> StrategyAssembly -> ExecuteTradePanel onto the element the panel
// itself renders. A test that stubs either hop proves nothing about that
// wiring: `App.test.tsx` stubs the panel and never forwards the ref, and the
// hook's own tests attach it to a strip they declare. So this one mounts the
// real panel and the real hook together, and lets the ref be the only thing
// joining them - unwire it and the guard reads `null` at the limit and
// dismisses the control out from under the user again.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { OrderConfig } from "@/types/grid";

const submitOrders = vi.fn(async () => true);

vi.mock("@store", () => ({
  useOrdersStore: () => ({
    submitOrders,
    isSubmitting: false,
    error: null,
    clearError: vi.fn(),
    isSimulationMode: true,
    toggleSimulationMode: vi.fn(),
  }),
}));

vi.mock("@hooks", () => ({
  useKrakenAPI: () => ({ currentPrice: null, tickerError: null }),
}));

vi.mock("@hooks/useTradingMode", () => ({
  useTradingMode: () => ({ liveAvailable: false }),
}));

// The grid, the market row and the action bar are stubbed - this is about the
// feedback strip and nothing it sits next to - but `ExecuteTradePanel` is the
// real one, because it is the component that owns the element in question.
vi.mock("@widgets/strategyAssembly/components", async () => {
  const actual = await import(
    "@widgets/strategyAssembly/components/ExecuteTradePanel"
  );
  return {
    PatternSelector: () => null,
    GridArea: () => null,
    UtilityButtons: () => null,
    ExecuteTradePanel: actual.default,
  };
});

vi.mock("@common/MarketSelector", () => ({ default: () => null }));

import StrategyAssembly from "@widgets/strategyAssembly/strategyAssembly";
import { useTradeExecution } from "@hooks/useTradeExecution";

// =============================================================================
// HARNESS
// =============================================================================

const A_STRATEGY: OrderConfig = {
  "sa-limit-limit-1": {
    col: 0,
    row: 1,
    type: "limit",
    axis: 2,
    yPosition: 25,
    direction: "upside",
  },
};

/**
 * What `App` does with the hook, minus the parts this is not about: the same
 * props, the same `strategyKey` remount on a successful submit - which is what
 * re-attaches the ref to a freshly mounted strip - and the same ref.
 */
const Harness = () => {
  const execution = useTradeExecution();

  return (
    <div>
      <StrategyAssembly
        key={execution.strategyKey}
        orderCount={execution.orderCount}
        showSuccess={execution.showSuccess}
        feedbackRef={execution.feedbackRef}
        error={execution.error}
        simulationMessage={execution.simulationMessage}
        isEffectivelySimulation={execution.isEffectivelySimulation}
        canToggle={execution.canToggle}
        isSimulationMode={execution.isSimulationMode}
        onToggleSimulationMode={execution.toggleSimulationMode}
        onViewActiveOrders={vi.fn()}
      />
      <button
        type="button"
        onClick={() => execution.handleConfigChange(A_STRATEGY)}
      >
        build
      </button>
      <button type="button" onClick={() => void execution.handleExecuteTrade()}>
        submit
      </button>
      <button type="button">elsewhere</button>
    </div>
  );
};

const successMessage = () =>
  screen.queryByText(/Orders submitted successfully/);

const viewActiveOrders = () =>
  screen.getByRole("button", { name: "View Active Orders" });

/** Two commits: the config has to land before the submit reads it. */
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

describe("the time limit against the panel that renders the strip", () => {
  it("leaves the strip up while its own control holds focus", async () => {
    render(<Harness />);
    await submit();

    expect(successMessage()).toBeInTheDocument();

    await act(async () => {
      viewActiveOrders().focus();
    });
    await advance(60_000);

    expect(successMessage()).toBeInTheDocument();
    expect(viewActiveOrders()).toHaveFocus();
  });

  it("dismisses the strip on the limit when nothing in it holds focus", async () => {
    render(<Harness />);
    await submit();

    await act(async () => {
      screen.getByRole("button", { name: "elsewhere" }).focus();
    });
    await advance(20_000);

    expect(successMessage()).not.toBeInTheDocument();
  });
});
