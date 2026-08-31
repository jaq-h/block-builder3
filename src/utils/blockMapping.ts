// =============================================================================
// BLOCK MAPPING - the single owner of what a block on the grid means
// =============================================================================
//
// Four facts decide what a block is worth, and every one of them used to be
// derived in more than one place:
//
//   1. **Axis membership** - is this block drawn on a price axis at all, and
//      which leg of its order type is it?
//   2. **Position** - how far along that axis it sits, as a percentage.
//   3. **Direction** - which side of the market that percentage is on.
//   4. **Cell scale** - which way the whole cell's ruler runs.
//
// Each split produced the same class of defect: two consumers reading the same
// fact from different code and disagreeing. The worst of them shipped a price
// chip reading `-25.00% $37,500` beside a Kraken payload and a chart line that
// both said `62,500`, for one block, at one moment. Anything that needs one of
// these four facts asks here; nothing works one out for itself.
//
// **Direction belongs to the CELL** (captain decision D8). A cell draws one
// market line, one percentage ruler and one set of positioners, so it has one
// scale - and every block in it is priced on that scale, whatever
// `directionForNewCell` would have said about each block on its own. The
// direction is stamped onto every block in the cell when the first block lands
// (`addBlocksToCell`), and re-stamped whenever a grid arrives from outside
// (`normaliseCellDirections`), so `cellDirection` reading the first block is a
// statement about the cell rather than an accident of insertion order. That is
// what makes removing a block safe: the survivors already carry the cell's
// direction, so nothing is re-priced by the removal.
//
// The price itself is `priceAtOffset` in `utils/price.ts`, which stays the one
// formula. This module decides what to feed it.

import type {
  BlockData,
  BlockDirection,
  CellDisplayMode,
  GridData,
  OrderConfig,
  StrategyPattern,
} from "../types/grid";
import type { AxisType } from "../data/orderTypes";
import { SCALE_CONFIG } from "../styles/grid";
import { priceAtOffset } from "./price";

// =============================================================================
// 1. AXIS MEMBERSHIP
// =============================================================================

/** Which leg of its order type a block stands for. */
export type PriceAxisLeg = AxisType;

/**
 * The leg this block owns, or `null` when it carries no price at all.
 *
 * Read from `axes`, which every construction path fills through
 * `axesForBlockAxis` - never from `axis` on its own, which has no notion of a
 * single-axis order type and relabels a Stop Loss saved at axis 2 as a limit
 * leg. A block claiming both legs is a construction bug rather than a shape to
 * paper over here, and `orderMapper.assertSingleAxis` refuses it loudly.
 */
export const legOfBlock = (block: {
  axes: readonly AxisType[];
}): PriceAxisLeg | null => {
  if (block.axes.includes("trigger")) return "trigger";
  if (block.axes.includes("limit")) return "limit";
  return null;
};

/**
 * Whether a cell draws a price axis at all: **some** block in it carries a leg.
 *
 * It answers the CELL's layout question and nothing else. It does not decide
 * what any block in the cell is worth, and it may never be given that job
 * again - `legOfBlock` owns a block's leg, and a block's leg is a fact about
 * the block rather than about its neighbours.
 *
 * It used to be `every`, so one axis-less block - a Market order in a bulk
 * cell - flattened the whole cell, on the reasoning that there was no ruler
 * for the others to be placed against. The ruler was never the axis-less
 * block's to take away: it is the market price and the percentage scale, and
 * it stands whether or not something in the cell has no use for it. What that
 * rule really did was suppress a price the order still carried, on screen
 * only: the chart went on drawing the line, `orderConfigFromGrid` went on
 * recording the offset, and `mapBlockToOrderParams` went on emitting
 * `limit_price` - so a Limit sharing a bulk cell with a Market order was sent
 * at 25% below the market having never been drawn, and, wired to `useFreeDrag`
 * rather than `useVerticalDrag` for want of a leg, could not be corrected
 * either. Reproduced in Chrome at $77,760.7 on 2026-08-30: the cell's whole
 * visible text was "Market", against an `Entry Lmt 58,320.5` line on the chart
 * beside it.
 *
 * A cell that draws an axis draws its axis-less blocks in the at-market strip
 * beneath it (`atMarketStrip` in `styles/grid.ts`), which is what answers the
 * question the old rule was avoiding: an order with no price is not placed
 * against the ruler, it is drawn off it and said to execute at the market.
 */
export const cellDrawsPriceAxis = (
  cellBlocks: readonly { axes: readonly AxisType[] }[],
): boolean => cellBlocks.some((block) => block.axes.length > 0);

