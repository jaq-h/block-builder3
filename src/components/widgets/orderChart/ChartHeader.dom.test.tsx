// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import ChartHeader from "./ChartHeader";
import type { ChartHeaderControls } from "./ChartHeader";
import { DEFAULT_TIMEFRAME, TIMEFRAMES } from "./timeframes";
import { TIMEFRAME_MAP } from "../../../hooks/useOHLCData";
import {
  chartControlGroup,
  chartHeaderPrimaryRow,
  chartToggleButton,
} from "./OrderChart.styles";
import { DEFAULT_PRICE_SCALE } from "./priceScale";
import { panelHeadingTitle } from "../../../styles/shared";
import { unconditionalUtilities } from "@/test/tailwindTokens";

vi.mock("../../../store/useMarket", () => ({
  useMarket: () => ({
    market: {
      symbol: "BTC/USD",
      base: "BTC",
      quote: "USD",
      name: "Bitcoin",
      quotePrefix: "$",
    },
  }),
}));

const controls = (): ChartHeaderControls => ({
  activeTimeframe: DEFAULT_TIMEFRAME,
  onSelectTimeframe: vi.fn(),
  enabledIndicators: new Set<string>(),
  onToggleIndicator: vi.fn(),
  priceScale: DEFAULT_PRICE_SCALE,
  onSelectPriceScale: vi.fn(),
});

/** Utilities that turn a box into a scroll container. */
const SCROLLING_UTILITIES = [
  "overflow-auto",
  "overflow-scroll",
  "overflow-x-auto",
  "overflow-x-scroll",
  "overflow-y-auto",
  "overflow-y-scroll",
];

