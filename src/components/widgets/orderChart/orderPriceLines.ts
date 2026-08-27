import { COLUMN_HEADERS, ORDER_TYPES } from "@data/orderTypes";
import { priceForOffset } from "@utils/blockMapping";
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
// The price itself comes from `priceForOffset`, which is the same call the
// grid cell makes for its price chip (`GridCell.tsx`) and the order mapper
// makes for a Kraken payload - the mapping owner in `utils/blockMapping.ts`.
// The chart used to inline its own copy of the formula;
// `orderPriceLines.test.ts` now pins the chart's price to the grid's, so a
// fourth copy cannot appear unnoticed.

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
 * The side of the market comes from the entry's `direction`, never from
 * re-deriving one from its row or column - decision D3. That direction is the
 * *cell's* (decision D8): `orderConfigFromGrid` stamps every entry in a cell
 * with the scale that cell draws, so a bulk cell holding a Limit and a Stop
 * Loss puts both this line and the chip on the same side of the market. They
 * used to disagree - `-25.00% $37,500` on the chip against a line at 62,500 -
 * because the cell drew on `blocks[0]` while this read each order's own field.
 */
export const orderPriceLines = (
  orders: OrderConfig,
  marketPrice: number | null,
): OrderPriceLine[] => {
  if (marketPrice === null) return [];

  const lines: OrderPriceLine[] = [];

  for (const [id, order] of Object.entries(orders)) {
    if (order.yPosition === undefined) continue;

    const price = priceForOffset(
      marketPrice,
      order.yPosition,
      order.direction ?? "upside",
    );

    const typeDef = ORDER_TYPES.find((t) => t.type === order.type);
    const colLabel = COLUMN_HEADERS[order.col] ?? "";
    // The axis index is 1-based in the config. `axis` and `axes` are kept in
    // step by construction now - `axesForBlockAxis` is the only thing that
    // derives one from the other, and nothing rewrites `axis` after a block is
    // built - so reading the order type's axis list here names the same leg the
    // grid does. It decides the label only; it never touches the price above.
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