/**
 * How the cell lays its axes out, which is the same question as
 * `cellDrawsPriceAxis` plus how many columns the answer needs. It lives beside
 * it rather than in `utils/grid.ts` so the layout and the membership can never
 * be answered from two different tests of the same `axes` array.
 *
 * It is read over the blocks that actually carry a leg, so an axis-less block
 * sharing the cell neither adds a column nor removes one.
 */
export const getCellDisplayMode = (
  blocks: readonly { axes: readonly AxisType[] }[],
): CellDisplayMode => {
  if (blocks.length === 0) return "empty";
  if (!cellDrawsPriceAxis(blocks)) return "no-axis";

  const hasTriggerAxis = blocks.some((block) => block.axes.includes("trigger"));
  const hasLimitAxis = blocks.some((block) => block.axes.includes("limit"));

  if (hasTriggerAxis && hasLimitAxis) return "dual-axis";
  if (hasLimitAxis) return "limit-only";

  return "dual-axis";
};

/**
 * The blocks in a cell that carry no price at all, from the one owner of that
 * question. They are what the at-market strip draws.
 *
 * There is deliberately no priced half here. A surface that draws the ruler
 * needs the finer trigger-or-limit split, which it takes from `legOfBlock`
 * per block, so a coarse priced list would be a second answer to a question
 * already owned - and a second answer is what let the renderer and the order
 * path disagree in the first place. What matters is that this half comes from
 * `legOfBlock` too, so a surface never tests `axes` for itself.
 */
export const atMarketBlocksIn = <T extends { axes: readonly AxisType[] }>(
  cellBlocks: readonly T[],
): T[] => cellBlocks.filter((block) => legOfBlock(block) === null);

// =============================================================================
// 2. POSITION
// =============================================================================

/** The furthest from market a block can be placed, in percentage points. */
export const MAX_OFFSET_PERCENT = SCALE_CONFIG.MAX_PERCENT;
export const MIN_OFFSET_PERCENT = SCALE_CONFIG.MIN_PERCENT;

/**
 * A position the axis can actually express.
 *
 * The clamp is not decoration. The drop handler used to write a raw 0-100
 * reading straight into the block while the slider and the axis labels ran to
 * `SCALE_CONFIG.MAX_PERCENT` of 50, so a block dragged to the bottom of its
 * cell was a 100% offset - a price of exactly zero, which `validateOrder` then
 * had to catch as a last line of defence. That reading is gone, and this is
 * what makes a zero price unreachable rather than merely unlikely: every
 * position flows through here before it is drawn, announced or priced.
 *
 * A non-finite input is a bug upstream, and this is the DISPLAY answer to it: a
 * chip cannot print `NaN%` and a ruler cannot lay a block out at it, so the
 * offset collapses to the market price line. That is a safe thing to draw and
 * an unsafe thing to submit - a limit order at the current market price is a
 * plausible order that would likely fill - so the order path uses
 * `offsetForOrder` instead and keeps a non-finite value non-finite all the way
 * to `validateOrder`. The two are deliberately different and the difference is
 * only ever about a value no axis could have produced.
 *
 * That split holds only because this is a clamp on READ. Nothing writes it back
 * into a stored block: `normaliseCellDirections` and the provider's
 * `gridFromConfig` both used to, which meant a hydrated grid had already
 * answered a non-finite position with zero before the order path ever saw one,
 * and the split it thought it was making did not exist. A store keeps the
 * position it was given; every consumer clamps at the point of use.
 */
export const clampOffset = (yPosition: number): number => {
  if (!Number.isFinite(yPosition)) return MIN_OFFSET_PERCENT;
  return Math.max(
    MIN_OFFSET_PERCENT,
    Math.min(MAX_OFFSET_PERCENT, yPosition),
  );
};

/**
 * The same range clamp, for a position on any path that can reach a Kraken
 * payload - the order mapper itself, and the saved config a reload turns back
 * into a grid.
 *
 * It differs from `clampOffset` in exactly one case, and that case is the whole
 * reason it exists: a non-finite position is passed straight through rather
 * than answered with an offset of zero. Collapsing it would price the order at
 * the market price, which `validateOrder` accepts because it is a perfectly
 * finite, positive number - so a block carrying a corrupt position would be
 * submitted as an at-market limit order instead of being refused. Left
 * non-finite it reaches `validateOrder`'s `Number.isFinite` guard, which is
 * what that guard is for.
 *
 * The range half of it stays everywhere, including on the saved config: a
 * position the axis cannot draw is not a position worth recording. It is only
 * the non-finite case that must survive intact.
 */
