import { useState, useMemo } from "react";
import StrategyAssembly from "./components/widgets/strategyAssembly/strategyAssembly";
import { ActiveOrders } from "./components/widgets/activeOrders";
import DragOverlay from "./components/common/DragOverlay";
import { OrdersStoreProvider, useOrdersStore } from "./store";
import { useLiveOrdersCount } from "./store";
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
  const [activeTab, setActiveTab] = useState<"assembly" | "orders">("assembly");
  const [editedStrategyId, setEditedStrategyId] = useState<string | null>(null);

  const {
    orderConfig,
    orderCount,
    showSuccess,
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

  // Load an entire strategy group into the builder for editing
  const handleEditGroup = (
    orders: import("./types/activeOrders").ActiveOrderEntry[],
  ) => {
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
        error={error}
        simulationMessage={simulationMessage}
        isEffectivelySimulation={isEffectivelySimulation}
        canToggle={canToggle}
        isSimulationMode={isSimulationMode}
        onToggleSimulationMode={toggleSimulationMode}
        isEditMode={isEditMode}
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
          or a chart-library throw cannot take the builder down with it. */}
      <div className="overflow-hidden">
        <ErrorBoundary
          title="The chart could not be displayed"
          message="Your strategy is unaffected - you can keep building and submitting orders."
          compact
        >
          <OrderChart orders={orderConfig} />
        </ErrorBoundary>
      </div>
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
        />
      </div>
    </div>
  );

  return (
    <div className={appContainer}>
      {/* The page needs a level-1 heading, and the visible layout has no room
          for one: the two panels start at `h2`. Visually hidden keeps the
          heading order honest without claiming layout the phone lane owns. */}
      <h1 className="sr-only">Block Builder</h1>

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
        {/* One tree for both layouts: a stacked, tabbed column below `lg`, and
            the two-column grid above it. */}
        <div className="px-4 py-4 lg:grid lg:grid-cols-[700px_minmax(300px,1fr)] lg:gap-4 lg:px-6 lg:h-full lg:overflow-hidden">
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
    <OrdersStoreProvider>
      <AppInner />
      {/* Rendered via portal into #drag-overlay - completely outside the
          React tree so drag-position updates never cascade through the grid */}
      <DragOverlay />
    </OrdersStoreProvider>
  );
}

export default App;
