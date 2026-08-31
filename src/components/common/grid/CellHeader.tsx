import type { FC } from "react";
import type { BlockData } from "../../../types/grid";
import { cellHeader, orderTypeLabel } from "../../../styles/grid";

/**
 * THE CELL'S TITLE: every order it holds, named once each.
 *
 * One owner, drawn identically by the builder's `GridCell` and by the read-only
 * card `ReadOnlyGridCell`, for the same reason the at-market strip has one.
 *
 * It used to be `blocks[0].label` alone, which named one order out of a bulk
 * cell that can hold several - and once a cell could draw a Limit on its axis
 * while a Market order sat in the strip below, that header was naming whichever
 * of the two happened to be first. A dual-axis order type puts two blocks in
 * the cell under one label, so the labels are deduped: it is one order and it
 * is named once. The order is the order they landed in.
 *
 * `CELL_CHROME` counts exactly one line for this, which `orderTypeLabel`'s
 * `truncate` is what holds however many orders the cell comes to hold.
 */
const CellHeader: FC<{ blocks: readonly BlockData[] }> = ({ blocks }) => {
  const text =
    blocks.length > 0
      ? [...new Set(blocks.map((block) => block.label))].join(", ")
      : null;

  return (
    <div className={cellHeader}>
      {text && <div className={orderTypeLabel}>{text}</div>}
    </div>
  );
};

export default CellHeader;
