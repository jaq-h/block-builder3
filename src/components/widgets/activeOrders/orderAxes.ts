// =============================================================================
// WHICH LEG A SUBMITTED ORDER IS - for this panel, from the app's one owner
// =============================================================================
//
// The panel answers this twice: once to build the grid it draws, and once to
// label the card beside it. Both go through here, and here goes through
// `axesForBlockAxis` and `legOfBlock` - the same pair the assembly grid, the
// chart and the Kraken payload take. A local `axis === 1 ? trigger : limit`
// rule has no notion of a single-axis order type, so a Stop Loss released in
// the right half of its cell and saved with `axis: 2` came back labelled a
// limit leg while the grid drew it as the trigger one and the payload sent
// `triggers.price`.

import type { AxisType } from "../../../data/orderTypes";
import { ORDER_TYPES } from "../../../data/orderTypes";
import {
  axesForBlockAxis,
  legOfBlock,
  type PriceAxisLeg,
} from "../../../utils";

/** The axes a submitted order's block owns. */
export const axesForOrder = (type: string, axis?: 1 | 2): AxisType[] => {
  if (!axis) {
    return [];
  }

  const typeDef = ORDER_TYPES.find((ot) => ot.type === type);

  // An order whose type is not in the catalogue keeps the raw rule rather than
  // being dropped. `gridFromConfig` skips such an entry because a missing block
  // in the builder is harmless, but an order that was actually submitted has to
  // stay visible in the list.
  if (!typeDef) {
    return axis === 1 ? ["trigger"] : ["limit"];
  }

  return axesForBlockAxis(typeDef.axes, axis);
};

/** The leg a submitted order stands for, or `null` when it carries no price. */
export const legForOrder = (
  type: string,
  axis?: 1 | 2,
): PriceAxisLeg | null => legOfBlock({ axes: axesForOrder(type, axis) });
