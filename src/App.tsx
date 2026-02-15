import { useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { cva } from "class-variance-authority";
import { cn } from "./lib/utils";
import StrategyAssembly from "./components/widgets/strategyAssembly/strategyAssembly";
import { ActiveOrders } from "./components/widgets/activeOrders";
import type { OrderConfig } from "./types/grid";
import { OrdersStoreProvider, useOrdersStore } from "./store";
import ToolsIcon from "./assets/icons/tools.svg?react";
import OrdersIcon from "./assets/icons/orders.svg?react";
import CheckIcon from "./assets/icons/check.svg?react";
import ArrowRightIcon from "./assets/icons/arrow-right.svg?react";
import AlertTriangleIcon from "./assets/icons/alert-triangle.svg?react";
import ClockIcon from "./assets/icons/clock.svg?react";

// =============================================================================
// CVA VARIANTS
// =============================================================================

const navLinkVariants = cva(
  [
    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
    "no-underline transition-all duration-200 border",
  ],
  {
    variants: {
      isActive: {
        true: [
          "text-text-primary bg-accent-bg-subtle border-accent-primary",
          "hover:bg-accent-bg-hover hover:text-text-primary",
        ],
        false: [
          "text-text-tertiary bg-transparent border-transparent",
          "hover:bg-neutral-bg-hover hover:text-text-primary",
        ],
      },
    },
    defaultVariants: {
      isActive: false,
    },
  },
);

const executeButtonVariants = cva(
  [
    "px-5 py-2.5 text-white border-none rounded text-sm font-medium",
    "transition-colors duration-200 flex items-center gap-2",
    "hover:enabled:bg-status-green-hover disabled:opacity-70",
  ],
  {
    variants: {
      isSubmitting: {
        true: "bg-disabled-bg cursor-not-allowed",
        false: "bg-status-green cursor-pointer",
      },
    },
    defaultVariants: {
      isSubmitting: false,
    },
  },
);

const simulationBadgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium",
    "border [&>svg]:stroke-current",
  ],
  {
    variants: {
      isSimulation: {
        true: "bg-status-yellow-bg text-status-yellow border-status-yellow-bg-strong",
        false:
          "bg-status-green-bg text-status-green border-status-green-bg-strong",
      },
    },
    defaultVariants: {
      isSimulation: true,
    },
  },
);

// =============================================================================
// STATIC CLASS STRINGS
// =============================================================================

const appContainerClass = "min-h-screen flex flex-col bg-bg-primary";

const navBarClass =
  "flex justify-center items-center gap-6 px-6 py-3 bg-neutral-bg border-b border-border-neutral";

const navIconClass =
  "inline-flex items-center justify-center [&>svg]:stroke-current";

const orderBadgeClass =
  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-full text-[11px] font-semibold bg-status-green-bg-strong text-status-green";

const mainContentClass = "flex-1 flex flex-col";

const executeButtonContainerClass =
  "p-4 text-center flex flex-col items-center gap-2";

const simulationToggleClass = cn(
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium",
  "bg-transparent text-text-tertiary border border-white-20",
  "cursor-pointer transition-all duration-200",
  "hover:bg-white-10 hover:text-text-secondary hover:border-white-30",
);

const simulationModeContainerClass = "flex items-center gap-2";

const successMessageClass =
  "text-status-green text-[13px] flex items-center gap-1.5 [&>svg]:stroke-current";

const errorMessageClass =
  "text-status-red text-[13px] flex items-center gap-1.5 [&>svg]:stroke-current";

const successLinkClass =
  "text-status-green ml-2 inline-flex items-center gap-1";

// =============================================================================
// INNER APP COMPONENT (uses the store)
// =============================================================================

