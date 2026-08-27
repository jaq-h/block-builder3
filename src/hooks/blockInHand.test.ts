import { describe, it, expect, afterEach, vi } from "vitest";
import {
  holdBlockInHand,
  isBlockInHand,
  releaseBlockInHand,
} from "./blockInHand";

// =============================================================================
// THE ONE OWNER OF "A BLOCK IS IN HAND"
// =============================================================================
//
// Module state, so every test empties it on the way out rather than trusting
// the one before it to have done so.

afterEach(() => {
  releaseBlockInHand();
});

describe("blockInHand", () => {
  it("holds nothing to begin with", () => {
    expect(isBlockInHand()).toBe(false);
    expect(releaseBlockInHand()).toBe(false);
  });

  it("ends every hold on one call, not just the first", () => {
    // The whole point: the pointer gesture and the command carry are two
    // holders of one fact, and a release that reached one of them is the
    // defect this register replaced.
    const gesture = vi.fn();
    const carry = vi.fn();
    holdBlockInHand(gesture);
    holdBlockInHand(carry);

    expect(releaseBlockInHand()).toBe(true);

    expect(gesture).toHaveBeenCalledTimes(1);
    expect(carry).toHaveBeenCalledTimes(1);
    expect(isBlockInHand()).toBe(false);
  });

  it("ends a holder that deregisters itself while being released", () => {
    // Every real holder does this: its release runs its own cancel path, which
    // ends by taking the registration back off. A set mutated while it is
    // being iterated is how one of two holders comes to be skipped.
    const second = vi.fn();
    const stopSecond = holdBlockInHand(second);
    const first = vi.fn(() => {
      stopFirst();
      stopSecond();
    });
    const stopFirst = holdBlockInHand(first);

    releaseBlockInHand();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("forgets a hold that ended on its own", () => {
    const release = vi.fn();
    const stop = holdBlockInHand(release);

    stop();

    expect(isBlockInHand()).toBe(false);
    expect(releaseBlockInHand()).toBe(false);
    expect(release).not.toHaveBeenCalled();
  });

  it("lets a hold be deregistered after the register was already emptied", () => {
    const stop = holdBlockInHand(() => {});
    releaseBlockInHand();

    expect(() => stop()).not.toThrow();
    expect(isBlockInHand()).toBe(false);
  });

  it("does not release the same hold twice", () => {
    const release = vi.fn();
    holdBlockInHand(release);

    releaseBlockInHand();
    releaseBlockInHand();

    expect(release).toHaveBeenCalledTimes(1);
  });
});
