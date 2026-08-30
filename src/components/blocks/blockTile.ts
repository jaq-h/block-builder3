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
