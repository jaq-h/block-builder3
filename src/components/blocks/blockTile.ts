/**
 * A block tile's shape, with no colour in it.
 *
 * Two components draw this tile: `Block` at rest in the palette and in a cell,
 * and `DragOverlay` at the cursor while one is in flight. The measurements have
 * one owner here so they cannot drift, and each component states its own colour,
 * because the colours differ on purpose - see the comment on `buttonVariants` in
 * `./block.tsx`, which is the authority on why the resting tile stays quiet
 * while a carried one is painted at full accent.
 *
 * It lives in its own module rather than beside `buttonVariants` so `block.tsx`
 * exports components alone and Fast Refresh keeps working.
 */
export const BLOCK_TILE_SHAPE = [
  "w-10 h-10 flex flex-col justify-center items-center p-[3px]",
  "border-2 rounded-md select-none",
  "text-text-primary",
  "[&_svg]:w-5 [&_svg]:h-5 [&_svg]:stroke-current [&_svg]:pointer-events-none",
];

/**
 * The Remove control drawn on a placed block's top-right corner.
 *
 * It lives beside the tile rather than in `block.tsx` for the reason above and
 * for one more: it is pinned OUTSIDE the tile it belongs to, so its offset and
 * the gap between two sibling tiles are one measurement stated in two places -
 * `centeredContainer` in `@styles/grid` sets that gap, and `blockTile.test.ts`
 * checks the pair. Flush tiles put this control over the NEIGHBOUR's top-left
 * corner, where a press aimed at one block removed the block beside it.
 *
 * It is rendered rather than revealed on hover, and that is the decision the
 * affordance turns on: a control shown on `:hover` exists for a mouse and for
 * nothing else - a finger has no hover, and the sticky `:hover` a tap leaves
 * behind on some browsers is an accident rather than an affordance.
 *
 * `w-6 h-6` is 24px, the WCAG 2.2 SC 2.5.8 minimum target size, the same floor
 * `chartToggleButton` carries. `p-0` beside it is load-bearing rather than
 * tidiness: `src/index.css`'s layered `button` default is `padding: 0.6em
 * 1.2em`, and under `box-sizing: border-box` a `width` cannot shrink a box
 * below its own padding and border - so `w-6` asked for 24px and the button
 * measured 40.375px wide in Chrome, wider than the 40px tile it sits on. The
 * app has exactly one mechanism for a control that wants to look different,
 * and it is stating the utility (`AGENTS.md`, "Layout and the CSS cascade");
 * this is that, and `BLOCK_TILE_SHAPE`'s own `p-[3px]` is the same move for
 * the same reason.
 *
 * The colour is quiet at rest and turns red under the cursor or the focus
 * ring: a grid full of red dots would spend, on the least-used control on
 * screen, exactly the visual weight the block tiles need for saying what they
 * are.
 */
export const REMOVE_CONTROL_SHAPE = [
  "absolute -top-2 -right-2 z-2",
  "p-0 w-6 h-6 flex items-center justify-center rounded-full cursor-pointer",
  "border border-border-neutral bg-bg-column text-white-70",
  "transition-colors duration-150",
  "hover:bg-status-red-bg-strong hover:border-status-red-border hover:text-text-primary",
  "focus-visible:bg-status-red-bg-strong focus-visible:border-status-red-border focus-visible:text-text-primary",
  "[&_svg]:w-3 [&_svg]:h-3 [&_svg]:stroke-current [&_svg]:pointer-events-none",
];