export const offsetForOrder = (yPosition: number): number =>
  Number.isFinite(yPosition) ? clampOffset(yPosition) : yPosition;

// =============================================================================
// 3 & 4. DIRECTION, AND THE CELL SCALE IT IS
// =============================================================================

/** The boolean form the layout helpers in `styles/grid.ts` are written in. */
export const isDescending = (direction: BlockDirection): boolean =>
  direction === "downside";

const STOP_LOSS_ORDER_TYPES = new Set([
  "stop-loss",
  "stop-loss-limit",
  "trailing-stop",
  "trailing-stop-limit",
]);

/**
 * Whether a placement lands in the "downside zone".
 *
 * Conditional: row 2 is the downside zone (bottom row, stop-loss territory).
 * Bulk: stop-loss order types are, because rows are unrestricted there.
 */
const isDownsideZone = (
  rowIndex: number,
  pattern: StrategyPattern | undefined,
  orderType: string | undefined,
): boolean => {
  if (pattern === "bulk" && orderType) {
    return STOP_LOSS_ORDER_TYPES.has(orderType);
  }
  if (pattern === "conditional") {
    return rowIndex === 2;
  }
  return false;
};

/**
 * The scale an **empty** cell takes when a block first lands in it.
 *
 * This is the only input to a cell's direction, and it is consulted exactly
 * once per cell: the moment the cell stops being empty. Every later block put
 * into that cell inherits what is already there. Asking this question again per
 * block is what made a bulk cell's scale depend on which order type happened to
 * be added second.
 */
export const directionForNewCell = (
  rowIndex: number,
  colIndex: number,
  pattern?: StrategyPattern,
  orderType?: string,
): BlockDirection =>
  (
    isDownsideZone(rowIndex, pattern, orderType)
      ? colIndex === 1
      : colIndex === 0
  )
    ? "downside"
    : "upside";

/**
 * The scale this cell draws, and so the direction every block in it is priced
 * on - the chip, the chart line and the Kraken payload alike.
 *
 * Reading the first block is safe *because* of the stamp, not in spite of it:
 * `addBlocksToCell` and `normaliseCellDirections` are the only ways blocks
 * enter a cell, and both leave every block in it carrying the same direction.
 * Before that invariant existed this same expression was the defect - the cell
 * drew itself on `blocks[0]` while the mapper read each block's own direction,
 * and removing `blocks[0]` re-priced everything left behind.
 *
 * An empty cell has no scale to speak of and answers "upside", which is what
 * the axis labels default to when there is nothing on them.
 */
export const cellDirection = (
  cellBlocks: readonly { direction: BlockDirection }[],
): BlockDirection => cellBlocks[0]?.direction ?? "upside";

/** Every block in this cell, carrying the cell's own direction. */
export const stampCellDirection = <T extends { direction: BlockDirection }>(
  cellBlocks: readonly T[],
  direction: BlockDirection,
): T[] =>
  cellBlocks.map((block) =>
    block.direction === direction ? block : { ...block, direction },
  );

/**
 * Add blocks to a cell, on that cell's own scale.
 *
 * The one write path into a cell, and the only place a direction is chosen.
 * An occupied cell keeps the scale it already had; an empty one takes the
 * scale its first arrival implies, and the whole cell is stamped with it.
 */
export const addBlocksToCell = (
  grid: GridData,
  target: { col: number; row: number },
  blocks: BlockData[],
  pattern: StrategyPattern,
): GridData => {
  const next = grid.map((column) => column.map((cell) => [...cell]));
  const cell = next[target.col][target.row];

  const direction =
    cell.length > 0
      ? cellDirection(cell)
      : directionForNewCell(
          target.row,
          target.col,
          pattern,
          blocks[0]?.orderType,
        );

  next[target.col][target.row] = stampCellDirection(
    [...cell, ...blocks],
    direction,
  );
  return next;
};

/**
 * Bring a grid built elsewhere onto the invariant: every block in a cell
 * carries that cell's direction.
 *
 * Hydration from a saved strategy and the Active Orders panel both build a grid
 * entry by entry, from records that were written before the cell owned the
 * scale. Running them through here is what stops a reloaded strategy from
 * drawing a cell two different ways.
 *
 * Direction and nothing else. It used to clamp `yPosition` into the stored
 * block as well, which quietly defeated the one guard the order path has
 * against a corrupt position: `clampOffset` answers a non-finite value with
 * zero, so a hydrated grid reached the mapper already priced at the market and
 * `validateOrder` had nothing left to refuse. Every consumer clamps what it
 * reads - `GridCell` and `ReadOnlyGridCell` for display, `offsetForOrder` for a
 * payload - so nothing is lost by leaving the store faithful.
 */