describe("ChartHeader", () => {
  // ===========================================================================
  // THE OFFLINE WARNING
  // ===========================================================================
  //
  // The one thing in this header that is not a control, and the one thing whose
  // absence is dangerous: without it the panel keeps drawing the last price it
  // saw as though it were live. An attempt at this panel's overflow made the
  // strip holding it `truncate` so it would yield width first, and because
  // `truncate` carries `overflow: hidden` the strip collapsed to 0px at every
  // width the app is actually narrow at - the warning disappeared while the
  // pair and the price beside it stayed. jsdom does no layout, so the collapse
  // itself is not observable here; what is, and what these check, is that the
  // warning is rendered at all and reaches the accessibility tree.

  it("shows the offline warning when the feed has been given up on", () => {
    render(<ChartHeader priceLabel="$50,000.0" isFeedOffline controls={controls()} />);

    const warning = screen.getByText("Live feed offline");
    expect(warning).toBeInTheDocument();
    // Visible to assistive technology as well as on screen: nothing between it
    // and the document may be hiding it.
    expect(warning.closest("[aria-hidden='true']")).toBeNull();
  });

  it("says nothing about the feed while it is healthy", () => {
    render(<ChartHeader priceLabel="$50,000.0" controls={controls()} />);

    expect(screen.queryByText("Live feed offline")).not.toBeInTheDocument();
  });

  // ===========================================================================
  // THE ROWS WRAP, AND NOTHING SCROLLS - A STYLESHEET CONTRACT, NOT A BEHAVIOUR
  // ===========================================================================
  //
  // WHAT THESE THREE ASSERT, PLAINLY: the class strings this app ships. They are
  // a stylesheet contract, the same shape as `vite/buttonResetLayer.test.ts`
  // reading `src/index.css` as text, and they exist for the same stated reason -
  // jsdom applies no author stylesheet, so no rendering test in this suite can
  // see a cascade, and this project has no browser-mode runner that could assert
  // the rendered result instead.
  //
  // WHAT THEY DO NOT PROVE: anything about what the browser draws. They would go
  // red on a behaviour-preserving rewrite - `min-h-[64px]` for `min-h-16`, or
  // moving the wrapping into a stylesheet - and they would stay green if the
  // panel regressed for a reason outside this component. The pixel evidence is
  // browser measurement, recorded in the commit message and in `AGENTS.md`.
  //
  // They stay because they are the only executable guard that the two things
  // this change deliberately ruled out cannot come back: the `overflow-x-auto`
  // scroller that was tried and reverted, and a control under the 24px target.

  it("lets the title bar wrap rather than hold a fixed height", () => {
    const classes = chartHeaderPrimaryRow.split(/\s+/);

    expect(classes).toContain("flex-wrap");
    expect(classes).toContain("min-h-16");
    // A fixed height is what pushed the trailing timeframes outside the panel:
    // the row could not grow, so the overflow was drawn and then clipped.
    expect(classes).not.toContain("h-16");
  });

  it("wraps a control group instead of turning it into a scroller", () => {
    const classes = chartControlGroup.split(/\s+/);

    expect(classes).toContain("flex-wrap");
    // The app's chrome wraps and never scrolls: a scrollport here is a box
    // whose height depends on the platform's scrollbar, and it clips the focus
    // rings of the controls inside it. See `AGENTS.md`.
    for (const utility of SCROLLING_UTILITIES) {
      expect(classes).not.toContain(utility);
    }
  });

  it("keeps every control at the 24px minimum target size", () => {
    for (const isActive of [true, false]) {
      const classes = chartToggleButton({ isActive }).split(/\s+/);
      expect(classes).toContain("min-h-6");
      expect(classes).toContain("min-w-6");
      // A flex item shrinks by default, and a control squeezed under the floor
      // breaches SC 2.5.8 exactly as one drawn under it does.
      expect(classes).toContain("shrink-0");
    }
  });

  // ===========================================================================
  // THE PLACEHOLDER IS THIS COMPONENT, NOT A COPY OF IT
  // ===========================================================================
  //
  // Height is what has to match, and no constant can hold it: what a wrapped row
  // measures depends on the panel's width. Rendering the same markup is what
  // makes the two equal, so what is checkable here is that the placeholder draws
  // the same controls - measured equal in a browser at 390, 1024 and 1440.

  it("draws the same controls with and without its handlers", () => {
    const { unmount } = render(
      <ChartHeader priceLabel="Loading…" controls={controls()} />,
    );
    const live = screen.getAllByRole("button").map((b) => b.textContent);
    unmount();

    render(<ChartHeader priceLabel="Loading…" />);
    const placeholder = screen
      .getAllByRole("button", { hidden: true })
      .map((b) => b.textContent);

    expect(placeholder).toEqual(live);
  });

  it("offers no control it cannot yet operate", () => {
    render(<ChartHeader priceLabel="Loading…" />);

    const buttons = screen.getAllByRole("button", { hidden: true });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      // Disabled takes it out of the tab order, so nothing is reachable that
      // would silently do nothing when pressed.
      expect(button).toBeDisabled();
    }
    // And nothing announces a toggle that is not wired to anything.
    for (const label of ["Timeframe", "Indicators", "Price scale"]) {
      expect(screen.queryByRole("group", { name: label })).not.toBeInTheDocument();
    }
  });

  it("wires each control to its handler once the chart is there", () => {
    const wired = controls();
    render(<ChartHeader priceLabel="$50,000.0" controls={wired} />);

    const group = screen.getByRole("group", { name: "Timeframe" });
    within(group).getByRole("button", { name: "1m" }).click();

    expect(wired.onSelectTimeframe).toHaveBeenCalledWith("1m");
  });

  // ===========================================================================
  // THE PANEL'S TITLE IS A HEADING
  // ===========================================================================

  it("writes the pair as the panel's level-2 heading, on the bar's centre line", () => {
    render(<ChartHeader priceLabel="$50,000.0" controls={controls()} />);

    // A heading rather than a span, at the same level the Active Orders panel's
    // title carries: three unmarked bars is a page with no heading order to
    // navigate, and this is one of the three.
    const heading = screen.getByRole("heading", {
      name: "BTC / USD",
      level: 2,
    });

    // `m-0` is the only thing the heading adds over the span it replaced, and
    // it is defensive: preflight already zeroes a heading's margin and this
    // app's own `@layer base` adds none back, so the UA stylesheet's
    // `margin: 0.83em 0` never reaches this `<h2>`. It is pinned because the
    // bar is `items-center`, so a heading that ever regained a margin would
    // grow the bar and take its title off the centre line the other panels'
    // titles sit on. jsdom applies no author stylesheet, so the class list is
    // the strongest check available here - the geometry is a browser
    // measurement.
    expect(unconditionalUtilities(heading.className)).toContain("m-0");
    expect(heading.className).toBe(panelHeadingTitle);
  });

  it("draws the same heading while the chart chunk is still in flight", () => {
    // The placeholder is this component with its controls omitted, so the two
    // are the same markup by construction. A heading that appeared only once
    // the chunk landed would make the swap a change of document outline.
    render(<ChartHeader priceLabel="Loading…" />);

    expect(
      screen.getByRole("heading", { name: "BTC / USD", level: 2 }),
    ).toBeInTheDocument();
  });

  // ===========================================================================
  // TWO LISTS THAT MUST STAY IN STEP
  // ===========================================================================

  it("offers no timeframe the OHLC feed cannot turn into an interval", () => {
    for (const timeframe of TIMEFRAMES) {
      expect(
        TIMEFRAME_MAP[timeframe],
        `"${timeframe}" is offered but has no interval, so it would silently draw hourly bars`,
      ).toBeTypeOf("number");
    }
    expect(TIMEFRAMES).toContain(DEFAULT_TIMEFRAME);
  });
});
