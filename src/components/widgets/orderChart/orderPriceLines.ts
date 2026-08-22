import { COLUMN_HEADERS, ORDER_TYPES } from "@data/orderTypes";
import { calculatePrice } from "@utils/grid";
import type { OrderConfig } from "@/types/grid";

// =============================================================================
// ORDER PRICE LINES - what the chart draws for the blocks on the grid
// =============================================================================
//
// Pure, and deliberately unaware of the price scale. That is the whole point:
// a price line is defined by a *price*, and the linear/logarithmic choice only
// changes where the chart paints that price. If this function took a scale
// argument, the scale could change the number, and the chart and the grid
// would be free to disagree about what a block is worth.
//
// The price itself comes from `calculatePrice`, which is the same call the
// grid cell makes for its price chip (`GridCell.tsx`) and which delegates to
// `priceAtOffset`, the shared owner of "percentage offset from market" that
// the order mapper builds Kraken payloads from. The chart used to inline its
// own copy of that formula; `orderPriceLines.test.ts` now pins the chart's
// price to the grid's, so a fourth copy cannot appear unnoticed.

export interface OrderPriceLine {
  /** The grid block this line stands for. */
  id: string;
  /** The absolute price. The only thing that decides where the line sits. */
  price: number;
  /** Axis label text, e.g. `Entry SL-trigger`. */
  title: string;
  /** Entry orders are drawn in the entry tint, everything else in the exit tint. */
  isEntry: boolean;
}

/**
 * Every block on the grid that has been given a price, as a line to draw.
 *
 * The side of the market comes from the block's own `direction`, never from
 * re-deriving one from its row or column - decision D3. Under the bulk pattern
 * a cell can hold blocks with opposite directions and the grid cell draws them
 * all on `blocks[0]`'s scale, so a bulk cell's chip and this line can still
 * disagree. That divergence predates this module, is documented in the project
 * memory as a known gap, and is owned by `bb3-mapping-owner` together with the
 * chip and the payload; it is deliberately not decided here.
 */
export const orderPriceLines = (
  orders: OrderConfig,
  marketPrice: number | null,
): OrderPriceLine[] => {
  if (marketPrice === null) return [];

  const lines: OrderPriceLine[] = [];

  for (const [id, order] of Object.entries(orders)) {
    if (order.yPosition === undefined) continue;

    const price = calculatePrice(
      marketPrice,
      order.yPosition,
      order.direction === "downside",
    );
    if (price === null) continue;

    const typeDef = ORDER_TYPES.find((t) => t.type === order.type);
    const colLabel = COLUMN_HEADERS[order.col] ?? "";
    // The axis index is 1-based in the config. This mapping reads the order
    // type's own axis list rather than the block's, because `OrderConfigEntry`
    // carries no `axes` - the same derivation the chart has always used, and
    // part of the `axis`/`axes` gap owned by `bb3-mapping-owner`. It decides
    // the label only; it never touches the price above.
    const axisType = typeDef?.axes[(order.axis ?? 1) - 1] ?? "limit";
    const axisSuffix = typeDef && typeDef.axes.length > 1 ? `-${axisType}` : "";

    lines.push({
      id,
      price,
      title: `${colLabel} ${typeDef?.abrv ?? order.type}${axisSuffix}`,
      isEntry: order.col === 0,
    });
  }

  return lines;
};
