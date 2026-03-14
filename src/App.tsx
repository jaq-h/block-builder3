import { useState, useEffect, useMemo } from "react";
import StrategyAssembly from "./components/widgets/strategyAssembly/strategyAssembly";
import { ActiveOrders } from "./components/widgets/activeOrders";
import DragOverlay from "./components/common/DragOverlay";
import { OrdersStoreProvider, useOrdersStore } from "./store";
import { useLiveOrdersCount } from "./store";
import { OrderChart } from "./components/widgets/orderChart";
import { useTradeExecution } from "./hooks";
import { appContainer, mainContent, navBar, navLinkVariants, navIcon, orderBadge } from "./App.styles";
import ToolsIcon from "./assets/icons/tools.svg?react";
import OrdersIcon from "./assets/icons/orders.svg?react";

// =============================================================================
// INNER APP COMPONENT (uses the store)
// =============================================================================

function AppInner() {
  const { submittedOrders } = useOrdersStore();
  const liveOrderCount = useLiveOrdersCount();
  const [activeTab, setActiveTab] = useState<"assembly" | "orders">("assembly");
  const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null);

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

  // Clear editing highlight when edit mode ends (after submit/clear)
  useEffect(() => {
    if (!isEditMode) setEditingStrategyId(null);
  }, [isEditMode]);

  // Load an entire strategy group into the builder for editing
  const handleEditGroup = (orders: import("./types/activeOrders").ActiveOrderEntry[]) => {
    const config: import("./types/grid").OrderConfig = {};
    for (const order of orders) {
      config[order.id] = {
        col: order.col,
        row: order.row,
        type: order.type,
        ...(order.axis !== undefined && { axis: order.axis }),
        ...(order.yPosition !== undefined && { yPosition: order.yPosition }),
      };
    }
    loadConfig(config);
    setEditingStrategyId(orders[0]?.strategyId ?? null);
  };

  // Merge live assembly positions into submitted orders while editing.
  // orderConfig updates on every drag mousemove via onConfigChange, so
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
        };
      }
    }
    return merged;
  }, [submittedOrders, isEditMode, editingStrategyId, orderConfig]);

  const assemblyPanel = (
    <div className="flex flex-col w-[700px] shrink-0">
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
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* Chart preview — top half: shows live assembly config only */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <OrderChart orders={orderConfig} />
      </div>
      {/* Active orders list — bottom half */}
      <div className="flex-1 min-h-0 overflow-hidden border-t border-border-neutral">
        <ActiveOrders
          onOrderSelect={(orderId) => {
            console.log("Selected order:", orderId);
          }}
          initialOrders={displayOrders}
          onEditGroup={handleEditGroup}
          editingStrategyId={editingStrategyId}
        />
      </div>
    </div>
  );

  return (
    <div className={appContainer}>
      {/* Tab nav — only visible on small screens */}
      <nav className={`${navBar} lg:hidden`}>
        <button
          onClick={() => setActiveTab("assembly")}
          className={navLinkVariants({ isActive: activeTab === "assembly" })}
        >
          <span className={navIcon}>
            <ToolsIcon width={16} height={16} />
          </span>
          Strategy Builder
        </button>
        <button
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
        {/* Large screens: side by side */}
        <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden gap-4 px-6 py-4">
          {assemblyPanel}
          {ordersPanel}
        </div>

        {/* Small screens: single active tab */}
        <div className="flex flex-1 min-h-0 overflow-hidden lg:hidden px-4 py-4">
          {activeTab === "assembly" ? assemblyPanel : ordersPanel}
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
      {/* Rendered via portal into #drag-overlay — completely outside the
          React tree so drag-position updates never cascade through the grid */}
      <DragOverlay />
    </OrdersStoreProvider>
  );
}

export default App;