export const normaliseCellDirections = (grid: GridData): GridData =>
  grid.map((column) =>
    column.map((cell) => stampCellDirection(cell, cellDirection(cell))),
  );

/**
 * Swap the entry and exit columns, and flip the scale every cell draws.
 *
 * The flip belongs to the cell rather than to each block in it, so it goes
 * through `stampCellDirection` like every other write of a direction: a grid
 * that arrived unstamped comes out of a reverse on the invariant rather than
 * carrying its old disagreement into the mirrored column.
 *
 * It lives here rather than in the provider that calls it because a cell's
 * direction is this module's fact, and a caller spelling out its own flip is
 * the second derivation this module exists to remove.
 */
export const reverseGrid = (grid: GridData): GridData => {
  const flipped = (direction: BlockDirection): BlockDirection =>
    direction === "downside" ? "upside" : "downside";
  const flipCell = (cell: BlockData[]): BlockData[] =>
    stampCellDirection(cell, flipped(cellDirection(cell)));

  return [grid[1].map(flipCell), grid[0].map(flipCell)];
};

// =============================================================================
// THE DERIVED ANSWER EVERY CONSUMER ACTUALLY WANTS
// =============================================================================

/**
 * The price a block at this offset on this scale represents.
 *
 * `priceAtOffset` is still the formula; this is the only thing that decides
 * what is fed to it, so the chip, the chart line and the payload cannot end up
 * calling it with different arguments for the same block.
 */
export function priceForOffset(
  marketPrice: number,
  yPosition: number,
  direction: BlockDirection,
): number;
export function priceForOffset(
  marketPrice: number | null,
  yPosition: number,
  direction: BlockDirection,
): number | null;
export function priceForOffset(
  marketPrice: number | null,
  yPosition: number,
  direction: BlockDirection,
): number | null {
  // Overloaded rather than always nullable: a caller that already has a market
  // price - the order mapper - would otherwise need a `?? 0` to satisfy the
  // compiler, and a zero standing in for "no price" inside an order payload is
  // the exact value this module exists to keep out of one.
  return marketPrice === null
    ? null
    : priceAtOffset(
        marketPrice,
        clampOffset(yPosition),
        isDescending(direction),
      );
}

/**
 * The price the order path sends, from the same formula and the same direction
 * reading as the chip and the chart line. It splits from `priceForOffset` only
 * where `offsetForOrder` splits from `clampOffset`: a non-finite position stays
 * non-finite here, so the price does too and `validateOrder` refuses it.
 */
export const priceForOrderOffset = (
  marketPrice: number,
  yPosition: number,
  direction: BlockDirection,
): number =>
  priceAtOffset(marketPrice, offsetForOrder(yPosition), isDescending(direction));

/**
 * The offset as a signed number: positive above the market price, negative
 * below. What a `role="slider"` reports and what the percentage chip prints, so
 * the value moves the same way the block does on screen.
 */
export const signedOffset = (
  yPosition: number,
  direction: BlockDirection,
): number => {
  const magnitude = clampOffset(yPosition);
  return direction === "downside" ? -magnitude : magnitude;
};

// =============================================================================
// THE GRID AS A SAVED CONFIG
// =============================================================================

/**
 * The saved form of the grid, derived rather than maintained alongside it.
 *
 * `orderConfig` used to be a second copy of the same facts, written by hand at
 * every call site that touched the grid - which is how the chart came to read a
 * direction the cell had already changed its mind about. It is a projection
 * now, so the chart, the Active Orders cards and a saved strategy all read the
 * grid through this one owner.
 */
export const orderConfigFromGrid = (grid: GridData): OrderConfig => {
  const config: OrderConfig = {};

  grid.forEach((column, col) => {
    column.forEach((cell, row) => {
      const direction = cellDirection(cell);
      cell.forEach((block) => {
        config[block.id] =
          // `legOfBlock`, not a second reading of `axes`: which price an order
          // carries has one owner, and the saved config, the chart line, the
          // cell chip and the Kraken payload all take their answer from it.
          legOfBlock(block) === null
            ? { col, row, type: block.orderType }
            : {
                col,
                row,
                type: block.orderType,
                axis: block.axis,
                yPosition: offsetForOrder(block.yPosition),
                direction,
              };
      });
    });
  });

  return config;
};
