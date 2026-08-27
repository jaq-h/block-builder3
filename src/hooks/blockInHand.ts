// =============================================================================
// BLOCK IN HAND - the one owner of "the user is holding a block"
// =============================================================================
//
// Two mechanisms can put a block in the user's hand, and they are genuinely
// different things rather than two spellings of one: a **pointer gesture**,
// which is live only while the button or the finger is down, and a **command
// carry**, which is live between a pick-up and a place and survives the pointer
// coming off the block entirely. Both are real, both are needed, and the user
// cannot tell them apart - what they see either way is a block that is no
// longer sitting where it was.
//
// They used to be tracked separately, and the escape hatch that puts a block
// down when the user clicks away could only reach one of them. That is the
// defect this module exists to close, and it was not cosmetic. `GridArea`'s
// hatch cleared its own carry while `usePointerGesture` kept a stale gesture's
// window listeners; those listeners match on pointer id alone and a mouse's id
// is a constant 1, so the *next* `pointerup` anywhere in the page was resolved
// as that gesture's drop. A click on the chart to dismiss a ghost ran the drop
// handler at chart coordinates, found no cell, and deleted the block.
//
// So there is one register here and one way to empty it. A holder does not
// answer questions about itself; it hands over the function that ends it, and
// `releaseBlockInHand` is the single call that ends whatever is held, whoever
// holds it. Adding a third mechanism means registering it here, not adding a
// third thing for the hatch to remember to clear.
//
// **What this does not do**, stated rather than implied: it does not notice a
// hold that ends without saying so. A gesture whose release nobody heard is
// still registered here, exactly as it is still live in the hook, and this
// register is what lets a dismissal click end it - it is not what detects that
// it needs ending. `usePointerGesture`'s own exits own that half, the
// `buttons === 0` transition included.

/** Ends one hold, the same way its owner's own cancel path would. */
export type ReleaseHold = () => void;

const holds = new Set<ReleaseHold>();

/**
 * Register that this mechanism now holds a block. Returns the function that
 * takes the registration back off again, for a hold that ends on its own -
 * a drop, a place, a cancel. It is safe to call after `releaseBlockInHand` has
 * already emptied the register.
 */
export const holdBlockInHand = (release: ReleaseHold): (() => void) => {
  holds.add(release);
  return () => {
    holds.delete(release);
  };
};

/** True while any mechanism holds a block. */
export const isBlockInHand = (): boolean => holds.size > 0;

/**
 * End every hold. Returns whether anything was actually held, so a caller can
 * tell a dismissal that did something from a click on the page.
 *
 * The register is emptied *before* the releases run: each release ends its own
 * hold and so calls its deregister function on the way through, and a set being
 * mutated while it is iterated is how one of two holders comes to be skipped.
 */
export const releaseBlockInHand = (): boolean => {
  if (holds.size === 0) return false;
  const releases = [...holds];
  holds.clear();
  for (const release of releases) release();
  return true;
};
