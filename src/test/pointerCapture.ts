import { vi } from "vitest";

// =============================================================================
// POINTER CAPTURE STAND-IN
// =============================================================================
//
// jsdom ships `PointerEvent` but not the pointer-capture methods, so the
// production code's optional calls silently do nothing there. Installing a
// tracking implementation is what lets a test assert the thing that actually
// fixes "released outside the window": that the element takes capture on
// pointer down and gives it back on release.

export interface PointerCaptureTracker {
  /** Pointer ids currently captured, keyed by the element that holds them. */
  captured: Map<Element, Set<number>>;
  captureCalls: number;
  releaseCalls: number;
  restore: () => void;
}

const CAPTURE_METHODS = [
  "setPointerCapture",
  "hasPointerCapture",
  "releasePointerCapture",
] as const;

export const installPointerCapture = (): PointerCaptureTracker => {
  const captured = new Map<Element, Set<number>>();

  const previous = new Map(
    CAPTURE_METHODS.map((method) => [
      method,
      Object.getOwnPropertyDescriptor(Element.prototype, method),
    ]),
  );

  const tracker: PointerCaptureTracker = {
    captured,
    captureCalls: 0,
    releaseCalls: 0,
    restore: () => {
      for (const method of CAPTURE_METHODS) {
        const descriptor = previous.get(method);
        if (descriptor) {
          Object.defineProperty(Element.prototype, method, descriptor);
        } else {
          Reflect.deleteProperty(Element.prototype, method);
        }
      }
    },
  };

  Element.prototype.setPointerCapture = vi.fn(function (
    this: Element,
    pointerId: number,
  ) {
    tracker.captureCalls += 1;
    const ids = captured.get(this) ?? new Set<number>();
    ids.add(pointerId);
    captured.set(this, ids);
  });

  Element.prototype.hasPointerCapture = vi.fn(function (
    this: Element,
    pointerId: number,
  ) {
    return captured.get(this)?.has(pointerId) ?? false;
  });

  Element.prototype.releasePointerCapture = vi.fn(function (
    this: Element,
    pointerId: number,
  ) {
    tracker.releaseCalls += 1;
    captured.get(this)?.delete(pointerId);
  });

  return tracker;
};
