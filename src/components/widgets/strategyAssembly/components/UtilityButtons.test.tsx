// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

import UtilityButtons from "./UtilityButtons";
import { GridDataContext } from "../contexts/GridDataContext";
import type { GridDataContextType } from "@/types/strategyAssembly";
import { createEmptyGrid } from "@utils/grid";

// =============================================================================
// HARNESS
// =============================================================================

/**
 * Render the toolbar inside a GridDataContext, returning the two grid actions it
 * is wired to so a test can assert what the user's click actually reached.
 */
const renderToolbar = (ui: ReactElement) => {
  const clearAll = vi.fn();
  const reverseBlocks = vi.fn();

  const value: GridDataContextType = {
    grid: createEmptyGrid(),
    orderConfig: {},
    strategyPattern: "conditional",
    setGrid: vi.fn(),
    setStrategyPattern: vi.fn(),
    clearAll,
    reverseBlocks,
  };

  return {
    user: userEvent.setup(),
    clearAll,
    reverseBlocks,
    ...render(
      <GridDataContext.Provider value={value}>{ui}</GridDataContext.Provider>,
    ),
  };
};

const executeButton = () => screen.queryByRole("button", { name: /orders\)/ });

// =============================================================================
// TESTS
// =============================================================================

describe("UtilityButtons", () => {
  it("always offers the grid actions, even with an empty grid", () => {
    renderToolbar(<UtilityButtons />);

    expect(screen.getByRole("button", { name: "Clear All" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reverse" })).toBeVisible();
  });

  it("clears the grid when the user clicks Clear All", async () => {
    const { user, clearAll, reverseBlocks } = renderToolbar(<UtilityButtons />);

    await user.click(screen.getByRole("button", { name: "Clear All" }));

    expect(clearAll).toHaveBeenCalledOnce();
    expect(reverseBlocks).not.toHaveBeenCalled();
  });

  it("swaps entry and exit when the user clicks Reverse", async () => {
    const { user, clearAll, reverseBlocks } = renderToolbar(<UtilityButtons />);

    await user.click(screen.getByRole("button", { name: "Reverse" }));

    expect(reverseBlocks).toHaveBeenCalledOnce();
    expect(clearAll).not.toHaveBeenCalled();
  });

  it("hides the execute button until the grid holds at least one order", () => {
    renderToolbar(<UtilityButtons orderCount={0} onExecute={vi.fn()} />);

    expect(executeButton()).not.toBeInTheDocument();
  });

  it("hides the execute button when there is no handler to run", () => {
    renderToolbar(<UtilityButtons orderCount={3} />);

    expect(executeButton()).not.toBeInTheDocument();
  });

  it("shows the order count on the execute button so the user sees what they are sending", () => {
    renderToolbar(<UtilityButtons orderCount={3} onExecute={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Execute Trade (3 orders)" }),
    ).toBeEnabled();
  });

  it("submits the trade when the user clicks execute", async () => {
    const onExecute = vi.fn();
    const { user } = renderToolbar(
      <UtilityButtons orderCount={2} onExecute={onExecute} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Execute Trade (2 orders)" }),
    );

    expect(onExecute).toHaveBeenCalledOnce();
  });

  it("says Update rather than Execute when editing an existing order", () => {
    renderToolbar(
      <UtilityButtons orderCount={2} onExecute={vi.fn()} isEditMode />,
    );

    expect(
      screen.getByRole("button", { name: "Update Order (2 orders)" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Execute Trade/ }),
    ).not.toBeInTheDocument();
  });

  it("disables the execute button while a submission is in flight", async () => {
    const onExecute = vi.fn();
    const { user } = renderToolbar(
      <UtilityButtons orderCount={1} onExecute={onExecute} isSubmitting />,
    );

    const button = screen.getByRole("button", { name: "Submitting..." });
    expect(button).toBeDisabled();

    // The real risk here is a double-submit sending the same orders twice.
    await user.click(button);
    expect(onExecute).not.toHaveBeenCalled();
  });

  it("leaves the grid actions usable while submitting", () => {
    renderToolbar(
      <UtilityButtons orderCount={1} onExecute={vi.fn()} isSubmitting />,
    );

    expect(screen.getByRole("button", { name: "Clear All" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reverse" })).toBeEnabled();
  });
});
