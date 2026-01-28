import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { COLUMN_HEADERS, ORDER_TYPES } from "../../../data/orderTypes";
import OrdersIcon from "../../../assets/icons/orders.svg?react";
import RefreshIcon from "../../../assets/icons/refresh.svg?react";
import ToolsIcon from "../../../assets/icons/tools.svg?react";
import CheckIcon from "../../../assets/icons/check.svg?react";
import XCircleIcon from "../../../assets/icons/x-circle.svg?react";
import ArrowLeftIcon from "../../../assets/icons/arrow-left.svg?react";
import { ActiveOrdersProvider, useActiveOrders } from "./ActiveOrdersContext";
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
  Container,
  ContentWrapper,
  ColumnsWrapper,
  Header,
  HeaderText,
  StatusBar,
  StatusInfo,
  StatusItem,
  StatusLabel,
  StatusValue,
  StatusDot,
  Column,
  ColumnHeader,
  ColumnHeaderText,
  RefreshButton,
  EmptyStateContainer,
  EmptyStateIcon,
  EmptyStateTitle,
  EmptyStateDescription,
  Footer,
  LastUpdated,
  DevControlsContainer,
  DevControlsHeader,
  DevControlsRow,
  DevButton,
  DevLabel,
  OrderIdSelect,
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

const ActiveOrders: React.FC<ActiveOrdersProps> = ({
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

const ActiveOrdersInner: React.FC<ActiveOrdersInnerProps> = ({
  initialOrders,
}) => {
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
    <Container>
      <Header>
        <HeaderText>Active Orders</HeaderText>
      </Header>

      {/* Status Bar */}
      <StatusBar>
        <StatusInfo>
          <StatusItem>
            <StatusLabel>Total:</StatusLabel>
            <StatusValue>{totalOrders}</StatusValue>
          </StatusItem>
          {activeCount > 0 && (
            <StatusItem>
              <StatusDot $color="#4CAF50" />
              <StatusValue $color="#4CAF50">{activeCount} Active</StatusValue>
            </StatusItem>
          )}
          {pendingCount > 0 && (
            <StatusItem>
              <StatusDot $color="#FFC107" />
              <StatusValue $color="#FFC107">{pendingCount} Pending</StatusValue>
            </StatusItem>
          )}
          {filledCount > 0 && (
            <StatusItem>
              <StatusDot $color="#2196F3" />
              <StatusValue $color="#2196F3">{filledCount} Filled</StatusValue>
            </StatusItem>
          )}
          {cancelledCount > 0 && (
            <StatusItem>
              <StatusDot $color="#9E9E9E" />
              <StatusValue $color="#9E9E9E">
                {cancelledCount} Cancelled
              </StatusValue>
            </StatusItem>
          )}
        </StatusInfo>
        <RefreshButton onClick={handleRefresh}>
          <RefreshIcon width={14} height={14} />
          Refresh
        </RefreshButton>
      </StatusBar>

      {/* Content */}
      {hasDisplayableOrders ? (
        <ContentWrapper>
          <ColumnsWrapper>
            {grid.map((column, colIndex) => {
              const headerTint = getColumnHeaderTint(colIndex);
              const cellTint = getColumnCellTint(colIndex);

              return (
                <Column key={colIndex}>
                  <ColumnHeader $tint={headerTint}>
                    <ColumnHeaderText>
                      {COLUMN_HEADERS[colIndex]}
                    </ColumnHeaderText>
                  </ColumnHeader>
                  {column.map((row, rowIndex) => (
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
                </Column>
              );
            })}
          </ColumnsWrapper>
        </ContentWrapper>
      ) : (
        <EmptyStateContainer>
          <EmptyStateIcon>
            <OrdersIcon width={48} height={48} />
          </EmptyStateIcon>
          <EmptyStateTitle>
            {hasAnyOrders ? "No Active Orders" : "No Orders Yet"}
          </EmptyStateTitle>
          <EmptyStateDescription>
            {hasAnyOrders
              ? `You have ${filledCount + cancelledCount} completed orders, but no active orders at the moment.`
              : "You don't have any orders yet. Create a strategy to get started."}
          </EmptyStateDescription>
          <Link
            to="/"
            style={{
              marginTop: "16px",
              color: "var(--accent-color-purple)",
              textDecoration: "none",
              fontSize: "13px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <ArrowLeftIcon width={14} height={14} />
            Go to Strategy Builder
          </Link>
        </EmptyStateContainer>
      )}

      {/* Dev Controls (Development Mode Only) */}
      {isDev && hasAnyOrders && (
        <DevControlsContainer>
          <DevControlsHeader>
            <ToolsIcon width={14} height={14} />
            Dev Controls
            <DevLabel>(Development Mode Only)</DevLabel>
          </DevControlsHeader>

          {actionableOrders.length > 0 ? (
            <>
              <DevControlsRow>
                <DevLabel>Select Order:</DevLabel>
                <OrderIdSelect
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                >
                  <option value="">-- Select an order --</option>
                  {actionableOrders.map(([id, order]) => (
                    <option key={id} value={id}>
                      {order.orderId} ({order.type}) - {order.status}
                    </option>
                  ))}
                </OrderIdSelect>
                <DevButton
                  $variant="fill"
                  onClick={handleFillOrder}
                  disabled={!selectedOrderId}
                >
                  <CheckIcon width={12} height={12} />
                  Fill Order
                </DevButton>
                <DevButton
                  $variant="cancel"
                  onClick={handleCancelOrder}
                  disabled={!selectedOrderId}
                >
                  <XCircleIcon width={12} height={12} />
                  Cancel Order
                </DevButton>
              </DevControlsRow>

              <DevControlsRow>
                <DevLabel>Bulk Actions:</DevLabel>
                <DevButton $variant="fill" onClick={handleFillAllOrders}>
                  <CheckIcon width={12} height={12} />
                  Fill All ({actionableOrders.length})
                </DevButton>
                <DevButton $variant="cancel" onClick={handleCancelAllOrders}>
                  <XCircleIcon width={12} height={12} />
                  Cancel All ({actionableOrders.length})
                </DevButton>
              </DevControlsRow>
            </>
          ) : (
            <DevControlsRow>
              <DevLabel>
                No active or pending orders to simulate. All orders have been
                filled or cancelled.
              </DevLabel>
            </DevControlsRow>
          )}
        </DevControlsContainer>
      )}

      {/* Footer */}
      <Footer>
        <LastUpdated>
          Last updated: {new Date().toLocaleTimeString()}
        </LastUpdated>
      </Footer>
    </Container>
  );
};

export default ActiveOrders;
