import { useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import styled from "styled-components";
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
// STYLED COMPONENTS
// =============================================================================

const AppContainer = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--ds-bg-color);
`;

const NavBar = styled.nav`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 24px;
  padding: 12px 24px;
  background-color: rgba(104, 107, 130, 0.1);
  border-bottom: 1px solid var(--border-color-neutral);
`;

const NavLink = styled(Link)<{ $isActive: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  color: ${({ $isActive }) =>
    $isActive ? "var(--text-color-icon-logo)" : "rgba(255, 255, 255, 0.6)"};
  background-color: ${({ $isActive }) =>
    $isActive ? "rgba(133, 91, 251, 0.2)" : "transparent"};
  border: 1px solid
    ${({ $isActive }) =>
      $isActive ? "var(--accent-color-purple)" : "transparent"};
  transition: all 0.2s;

  &:hover {
    background-color: ${({ $isActive }) =>
      $isActive ? "rgba(133, 91, 251, 0.25)" : "rgba(104, 107, 130, 0.15)"};
    color: var(--text-color-icon-logo);
  }
`;

const NavIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    stroke: currentColor;
  }
`;

const OrderBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
  background-color: rgba(76, 175, 80, 0.3);
  color: #4caf50;
`;

const MainContent = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const ExecuteButtonContainer = styled.div`
  padding: 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`;

const ExecuteButton = styled.button<{ $isSubmitting?: boolean }>`
  padding: 10px 20px;
  background-color: ${({ $isSubmitting }) =>
    $isSubmitting ? "#666" : "#4caf50"};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: ${({ $isSubmitting }) => ($isSubmitting ? "not-allowed" : "pointer")};
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover:not(:disabled) {
    background-color: #45a049;
  }

  &:disabled {
    opacity: 0.7;
  }
`;

const DevModeBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background-color: rgba(255, 193, 7, 0.2);
  color: #ffc107;
  border: 1px solid rgba(255, 193, 7, 0.3);

  svg {
    stroke: currentColor;
  }
`;

const SuccessMessage = styled.div`
  color: #4caf50;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;

  svg {
    stroke: currentColor;
  }
`;

const ErrorMessage = styled.div`
  color: #f44336;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;

  svg {
    stroke: currentColor;
  }
`;

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
  const { submitOrders, submittedOrders, isSubmitting, error, clearError } =
    useOrdersStore();

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

  return (
    <AppContainer>
      {/* Navigation Bar */}
      <NavBar>
        <NavLink to="/" $isActive={location.pathname === "/"}>
          <NavIcon>
            <ToolsIcon width={16} height={16} />
          </NavIcon>
          Strategy Builder
        </NavLink>
        <NavLink to="/active" $isActive={location.pathname === "/active"}>
          <NavIcon>
            <OrdersIcon width={16} height={16} />
          </NavIcon>
          Active Orders
          {activeOrderCount > 0 && <OrderBadge>{activeOrderCount}</OrderBadge>}
        </NavLink>
      </NavBar>

      {/* Main Content */}
      <MainContent>
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
                  <ExecuteButtonContainer>
                    {isDev && (
                      <DevModeBadge>
                        <ToolsIcon width={12} height={12} />
                        Development Mode - Orders saved locally
                      </DevModeBadge>
                    )}
                    <ExecuteButton
                      onClick={handleExecuteTrade}
                      disabled={isSubmitting}
                      $isSubmitting={isSubmitting}
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
                    </ExecuteButton>
                    {showSuccess && (
                      <SuccessMessage>
                        <CheckIcon width={14} height={14} />
                        Orders submitted successfully!
                        <Link
                          to="/active"
                          style={{
                            color: "#4caf50",
                            marginLeft: "8px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          View Active Orders
                          <ArrowRightIcon width={12} height={12} />
                        </Link>
                      </SuccessMessage>
                    )}
                    {error && (
                      <ErrorMessage>
                        <AlertTriangleIcon width={14} height={14} />
                        {error}
                      </ErrorMessage>
                    )}
                  </ExecuteButtonContainer>
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
      </MainContent>
    </AppContainer>
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
