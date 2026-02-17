import { useEffect, useState, type FC } from "react";
import { Link } from "react-router-dom";
import { COLUMN_HEADERS, ORDER_TYPES } from "../../../data/orderTypes";
import OrdersIcon from "../../../assets/icons/orders.svg?react";
import RefreshIcon from "../../../assets/icons/refresh.svg?react";
import ToolsIcon from "../../../assets/icons/tools.svg?react";
import CheckIcon from "../../../assets/icons/check.svg?react";
import XCircleIcon from "../../../assets/icons/x-circle.svg?react";
import ArrowLeftIcon from "../../../assets/icons/arrow-left.svg?react";
import { ActiveOrdersProvider } from "./ActiveOrdersContext";
import { useActiveOrders } from "./useActiveOrders";
import type {
  ActiveOrdersProps,
  ActiveOrdersConfig,
} from "../../../types/activeOrders";
import { ReadOnlyGridCell } from "../../common/grid";
import type { BlockData, GridData } from "../../../types/grid";
import { getColumnHeaderTint, getColumnCellTint } from "../../../utils";
import { GRID_CONFIG } from "../../../data/orderTypes";
import { useOrdersStore } from "../../../store";
import {
  container,
  contentWrapper,
  columnsWrapper,
  header,
  headerTextClass,
  statusBar,
  statusInfo,
  statusItem,
  statusLabel,
  getStatusValueProps,
  getStatusDotProps,
  columnClass,
  getColumnHeaderProps,
  columnHeaderText,
  refreshButton,
  emptyStateContainer,
  emptyStateIcon,
  emptyStateTitle,
  emptyStateDescription,
  footer,
  lastUpdated,
  devControlsContainer,
  devControlsHeader,
  devControlsRow,
  devButton,
  devLabel,
  orderIdSelect,
} from "./ActiveOrders.styles";
import { useKrakenAPI } from "../../../hooks/useKrakenAPI";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Create an empty grid */
const createEmptyGrid = (): GridData =>
  Array.from({ length: GRID_CONFIG.numColumns }, () =>
    Array.from({ length: GRID_CONFIG.numRows }, () => []),
  );

/** Convert ActiveOrdersConfig to GridData for display */
const ordersToGrid = (orders: ActiveOrdersConfig): GridData => {
  const grid = createEmptyGrid();

  Object.entries(orders).forEach(([id, order]) => {
    // Only show active and pending orders
    if (order.status !== "active" && order.status !== "pending") return;

    if (
      order.col >= 0 &&
      order.col < GRID_CONFIG.numColumns &&
      order.row >= 0 &&
      order.row < GRID_CONFIG.numRows
    ) {
      // Find the order type definition for proper display
      const orderTypeDef = ORDER_TYPES.find((ot) => ot.type === order.type);

      const block: BlockData = {
        id,
        orderType: order.type,
        label: orderTypeDef?.label || order.type,
        icon: orderTypeDef?.icon,
        abrv: orderTypeDef?.abrv || order.type.substring(0, 3).toUpperCase(),
        allowedRows: [order.row],
        axis: order.axis || 1,
        yPosition: order.yPosition || 0,
        axes: order.axis
          ? ((order.axis === 1 ? ["trigger"] : ["limit"]) as (
              | "trigger"
              | "limit"
            )[])
          : [],
      };

      grid[order.col][order.row].push(block);
    }
  });

  return grid;
};

// =============================================================================
// MAIN EXPORT - Wraps with provider
// =============================================================================

const ActiveOrders: FC<ActiveOrdersProps> = ({
  onOrderSelect,
  initialOrders = {},
}) => {
  return (
    <ActiveOrdersProvider
      onOrderSelect={onOrderSelect}
      initialOrders={initialOrders}
    >
      <ActiveOrdersInner initialOrders={initialOrders} />
    </ActiveOrdersProvider>
  );
};

// =============================================================================
// INNER COMPONENT - Consumes the context
// =============================================================================

interface ActiveOrdersInnerProps {
  initialOrders: ActiveOrdersConfig;
}

