import type { FC } from "react";
import type { ActiveOrderEntry } from "../../../types/activeOrders";
import { getStatusColor, getStatusLabel } from "../../../types/activeOrders";
import { ORDER_TYPES, COLUMN_HEADERS } from "../../../data/orderTypes";
import type { PriceAxisLeg } from "../../../utils";
import { legForOrder } from "./orderAxes";

// =============================================================================
// HELPERS
// =============================================================================

const ROW_LABELS: Record<number, string> = {
  0: "Top",
  1: "Primary",
  2: "Bottom",
};

// The leg this card names is the leg the grid drew and the leg the payload
// sent, because all three read `legForOrder`. Labelling from `axis` alone was
// the last consumer deriving it for itself, and it disagreed with the other
// two for the case a reload pins as real: a Stop Loss saved at `axis: 2` was
// called a Limit here while the grid drew it in the trigger column and Kraken
// was sent a `triggers.price`.
const LEG_LABELS: Record<PriceAxisLeg, string> = {
  trigger: "Trigger",
  limit: "Limit",
};

// =============================================================================
// ORDER CARD
// =============================================================================

interface OrderCardProps {
  order: ActiveOrderEntry;
  isEditing?: boolean;
}

const OrderCard: FC<OrderCardProps> = ({ order, isEditing = false }) => {
  const orderTypeDef = ORDER_TYPES.find((ot) => ot.type === order.type);
  const Icon = orderTypeDef?.icon;
  const colLabel = COLUMN_HEADERS[order.col] ?? `Col ${order.col}`;
  const rowLabel = ROW_LABELS[order.row] ?? `Row ${order.row}`;
  const statusColor = getStatusColor(order.status);
  const statusLabel = getStatusLabel(order.status);
  const leg = legForOrder(order.type, order.axis);
  const axisLabel = leg ? LEG_LABELS[leg] : null;
  const sign = order.direction === "downside" ? "-" : "+";

  const editingBlue = "rgba(100, 140, 255, 0.9)";

  const accentColor = isEditing
    ? editingBlue
    : order.col === 0
      ? "rgba(100, 200, 100, 0.7)"
      : "rgba(200, 100, 100, 0.7)";

  const cardBg = isEditing
    ? "rgba(100, 140, 255, 0.06)"
    : order.col === 0
      ? "rgba(100, 200, 100, 0.04)"
      : "rgba(200, 100, 100, 0.04)";

  const borderColor = isEditing
    ? "rgba(100, 140, 255, 0.35)"
    : "rgba(255, 255, 255, 0.08)";

  return (
    <div
      className="flex items-stretch rounded-md border overflow-hidden transition-all duration-200"
      style={{ backgroundColor: cardBg, borderColor }}
    >
      {/* Left accent bar */}
      <div
        className="w-[3px] shrink-0 transition-colors duration-200"
        style={{ backgroundColor: accentColor }}
      />

      {/* Card content */}
      <div className="flex flex-col gap-1 px-3 py-2.5 flex-1 min-w-0">
        {/* Top row: icon + label + status pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && (
              <span className="shrink-0 opacity-80 [&>svg]:stroke-current text-text-secondary">
                <Icon width={14} height={14} />
              </span>
            )}
            <span className="text-[13px] font-semibold text-text-primary truncate">
              {orderTypeDef?.label ?? order.type}
            </span>
          </div>
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0"
            style={{
              color: statusColor,
              borderColor: `${statusColor}40`,
              backgroundColor: `${statusColor}14`,
            }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Bottom row: position info + y-position */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            {/* Every number on this card is a percentage offset from *some*
                market price, so an order whose market is invisible is an order
                the user cannot check. */}
            <span className="font-medium text-text-secondary">
              {order.symbol}
            </span>
            <span className="opacity-40">·</span>
            <span>{colLabel}</span>
            <span className="opacity-40">·</span>
            <span>{rowLabel}</span>
            {axisLabel && (
              <>
                <span className="opacity-40">·</span>
                <span>{axisLabel}</span>
              </>
            )}
          </div>
          {order.yPosition !== undefined && (
            <span className="text-[11px] font-medium text-text-secondary tabular-nums shrink-0">
              {sign}{order.yPosition.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderCard;
