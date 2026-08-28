// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExecuteTradePanel from "./ExecuteTradePanel";

// =============================================================================
// HARNESS
// =============================================================================

const renderPanel = (
  overrides: Partial<Parameters<typeof ExecuteTradePanel>[0]> = {},
) => {
  const onViewActiveOrders = vi.fn();
  const user = userEvent.setup();
  render(
    <ExecuteTradePanel
      showSuccess
      error={null}
      simulationMessage="Simulation mode"
      isEffectivelySimulation
      canToggle={false}
      isSimulationMode
      onToggleSimulationMode={vi.fn()}
      onViewActiveOrders={onViewActiveOrders}
      {...overrides}
    />,
  );
  return { user, onViewActiveOrders };
};

const viewOrders = () =>
  screen.getByRole("button", { name: "View Active Orders" });

// =============================================================================
// TESTS
// =============================================================================

describe("the post-submission Active Orders control", () => {
  it("is a button rather than a link", () => {
    renderPanel();

    // It was a router `Link` to `/active`. There were never any routes, so the
    // URL it pushed rendered the identical page and the control did nothing.
    // A button says what it is: it switches which panel is on screen.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(viewOrders()).toBeInstanceOf(HTMLButtonElement);
  });

  it("switches to the orders panel when pressed", async () => {
    const { user, onViewActiveOrders } = renderPanel();

    await user.click(viewOrders());

    expect(onViewActiveOrders).toHaveBeenCalledTimes(1);
  });

  it("is reachable and operable from the keyboard", async () => {
    const { user, onViewActiveOrders } = renderPanel();

    expect(document.body).toHaveFocus();
    await user.tab();
    expect(viewOrders()).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onViewActiveOrders).toHaveBeenCalledTimes(1);
  });

  it("takes its accessible name from its own visible text", () => {
    renderPanel();

    // WCAG 2.5.3 Label in Name: no `aria-label` renaming it to something a
    // voice-control user cannot read off the screen.
    expect(viewOrders()).not.toHaveAttribute("aria-label");
    expect(viewOrders()).toHaveTextContent("View Active Orders");
  });

  it("is hidden above `lg`, where the orders panel is already on screen", () => {
    renderPanel();

    // Above `lg` both panels render side by side and there are no tabs, so
    // there is nothing for this control to switch to.
    expect([...viewOrders().classList]).toContain("lg:hidden");
  });

  it("is absent until a submission has actually succeeded", () => {
    renderPanel({ showSuccess: false });

    expect(
      screen.queryByRole("button", { name: "View Active Orders" }),
    ).not.toBeInTheDocument();
  });
});