const ActiveOrdersInner: FC<ActiveOrdersInnerProps> = ({ initialOrders }) => {
  // Environment check
  const isDev = import.meta.env.DEV;

  // Dev controls state
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  // Kraken API integration for current price
  const { currentPrice, tickerError } = useKrakenAPI({
    symbol: "BTC/USD",
    autoConnect: true,
    pollInterval: 30000, // Update every 30 seconds
  });

  const { activeOrders, setActiveOrders, setHoveredCell, refreshOrders } =
    useActiveOrders();

  // Get order store actions for dev controls
  const { updateOrderStatus, cancelOrder, cancelAllOrders } = useOrdersStore();

  // Sync initialOrders with context when they change
  useEffect(() => {
    setActiveOrders(initialOrders);
  }, [initialOrders, setActiveOrders]);

  // Convert orders to grid for display
  const grid = ordersToGrid(activeOrders);

  // Count orders by status
  const totalOrders = Object.keys(activeOrders).length;
  const activeCount = Object.values(activeOrders).filter(
    (o) => o.status === "active",
  ).length;
  const pendingCount = Object.values(activeOrders).filter(
    (o) => o.status === "pending",
  ).length;
  const filledCount = Object.values(activeOrders).filter(
    (o) => o.status === "filled",
  ).length;
  const cancelledCount = Object.values(activeOrders).filter(
    (o) => o.status === "cancelled",
  ).length;

  const handleCellMouseEnter = (colIndex: number, rowIndex: number) => {
    setHoveredCell({ col: colIndex, row: rowIndex });
  };

  const handleCellMouseLeave = () => {
    setHoveredCell(null);
  };

  const handleRefresh = () => {
    refreshOrders();
  };

  // Check if there are any orders to display (active or pending)
  const hasDisplayableOrders = activeCount > 0 || pendingCount > 0;

  // Check if we have any orders at all (including filled/cancelled)
  const hasAnyOrders = totalOrders > 0;

  // Get list of active/pending orders for dev controls
  const actionableOrders = Object.entries(activeOrders).filter(
    ([, order]) => order.status === "active" || order.status === "pending",
  );

  // Dev control handlers
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
    actionableOrders.forEach(([id]) => {
      updateOrderStatus(id, "filled");
    });
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
              <span {...getStatusValueProps("#4CAF50")}>
                {activeCount} Active
              </span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className={statusItem}>
              <span {...getStatusDotProps("#FFC107")} />
              <span {...getStatusValueProps("#FFC107")}>
                {pendingCount} Pending
              </span>
            </div>
          )}
          {filledCount > 0 && (
            <div className={statusItem}>
              <span {...getStatusDotProps("#2196F3")} />
              <span {...getStatusValueProps("#2196F3")}>
                {filledCount} Filled
              </span>
            </div>
          )}
          {cancelledCount > 0 && (
            <div className={statusItem}>
              <span {...getStatusDotProps("#9E9E9E")} />
              <span {...getStatusValueProps("#9E9E9E")}>
                {cancelledCount} Cancelled
              </span>
            </div>
          )}
        </div>
        <button className={refreshButton} onClick={handleRefresh}>
          <RefreshIcon width={14} height={14} />
          Refresh
        </button>
      </div>

      {/* Content */}
      {hasDisplayableOrders ? (
        <div className={contentWrapper}>
          <div className={columnsWrapper}>
            {grid.map((gridColumn, colIndex) => {
              const headerTint = getColumnHeaderTint(colIndex);
              const cellTint = getColumnCellTint(colIndex);
              const colHeaderProps = getColumnHeaderProps(headerTint);

              return (
                <div key={colIndex} className={columnClass}>
                  <div
                    className={colHeaderProps.className}
                    style={colHeaderProps.style}
                  >
                    <span className={columnHeaderText}>
                      {COLUMN_HEADERS[colIndex]}
                    </span>
                  </div>
                  {gridColumn.map((row, rowIndex) => (
                    <ReadOnlyGridCell
                      key={rowIndex}
                      colIndex={colIndex}
                      rowIndex={rowIndex}
                      blocks={row}
                      currentPrice={currentPrice}
                      priceError={tickerError}
                      tint={cellTint}
                      onMouseEnter={() =>
                        handleCellMouseEnter(colIndex, rowIndex)
                      }
                      onMouseLeave={handleCellMouseLeave}
                    />
                  ))}
                </div>
              );
            })}
          </div>
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
                No active or pending orders to simulate. All orders have been
                filled or cancelled.
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
