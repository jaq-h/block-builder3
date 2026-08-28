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
 * The tile's edge length in CSS pixels, and the one number that says how big a
 * block is.
 *
 * Two things need it as a number rather than as a class. `DragOverlay` centres
 * the ghost on the pointer, so it has to know how far half a tile is; and the
 * drop resolver in `src/utils/dropTarget.ts` hit-tests that ghost's *edges*
 * against the cells, so it has to know where those edges are. Both used to be
 * literals - the overlay carried a `HALF_BLOCK = 20` of its own - which is one
 * fact written three times and the shape of defect this repository keeps
 * paying for.
 *
 * `blockTile.test.ts` pins it against `BLOCK_TILE_SHAPE`'s own `w-10 h-10`
 * (Tailwind's 0.25rem step at the app's 16px root), so changing the tile's
 * class without changing this number fails there rather than silently moving
 * every drop target by a few pixels.
 */
export const BLOCK_TILE_SIZE_PX = 40;
