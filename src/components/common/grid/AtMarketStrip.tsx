import type { ComponentProps, FC } from "react";
import Block from "../../blocks/block";
import type { BlockData } from "../../../types/grid";
import { atMarketBlocksIn, legOfBlock } from "../../../utils";
import {
  atMarketStrip,
  atMarketLabel,
  atMarketBlocks,
} from "../../../styles/grid";

/**
 * THE ORDERS A CELL CARRIES NO PRICE FOR, DRAWN OFF THE RULER.
 *
 * One owner for the strip, drawn identically by the builder's `GridCell` and by
 * the read-only card `ReadOnlyGridCell`. The two cells differ only in what a
 * tile is wired to - the builder hands each one the command model's handlers,
 * the card hands it `isReadOnly` - so the wiring is passed in and everything
 * else is decided here. Hand-copied between the two, this is the same shape
 * that let `DragOverlay` and `block.tsx` disagree about a tile's colour, and it
 * is answered the same way: one owner, and the callers say only what differs.
 *
 * Whether a cell draws one at all is `cellDrawsAtMarketStrip` in
 * `utils/blockMapping.ts`, beside the membership question it is built from -
 * the gate reserves the cell's height as well as deciding what is drawn, so it
 * belongs with the mapping rather than with the markup.
 *
 * The strip stays a single non-wrapping row. That is deliberate and its
 * overflow is measured and recorded as a Known gap in `AGENTS.md` under
 * "Layout and the CSS cascade": `flex-wrap` would trade
 * `AT_MARKET_STRIP_HEIGHT`'s exact one-row floor for one that cannot be derived
 * at render, since the number of rows depends on the width.
 */

/**
 * What a cell adds to a tile the strip draws. Everything the strip decides for
 * itself - the id, the icon, the abbreviation, the label and the leg - is
 * excluded, because those are the cell's blocks rather than the cell's wiring.
 */
type AtMarketBlockWiring = Omit<
  ComponentProps<typeof Block>,
  "id" | "icon" | "abrv" | "label" | "leg"
>;

interface AtMarketStripProps {
  /** Every block in the cell. Which of them the strip draws is decided here. */
  blocks: readonly BlockData[];
  wiring: (blockId: string) => AtMarketBlockWiring;
}

const AtMarketStrip: FC<AtMarketStripProps> = ({ blocks, wiring }) => (
  <div className={atMarketStrip}>
    <span className={atMarketLabel}>At market</span>
    <div className={atMarketBlocks}>
      {atMarketBlocksIn(blocks).map((block) => (
        <Block
          key={block.id}
          id={block.id}
          icon={block.icon}
          abrv={block.abrv}
          label={block.label}
          // No leg, so no slider, no arrow keys and no price in the name: this
          // order has no offset from the market to move along.
          leg={legOfBlock(block)}
          {...wiring(block.id)}
        />
      ))}
    </div>
  </div>
);

export default AtMarketStrip;
