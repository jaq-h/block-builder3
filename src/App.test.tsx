// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The panels are stubbed so these tests are about App's layout and nothing
// else. The stubs count their own mounts, which is what makes a duplicated
// tree visible: rendering one JSX element in two branches mounts two
// independent copies, each with its own state.
vi.mock("./components/widgets/strategyAssembly/strategyAssembly", async () => ({
  default: (await import("@/test/panelStubs")).AssemblyPanelStub,
}));

vi.mock("./components/widgets/activeOrders", async () => ({
  ActiveOrders: (await import("@/test/panelStubs")).OrdersPanelStub,
}));

vi.mock("./components/widgets/orderChart", () => ({
  OrderChart: () => <div data-testid="chart" />,
}));

import App from "./App";
import { mounts, unmounts, resetMountTracker } from "@/test/mountTracker";

// =============================================================================
// HARNESS
// =============================================================================

const renderApp = () => ({ user: userEvent.setup(), ...render(<App />) });

const ordersTab = () => screen.getByRole("button", { name: /Active Orders/ });
const builderTab = () =>
  screen.getByRole("button", { name: /Strategy Builder/ });

/** The outermost element of a panel: the one App applies its layout classes to. */
const panelRoot = (testId: string): HTMLElement => {
  const root = screen.getByTestId(testId).closest("main > div > div");
  if (!(root instanceof HTMLElement)) {
    throw new Error(`No panel root found for ${testId}`);
  }
  return root;
};

beforeEach(resetMountTracker);

// =============================================================================
// TESTS
// =============================================================================

describe("App layout", () => {
  it("mounts each panel exactly once", () => {
    renderApp();

    // Two mounts means two independent copies of the builder, each holding its
    // own strategy, only one of which the user can see.
    expect(mounts).toEqual({ assembly: 1, orders: 1 });
  });

  it("renders one of each panel in the document", () => {
    renderApp();

    expect(screen.getAllByTestId("assembly-panel")).toHaveLength(1);
    expect(screen.getAllByTestId("orders-panel")).toHaveLength(1);
    expect(screen.getAllByTestId("chart")).toHaveLength(1);
  });

  it("offers a single execute path, not one per layout", () => {
    renderApp();

    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });

  it("keeps the builder mounted when the user switches to the orders tab", async () => {
    const { user } = renderApp();

    await user.click(ordersTab());

    expect(mounts.assembly).toBe(1);
    expect(unmounts.assembly ?? 0).toBe(0);
  });

  it("preserves work in the builder across a tab switch and back", async () => {
    const { user } = renderApp();

    await user.type(
      screen.getByLabelText("assembly draft"),
      "a four-leg strategy",
    );

    await user.click(ordersTab());
    await user.click(builderTab());

    // The panel was hidden, not swapped out, so its state survived. Remounting
    // it - which is what the duplicated tree did on every resize across
    // 1024px - would hand the user an empty builder here.
    expect(screen.getByLabelText("assembly draft")).toHaveValue(
      "a four-leg strategy",
    );
    expect(mounts.assembly).toBe(1);
  });

  it("hides the inactive panel rather than unmounting it", async () => {
    const { user } = renderApp();

    await user.click(ordersTab());

    const wrapper = panelRoot("assembly-panel");
    expect(wrapper).toBeInTheDocument();
    // Hidden only below `lg`; the desktop layout still shows both panels.
    expect([...wrapper.classList]).toContain("hidden");
    expect([...wrapper.classList]).toContain("lg:block");
  });

  it("shows both panels side by side once neither tab is inactive", () => {
    renderApp();

    // The builder is the active tab, so only the orders panel is hidden below
    // `lg` - and it carries `lg:grid`, so the desktop layout still shows it.
    expect([...panelRoot("assembly-panel").classList]).not.toContain("hidden");
    expect([...panelRoot("orders-panel").classList]).toContain("lg:grid");
  });

  it("keeps both panels in one shared tree", () => {
    renderApp();

    // One shared parent, not a desktop container and a separate mobile one.
    expect(panelRoot("assembly-panel").parentElement).toBe(
      panelRoot("orders-panel").parentElement,
    );
  });
});
