import { useState, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import StrategyAssembly from "./components/widgets/strategyAssembly/strategyAssembly";
import { ActiveOrders } from "./components/widgets/activeOrders";
import DragOverlay from "./components/common/DragOverlay";
import { MarketProvider, OrdersStoreProvider, useOrdersStore } from "./store";
import { useLiveOrdersCount, useMarket } from "./store";
import { OrderChart } from "./components/widgets/orderChart";
import { useTradeExecution } from "./hooks";
import {
  appContainer,
  mainContent,
  navBar,
  navLinkVariants,
  navIcon,
  orderBadge,
} from "./App.styles";
import ToolsIcon from "./assets/icons/tools.svg?react";
import OrdersIcon from "./assets/icons/orders.svg?react";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { cn } from "./lib/utils";

// =============================================================================
// INNER APP COMPONENT (uses the store)
// =============================================================================

function AppInner() {
  const { submittedOrders } = useOrdersStore();
  const liveOrderCount = useLiveOrdersCount();
  const { market, markets, selectMarket } = useMarket();
  const [activeTab, setActiveTab] = useState<"assembly" | "orders">("assembly");
  const [editedStrategyId, setEditedStrategyId] = useState<string | null>(null);

  // A refused edit, shown on the strategy it was pressed on and announced by
  // the grid. `attempt` is what makes pressing Edit twice on the same strategy
  // two facts rather than one: the value has to change for the grid's effect to
  // report it again. `strategyId` is what puts the visible half back where the
  // press happened.
  const [strategyMarketUnavailable, setStrategyMarketUnavailable] = useState<{
    symbol: string;
    strategyId: string | null;
    attempt: number;
  } | null>(null);
  const unavailableAttempt = useRef(0);

  /**
   * The Active Orders tab button, so activating "View Active Orders" can hand
   * focus to it.
   *
   * That control lives inside the assembly panel and is only rendered below
   * `lg`, where switching tabs puts `hidden lg:block` on the panel around it -
   * so the button the user just pressed goes into a `display: none` subtree and
   * the browser drops focus to `<body>`, restarting the next Tab at the top of
   * the document. The tab button is the right landing place: it is on screen
   * either way, and it says where the user now is.
   *
   * Saying so is what the `flushSync` is for. The switch is committed before
   * focus moves, so the button already carries `aria-pressed="true"` when the
   * focus event fires: a screen reader computes name and state at that moment,
   * and focusing first would have it announce the stale unpressed tab with no
   * guarantee of re-announcing when the attribute later changed.
   */
  const ordersTabRef = useRef<HTMLButtonElement>(null);

  const showActiveOrders = () => {
    flushSync(() => setActiveTab("orders"));
    // The tab bar is not inside the subtree being hidden, so it is mounted and
    // focusable either side of the switch.
    ordersTabRef.current?.focus();
  };

  // A strategy that has just been loaded into the builder, held here rather
  // than in the builder because loading one *remounts* the builder: `loadConfig`
  // bumps `strategyKey`, which is the assembly panel's `key`, so a fresh
  // `GridArea` comes up already holding the loaded strategy's market and has
  // nothing left to notice. `App` is what survives that remount, so `App` is
  // what carries the fact across it. The grid clears it once it has spoken, so
  // a later remount - a submission bumps the same key - does not say it twice.
  const [strategyLoaded, setStrategyLoaded] = useState<{
    symbol: string;
    name: string;
    marketChanged: boolean;
  } | null>(null);

  const {
    orderConfig,
    orderCount,
    showSuccess,
    feedbackRef,
    strategyKey,
    initialConfig,
    isEditMode,
    isSubmitting,
    error,
    isSimulationMode,
    canToggle,
    toggleSimulationMode,
    handleConfigChange,
    handleExecuteTrade,
    loadConfig,
    simulationMessage,
    isEffectivelySimulation,
  } = useTradeExecution();

  // The editing highlight only exists while the builder is in edit mode, so it
  // is derived during render rather than cleared from an effect afterwards -
  // that clearing cost a whole extra render pass and briefly showed the
  // highlight on a strategy that was no longer being edited.
  const editingStrategyId = isEditMode ? editedStrategyId : null;

  // Load an entire strategy group into the builder for editing.
  //
  // The strategy's own market comes back with it. Every position it holds is a
  // percentage offset from a market price, so reloading an ARB/USD strategy
  // while BTC/USD is selected would silently reprice the whole thing - the same
  // numbers describing an entirely different order set.
  //
  // `selectMarket` reports whether it could, and a strategy whose market the
  // catalogue no longer holds is refused rather than loaded: repricing it
  // against whatever is currently selected is the same corruption, one step
  // further out. A silent refusal is barely better than a silent repricing, so
  // it is said twice: on the strategy's own card, where the press happened, and
  // by the grid's announcer. The card is the half that carries below `lg`,
  // where the assembly panel - live region and all - is `display: none`.
  const handleEditGroup = (
    orders: import("./types/activeOrders").ActiveOrderEntry[],
  ) => {
    const symbol = orders[0]?.symbol;
    if (!symbol || !selectMarket(symbol)) {
      setStrategyMarketUnavailable({
        symbol: symbol ?? "an unknown market",
        strategyId: orders[0]?.strategyId ?? null,
        attempt: unavailableAttempt.current++,
      });
      return;
    }
    setStrategyMarketUnavailable(null);

    // Said as one sentence by the grid's announcer, because it is one event:
    // the grid now holds a strategy it did not hold, and it may be priced from
    // a market the user was not looking at. Both halves are invisible without
    // sight of the grid - a `<select>` whose value is set programmatically
    // announces nothing - and reporting them separately would be two
    // live-region writes racing each other.
    setStrategyLoaded({
      symbol,
      name: markets.find((option) => option.symbol === symbol)?.name ?? symbol,
      marketChanged: symbol !== market.symbol,
    });

    const config: import("./types/grid").OrderConfig = {};
    for (const order of orders) {
      config[order.id] = {
        col: order.col,
        row: order.row,
        type: order.type,
        ...(order.axis !== undefined && { axis: order.axis }),
        ...(order.yPosition !== undefined && { yPosition: order.yPosition }),
        ...(order.direction !== undefined && { direction: order.direction }),
      };
    }
    loadConfig(config);
    setEditedStrategyId(orders[0]?.strategyId ?? null);
  };

  // Merge live assembly positions into submitted orders while editing.
  // orderConfig updates on every drag pointermove via onConfigChange, so
  // active order cards reflect block positions in real-time.
  const displayOrders = useMemo(() => {
    if (!isEditMode || !editingStrategyId) return submittedOrders;
    const merged = { ...submittedOrders };
    for (const [id, liveEntry] of Object.entries(orderConfig)) {
      if (merged[id]) {
        merged[id] = {
          ...merged[id],
          col: liveEntry.col,
          row: liveEntry.row,
          type: liveEntry.type,
          ...(liveEntry.axis !== undefined && { axis: liveEntry.axis }),
          ...(liveEntry.yPosition !== undefined && { yPosition: liveEntry.yPosition }),
          ...(liveEntry.direction !== undefined && { direction: liveEntry.direction }),
        };
      }
    }
    return merged;
  }, [submittedOrders, isEditMode, editingStrategyId, orderConfig]);

  // Both panels are rendered exactly once, in one tree. Below `lg` the inactive
  // one is hidden with `display: none` rather than swapped out, which is what
  // keeps its component state alive: rendering the same element in a desktop
  // branch and a mobile branch mounted two independent copies, so crossing the
  // 1024px breakpoint swapped in an empty grid and silently lost the strategy.
  const assemblyPanel = (
    <div
      className={cn(
        "overflow-hidden",
        activeTab !== "assembly" && "hidden lg:block",
      )}
    >
      <StrategyAssembly
        key={strategyKey}
        onConfigChange={handleConfigChange}
        initialConfig={initialConfig}
        orderCount={orderCount}
        onExecute={handleExecuteTrade}
        isSubmitting={isSubmitting}
        showSuccess={showSuccess}
        feedbackRef={feedbackRef}
        error={error}
        simulationMessage={simulationMessage}
        isEffectivelySimulation={isEffectivelySimulation}
        canToggle={canToggle}
        isSimulationMode={isSimulationMode}
        onToggleSimulationMode={toggleSimulationMode}
        onViewActiveOrders={showActiveOrders}
        isEditMode={isEditMode}
        strategyMarketUnavailable={strategyMarketUnavailable}
        strategyLoaded={strategyLoaded}
        onStrategyLoadAnnounced={() => setStrategyLoaded(null)}
      />
    </div>
  );

  const ordersPanel = (
    <div
      className={cn(
        "grid grid-rows-[400px_1fr] overflow-hidden",
        activeTab !== "orders" && "hidden lg:grid",
      )}
    >
      {/* Chart - fixed 400px row. Boundaried separately so a bad candle payload
          or a chart-library throw cannot take the builder down with it.

          A `region` landmark, like the other two panels, so a landmark user can
          reach each panel rather than one undivided `main`. It is named here
          and NOT by its own `<h2>`: that heading is the selected pair, which
          changes under the user as they switch markets, and a landmark whose
          name moves is one they cannot navigate back to. Same reasoning as the
          cell clear control's stable name - see `AGENTS.md`. */}
      <section aria-label="Price chart" className="overflow-hidden">
        <ErrorBoundary
          title="The chart could not be displayed"
          message="Your strategy is unaffected - you can keep building and submitting orders."
          compact
        >
          <OrderChart orders={orderConfig} />
        </ErrorBoundary>
      </section>
      {/* Active orders - fills remaining height.
          `overflow-auto`, not `overflow-scroll`: this container never has
          anything to scroll, because `ActiveOrders` is `h-full` inside it and
          its own card list is the scroller. `scroll` drew and reserved a bar on
          both axes anyway, permanently and on a container that cannot move -
          measured empty, scrollHeight 467 against clientHeight 467 and
          scrollWidth 676 against clientWidth 676. `auto` keeps the bar for the
          case where there is genuinely something under it.
          The `max-h-200` is dropped above `lg` only, because that is the only
          place it is wrong: there `lg:h-dvh` makes the `1fr` row definite and
          the cap is a magic 800px on a container the row already bounds. It did
          nothing at 900px tall and actively took room away above that: at
          1440x1400 the row was 968px, the cap held the panel to 800px, and the
          168px it gave up sat empty below while the order list inside was still
          overflowing by 301px. Below `lg` the cap stays: body and `#root` are
          content-sized there, so this whole chain is indefinite and the cap is
          what makes the card list a scroller at all. */}
      <div className="max-h-200 lg:max-h-none overflow-auto border-t border-border-neutral">
        <ActiveOrders
          initialOrders={displayOrders}
          onEditGroup={handleEditGroup}
          editingStrategyId={editingStrategyId}
          refusedStrategy={strategyMarketUnavailable}
        />
      </div>
    </div>
  );

  return (
    <div className={appContainer}>
      {/* Tab nav - only visible on small screens */}
      <nav className={`${navBar} lg:hidden`} aria-label="Panels">
        <button
          type="button"
          aria-pressed={activeTab === "assembly"}
          onClick={() => setActiveTab("assembly")}
          className={navLinkVariants({ isActive: activeTab === "assembly" })}
        >
          <span className={navIcon}>
            <ToolsIcon width={16} height={16} />
          </span>
          Strategy Builder
        </button>
        <button
          ref={ordersTabRef}
          type="button"
          aria-pressed={activeTab === "orders"}
          onClick={() => setActiveTab("orders")}
          className={navLinkVariants({ isActive: activeTab === "orders" })}
        >
          <span className={navIcon}>
            <OrdersIcon width={16} height={16} />
          </span>
          Active Orders
          {liveOrderCount > 0 && (
            <span className={orderBadge}>{liveOrderCount}</span>
          )}
        </button>
      </nav>

      <main className={mainContent}>
        {/* The page needs a level-1 heading, and the visible layout has no room
            for one: every panel starts at `h2`. Visually hidden keeps the
            heading order honest without claiming layout the phone lane owns.

            It is INSIDE `main`, and that is a placement constraint rather than
            a preference. Two things decide it. Outside every landmark - which
            is where it sat, as a sibling of `main` - the heading is content no
            landmark contains, which axe reports as `region` and a landmark
            user cannot reach. And the obvious alternative, a `<header>` banner
            around it and the tab nav, cannot go here: `appContainer`'s row
            template is `grid-rows-[auto_1fr]` below `lg` and `lg:grid-rows-[1fr]`
            above it, and that second value is only correct while `main` is the
            container's ONLY in-flow child up there, which the nav's
            `display: none` is what leaves it - and from inside `main` this
            heading is no candidate for that row at all. A `<header>` would be
            one, and `main` would drop into an implicit row. See `AGENTS.md`,
            "Layout and the CSS cascade".

            `sr-only` is `position: absolute`, and `main` is not positioned, so
            the heading takes its containing block from further up and this adds
            no layout of any kind - the same as where it stood before. */}
        <h1 className="sr-only">Block Builder</h1>

        {/* One tree for both layouts: a stacked, tabbed column below `lg`, and
            the two-column grid above it.

            The assembly column is `minmax(0, 700px)` rather than a flat `700px`
            because the two-column layout starts at `lg`, 1024px, and a flat one
            needs 1064: 700 plus the 300px floor on the orders column, plus a
            16px gap and 24px of padding either side. Between those two widths
            the flat track overflowed a container that is `lg:overflow-hidden`,
            so the orders column was cut off at the viewport edge with its
            Refresh button half outside it and no scrollbar to reach it. The
            `minmax` lets the assembly column give the difference back, and its
            own grid area already scrolls when it is narrower than its content.
            At 1064 and above nothing moves: 700px is still the maximum. */}
        <div className="px-4 py-4 lg:grid lg:grid-cols-[minmax(0,700px)_minmax(300px,1fr)] lg:gap-4 lg:px-6 lg:h-full lg:overflow-hidden">
          {assemblyPanel}
          {ordersPanel}
        </div>
      </main>
    </div>
  );
}

// =============================================================================
// APP COMPONENT (wraps with providers)
// =============================================================================

function App() {
  return (
    // One selected market for the whole tree. It wraps the orders store because
    // everything that renders a price - the builder, the chart, the active
    // orders - has to agree on which pair it is showing, and the only way to
    // guarantee that is for there to be exactly one answer.
    <MarketProvider>
      <OrdersStoreProvider>
        <AppInner />
        {/* Rendered via portal into #drag-overlay - completely outside the
            React tree so drag-position updates never cascade through the grid */}
        <DragOverlay />
      </OrdersStoreProvider>
    </MarketProvider>
  );
}

export default App;
