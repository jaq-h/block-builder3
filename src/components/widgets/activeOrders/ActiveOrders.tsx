import { useEffect, useState, type FC } from "react";
import { Link } from "react-router-dom";
import OrdersIcon from "../../../assets/icons/orders.svg?react";
import RefreshIcon from "../../../assets/icons/refresh.svg?react";
import ToolsIcon from "../../../assets/icons/tools.svg?react";
import CheckIcon from "../../../assets/icons/check.svg?react";
import XCircleIcon from "../../../assets/icons/x-circle.svg?react";
import ArrowLeftIcon from "../../../assets/icons/arrow-left.svg?react";
import PencilIcon from "../../../assets/icons/pencil.svg?react";
import { ActiveOrdersProvider } from "./ActiveOrdersContext";
import { useActiveOrders } from "./useActiveOrders";
import type {
  ActiveOrdersProps,
  ActiveOrdersConfig,
  ActiveOrderEntry,
} from "../../../types/activeOrders";
import { useOrdersStore } from "../../../store";
import OrderCard from "./OrderCard";
import {
  container,
  header,
  headerTextClass,
  statusBar,
  statusInfo,
  statusItem,
  statusLabel,
  getStatusValueProps,
  getStatusDotProps,
  refreshButton,
  emptyStateContainer,
  emptyStateIcon,
  emptyStateTitle,
  emptyStateDescription,
  cardsWrapper,
  strategyGroup,
  strategyGroupHeader,
  strategyGroupMeta,
  strategyGroupLabel,
  strategyGroupTime,
  strategyGroupEditButton,
  footer,
  lastUpdated,
  devControlsContainer,
  devControlsHeader,
  devControlsRow,
  devButton,
  devLabel,
  orderIdSelect,
} from "./ActiveOrders.styles";

// =============================================================================
// HELPERS
// =============================================================================

function deriveStrategyLabel(orders: ActiveOrderEntry[]): string {
  const hasCols = new Set(orders.map((o) => o.col));
  if (hasCols.has(0) && hasCols.has(1)) return "Conditional Strategy";
  if (hasCols.has(0) && orders.filter((o) => o.col === 0).length > 1) return "Bulk Entry";
  if (hasCols.has(0)) return "Entry Order";
  if (hasCols.has(1)) return "Exit Order";
  return "Strategy";
}

// Group orders by strategyId, preserving insertion order (most recent first)
function groupByStrategy(
  orders: ActiveOrderEntry[],
): Map<string, ActiveOrderEntry[]> {
  const map = new Map<string, ActiveOrderEntry[]>();
  // Sort newest first by createdAt
  const sorted = [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  for (const order of sorted) {
    const sid = order.strategyId ?? "ungrouped";
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid)!.push(order);
  }
  return map;
}

// =============================================================================
// MAIN EXPORT - Wraps with provider
// =============================================================================

const ActiveOrders: FC<ActiveOrdersProps> = ({
  onOrderSelect,
  initialOrders = {},
  onEditGroup,
  editingStrategyId,
}) => {
  return (
    <ActiveOrdersProvider
      onOrderSelect={onOrderSelect}
      initialOrders={initialOrders}
    >
      <ActiveOrdersInner
        initialOrders={initialOrders}
        onEditGroup={onEditGroup}
        editingStrategyId={editingStrategyId}
      />
    </ActiveOrdersProvider>
  );
};

// =============================================================================
// INNER COMPONENT - Consumes the context
// =============================================================================

interface ActiveOrdersInnerProps {
  initialOrders: ActiveOrdersConfig;
  onEditGroup?: (orders: ActiveOrderEntry[]) => void;
  editingStrategyId?: string | null;
}