function AppInner() {
  const location = useLocation();

  // App manages the order config at its level
  const [orderConfig, setOrderConfig] = useState<OrderConfig>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [strategyKey, setStrategyKey] = useState(0); // Key to force reset

  // Get orders store
  const {
    submitOrders,
    submittedOrders,
    isSubmitting,
    error,
    clearError,
    isSimulationMode,
    toggleSimulationMode,
  } = useOrdersStore();

  // Count active orders for badge
  const activeOrderCount = Object.values(submittedOrders).filter(
    (o) => o.status === "active" || o.status === "pending",
  ).length;

  const handleConfigChange = (config: OrderConfig) => {
    setOrderConfig(config);
    // Clear any previous success message when config changes
    setShowSuccess(false);
    clearError();
  };

  const handleExecuteTrade = async () => {
    if (Object.keys(orderConfig).length === 0) return;

    const success = await submitOrders(orderConfig);

    if (success) {
      setShowSuccess(true);
      // Clear the strategy assembly after successful submission
      setOrderConfig({});
      // Increment key to force StrategyAssembly to reset
      setStrategyKey((prev) => prev + 1);
      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  const isDev = import.meta.env.DEV;

  // Determine what message to show based on environment and simulation mode
  const getSimulationMessage = () => {
    if (isDev) {
      return "Development Mode - Orders saved locally";
    }
    if (isSimulationMode) {
      return "Simulation Mode - Orders saved locally";
    }
    return "Production Mode - Orders sent to API";
  };

  return (
    <div className={appContainerClass}>
      {/* Navigation Bar */}
      <nav className={navBarClass}>
        <Link
          to="/"
          className={navLinkVariants({ isActive: location.pathname === "/" })}
        >
          <span className={navIconClass}>
            <ToolsIcon width={16} height={16} />
          </span>
          Strategy Builder
        </Link>
        <Link
          to="/active"
          className={navLinkVariants({
            isActive: location.pathname === "/active",
          })}
        >
          <span className={navIconClass}>
            <OrdersIcon width={16} height={16} />
          </span>
          Active Orders
          {activeOrderCount > 0 && (
            <span className={orderBadgeClass}>{activeOrderCount}</span>
          )}
        </Link>
      </nav>

      {/* Main Content */}
      <main className={mainContentClass}>
        <Routes>
          {/* Home - Strategy Assembly */}
          <Route
            path="/"
            element={
              <>
                <StrategyAssembly
                  key={strategyKey}
                  onConfigChange={handleConfigChange}
                />
                {/* Execute Trade Button - only show when there are orders */}
                {Object.keys(orderConfig).length > 0 && (
                  <div className={executeButtonContainerClass}>
                    <div className={simulationModeContainerClass}>
                      <div
                        className={simulationBadgeVariants({
                          isSimulation: isDev || isSimulationMode,
                        })}
                      >
                        <ToolsIcon width={12} height={12} />
                        {getSimulationMessage()}
                      </div>
                      {/* Only show toggle in production - dev always simulates */}
                      {!isDev && (
                        <button
                          className={simulationToggleClass}
                          onClick={toggleSimulationMode}
                          title={
                            isSimulationMode
                              ? "Switch to production mode (requires API credentials)"
                              : "Switch to simulation mode"
                          }
                        >
                          {isSimulationMode
                            ? "Switch to Production"
                            : "Switch to Simulation"}
                        </button>
                      )}
                    </div>
                    <button
                      className={executeButtonVariants({
                        isSubmitting: isSubmitting,
                      })}
                      onClick={handleExecuteTrade}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <ClockIcon width={14} height={14} />
                          Submitting...
                        </>
                      ) : (
                        <>
                          Execute Trade ({Object.keys(orderConfig).length}{" "}
                          orders)
                        </>
                      )}
                    </button>
                    {showSuccess && (
                      <div className={successMessageClass}>
                        <CheckIcon width={14} height={14} />
                        Orders submitted successfully!
                        <Link to="/active" className={successLinkClass}>
                          View Active Orders
                          <ArrowRightIcon width={12} height={12} />
                        </Link>
                      </div>
                    )}
                    {error && (
                      <div className={errorMessageClass}>
                        <AlertTriangleIcon width={14} height={14} />
                        {error}
                      </div>
                    )}
                  </div>
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
    </OrdersStoreProvider>
  );
}

export default App;
