// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

// Scoped to the tab bar rather than the whole document: the assembly panel
// also offers an "Active Orders" control - the tab switch that replaced the
// router's `/active` link - and an unscoped query matches both.
const tabBar = () => within(screen.getByRole("navigation", { name: "Panels" }));
const ordersTab = () => tabBar().getByRole("button", { name: /Active Orders/ });
const builderTab = () =>
  tabBar().getByRole("button", { name: /Strategy Builder/ });

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

  it("switches to the orders tab from inside the assembly panel", async () => {
    const { user } = renderApp();

    // This is what the router's `/active` link became. As a `Link` it pushed a
    // URL that rendered the identical page - there were never any routes - so
    // pressing it changed nothing at any width.
    await user.click(
      within(screen.getByTestId("assembly-panel")).getByRole("button", {
        name: "View Active Orders",
      }),
    );

    expect(ordersTab()).toHaveAttribute("aria-pressed", "true");
    expect([...panelRoot("orders-panel").classList]).not.toContain("hidden");
    expect([...panelRoot("assembly-panel").classList]).toContain("hidden");
  });

  it("hands focus to the Active Orders tab when the assembly panel's control is used", async () => {
    const { user } = renderApp();

    const control = within(screen.getByTestId("assembly-panel")).getByRole(
      "button",
      { name: "View Active Orders" },
    );
    await user.click(control);

    // The control is inside the panel that the switch hides, so leaving focus
    // where it was drops it to `<body>` and the next Tab restarts from the top
    // of the document. The tab button is on screen either way and reads
    // `aria-pressed="true"` once the switch has happened.
    expect(ordersTab()).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it("commits the switch before focus lands, so the tab is already pressed", async () => {
    const { user } = renderApp();

    // A screen reader computes name and state when the focus event fires, with
    // no guarantee of re-announcing an attribute that changes afterwards. If
    // the state update is left to be batched after the `focus()` call, what is
    // announced is the tab the user has just left.
    const tab = ordersTab();
    let pressedWhenFocused: string | null = null;
    tab.addEventListener("focus", () => {
      pressedWhenFocused = tab.getAttribute("aria-pressed");
    });

    await user.click(
      within(screen.getByTestId("assembly-panel")).getByRole("button", {
        name: "View Active Orders",
      }),
    );

    expect(pressedWhenFocused).toBe("true");
  });

  it("names the tab bar and marks the selected tab programmatically", async () => {
    const { user } = renderApp();

    // Selected state may never be colour alone: it is on `aria-pressed`, the
    // same idiom `PatternSelector` uses, inside a named group.
    expect(builderTab()).toHaveAttribute("aria-pressed", "true");
    expect(ordersTab()).toHaveAttribute("aria-pressed", "false");

    await user.click(ordersTab());

    expect(builderTab()).toHaveAttribute("aria-pressed", "false");
    expect(ordersTab()).toHaveAttribute("aria-pressed", "true");
  });

  it("operates the tabs from the keyboard", async () => {
    const { user } = renderApp();

    builderTab().focus();
    await user.tab();
    expect(ordersTab()).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(ordersTab()).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps both panels in one shared tree", () => {
    renderApp();

    // One shared parent, not a desktop container and a separate mobile one.
    expect(panelRoot("assembly-panel").parentElement).toBe(
      panelRoot("orders-panel").parentElement,
    );
  });
});