const ActiveOrdersInner: FC<ActiveOrdersInnerProps> = ({
  initialOrders,
  onEditGroup,
  editingStrategyId,
}) => {
  const isDev = import.meta.env.DEV;
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  const { activeOrders, setActiveOrders, refreshOrders } = useActiveOrders();
  const { updateOrderStatus, cancelOrder, cancelAllOrders } = useOrdersStore();

  useEffect(() => {
    setActiveOrders(initialOrders);
  }, [initialOrders, setActiveOrders]);

  // Count orders by status
  const totalOrders = Object.keys(activeOrders).length;
  const activeCount = Object.values(activeOrders).filter((o) => o.status === "active").length;
  const pendingCount = Object.values(activeOrders).filter((o) => o.status === "pending").length;
  const filledCount = Object.values(activeOrders).filter((o) => o.status === "filled").length;
  const cancelledCount = Object.values(activeOrders).filter((o) => o.status === "cancelled").length;

  const hasDisplayableOrders = activeCount > 0 || pendingCount > 0;
  const hasAnyOrders = totalOrders > 0;

  // Displayable orders grouped by strategy
  const displayableOrders = Object.values(activeOrders).filter(
    (o) => o.status === "active" || o.status === "pending",
  );
  const strategyGroups = groupByStrategy(displayableOrders);

  // Dev controls
  const actionableOrders = Object.entries(activeOrders).filter(
    ([, order]) => order.status === "active" || order.status === "pending",
  );

  const handleFillOrder = () => {
    if (selectedOrderId) {
      updateOrderStatus(selectedOrderId, "filled");
      setSelectedOrderId("");
    }
  };

  const handleCancelOrder = () => {
    if (selectedOrderId) {
      cancelOrder(selectedOrderId);
      setSelectedOrderId("");
    }
  };

  const handleFillAllOrders = () => {
    actionableOrders.forEach(([id]) => updateOrderStatus(id, "filled"));
  };

  const handleCancelAllOrders = () => {
    cancelAllOrders();
  };

  return (
    <div className={container}>
      <div className={header}>
        <h2 className={headerTextClass}>Active Orders</h2>
      </div>

      {/* Status Bar */}
      <div className={statusBar}>
        <div className={statusInfo}>
          <div className={statusItem}>
            <span className={statusLabel}>Total:</span>
            <span {...getStatusValueProps()}>{totalOrders}</span>
          </div>
          {activeCount > 0 && (
            <div className={statusItem}>
              <span {...getStatusDotProps("#4CAF50")} />
              <span {...getStatusValueProps("#4CAF50")}>{activeCount} Active</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className={statusItem}>
              <span {...getStatusDotProps("#FFC107")} />
              <span {...getStatusValueProps("#FFC107")}>{pendingCount} Pending</span>
            </div>
          )}
          {filledCount > 0 && (
            <div className={statusItem}>
              <span {...getStatusDotProps("#2196F3")} />
              <span {...getStatusValueProps("#2196F3")}>{filledCount} Filled</span>
            </div>
          )}
          {cancelledCount > 0 && (
            <div className={statusItem}>
              <span {...getStatusDotProps("#9E9E9E")} />
              <span {...getStatusValueProps("#9E9E9E")}>{cancelledCount} Cancelled</span>
            </div>
          )}
        </div>
        <button className={refreshButton} onClick={refreshOrders}>
          <RefreshIcon width={14} height={14} />
          Refresh
        </button>
      </div>

      {/* Content */}
      {hasDisplayableOrders ? (
        <div className={cardsWrapper}>
          {Array.from(strategyGroups.entries()).map(([sid, groupOrders]) => {
            const isGroupEditing = sid === editingStrategyId;
            const label = deriveStrategyLabel(groupOrders);
            const time = new Date(groupOrders[0].createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const entryOrders = groupOrders
              .filter((o) => o.col === 0)
              .sort((a, b) => a.row - b.row);
            const exitOrders = groupOrders
              .filter((o) => o.col === 1)
              .sort((a, b) => a.row - b.row);

            const editingBlue = "rgba(100, 140, 255, 0.9)";
            const headerBorderColor = isGroupEditing
              ? "rgba(100, 140, 255, 0.35)"
              : "rgba(255,255,255,0.07)";
            const headerBg = isGroupEditing
              ? "rgba(100, 140, 255, 0.06)"
              : undefined;

            return (
              <div key={sid} className={strategyGroup}>
                {/* Group header */}
                <div
                  className={strategyGroupHeader}
                  style={{ borderColor: headerBorderColor, backgroundColor: headerBg }}
                >
                  <div className={strategyGroupMeta}>
                    <span
                      className={strategyGroupLabel}
                      style={isGroupEditing ? { color: editingBlue } : undefined}
                    >
                      {label}
                    </span>
                    {isGroupEditing && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          color: editingBlue,
                          backgroundColor: "rgba(100, 140, 255, 0.12)",
                        }}
                      >
                        Editing
                      </span>
                    )}
                    <span className={strategyGroupTime}>{time}</span>
                  </div>
                  {onEditGroup && (
                    <button
                      className={strategyGroupEditButton}
                      onClick={() => onEditGroup(groupOrders)}
                      title="Edit strategy in builder"
                      style={
                        isGroupEditing
                          ? {
                              color: editingBlue,
                              borderColor: "rgba(100, 140, 255, 0.4)",
                              backgroundColor: "rgba(100, 140, 255, 0.12)",
                            }
                          : {
                              color: "rgba(255,255,255,0.4)",
                              borderColor: "rgba(255,255,255,0.12)",
                              backgroundColor: "transparent",
                            }
                      }
                    >
                      <PencilIcon width={11} height={11} />
                      Edit
                    </button>
                  )}
                </div>

                {/* Entry cards */}
                {entryOrders.length > 0 && (
                  <div className="flex flex-col gap-1.5 pl-2">
                    {entryOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        isEditing={isGroupEditing}
                      />
                    ))}
                  </div>
                )}

                {/* Exit cards */}
                {exitOrders.length > 0 && (
                  <div className="flex flex-col gap-1.5 pl-2">
                    {exitOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        isEditing={isGroupEditing}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={emptyStateContainer}>
          <div className={emptyStateIcon}>
            <OrdersIcon width={48} height={48} />
          </div>
          <h3 className={emptyStateTitle}>
            {hasAnyOrders ? "No Active Orders" : "No Orders Yet"}
          </h3>
          <p className={emptyStateDescription}>
            {hasAnyOrders
              ? `You have ${filledCount + cancelledCount} completed orders, but no active orders at the moment.`
              : "You don't have any orders yet. Create a strategy to get started."}
          </p>
          <Link
            to="/"
            className="mt-4 text-accent-primary no-underline text-[13px] inline-flex items-center gap-1.5"
          >
            <ArrowLeftIcon width={14} height={14} />
            Go to Strategy Builder
          </Link>
        </div>
      )}

      {/* Dev Controls (Development Mode Only) */}
      {isDev && hasAnyOrders && (
        <div className={devControlsContainer}>
          <div className={devControlsHeader}>
            <ToolsIcon width={14} height={14} />
            Dev Controls
            <span className={devLabel}>(Development Mode Only)</span>
          </div>

          {actionableOrders.length > 0 ? (
            <>
              <div className={devControlsRow}>
                <span className={devLabel}>Select Order:</span>
                <select
                  className={orderIdSelect}
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                >
                  <option value="">-- Select an order --</option>
                  {actionableOrders.map(([id, order]) => (
                    <option key={id} value={id}>
                      {order.orderId} ({order.type}) - {order.status}
                    </option>
                  ))}
                </select>
                <button
                  className={devButton({ variant: "fill" })}
                  onClick={handleFillOrder}
                  disabled={!selectedOrderId}
                >
                  <CheckIcon width={12} height={12} />
                  Fill Order
                </button>
                <button
                  className={devButton({ variant: "cancel" })}
                  onClick={handleCancelOrder}
                  disabled={!selectedOrderId}
                >
                  <XCircleIcon width={12} height={12} />
                  Cancel Order
                </button>
              </div>

              <div className={devControlsRow}>
                <span className={devLabel}>Bulk Actions:</span>
                <button
                  className={devButton({ variant: "fill" })}
                  onClick={handleFillAllOrders}
                >
                  <CheckIcon width={12} height={12} />
                  Fill All ({actionableOrders.length})
                </button>
                <button
                  className={devButton({ variant: "cancel" })}
                  onClick={handleCancelAllOrders}
                >
                  <XCircleIcon width={12} height={12} />
                  Cancel All ({actionableOrders.length})
                </button>
              </div>
            </>
          ) : (
            <div className={devControlsRow}>
              <span className={devLabel}>
                No active or pending orders to simulate. All orders have been filled or cancelled.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className={footer}>
        <span className={lastUpdated}>
          Last updated: {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};

export default ActiveOrders;
