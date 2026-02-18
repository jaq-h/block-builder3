import { Routes, Route } from "react-router-dom";
import StrategyAssembly from "./components/widgets/strategyAssembly/strategyAssembly";
import { ActiveOrders } from "./components/widgets/activeOrders";
import DragOverlay from "./components/common/DragOverlay";
import NavBar from "./components/common/NavBar";
import { ExecuteTradePanel } from "./components/widgets/strategyAssembly/components";
import { OrdersStoreProvider, useOrdersStore } from "./store";
import { useTradeExecution } from "./hooks";
import { appContainer, mainContent } from "./App.styles";

// =============================================================================
// INNER APP COMPONENT (uses the store)
// =============================================================================

function AppInner() {
  const { submittedOrders } = useOrdersStore();

  const {
    orderCount,
    showSuccess,
    strategyKey,
    isSubmitting,
    error,
    isSimulationMode,
    canToggle,
    toggleSimulationMode,
    handleConfigChange,
    handleExecuteTrade,
    simulationMessage,
    isEffectivelySimulation,
  } = useTradeExecution();

  return (
    <div className={appContainer}>
      <NavBar />

      <main className={mainContent}>
        <Routes>
          {/* Home — Strategy Assembly */}
          <Route
            path="/"
            element={
              <>
                <StrategyAssembly
                  key={strategyKey}
                  onConfigChange={handleConfigChange}
                />
                {orderCount > 0 && (
                  <ExecuteTradePanel
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
                  />
                )}
              </>
            }
          />

          {/* Active Orders */}
          <Route
            path="/active"
            element={
              <ActiveOrders
                onOrderSelect={(orderId) => {
                  console.log("Selected order:", orderId);
                }}
                initialOrders={submittedOrders}
              />
            }
          />
        </Routes>
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
