// Registered intent on its own. Nothing here has a socket, which is the point:
// what the app wants is answerable without asking what is connected.
import { describe, it, expect } from "vitest";

import { SubscriptionRegistry } from "@api/subscriptionRegistry";

const frame = (channel: string) => ({
  method: "subscribe",
  params: { channel },
});

describe("SubscriptionRegistry", () => {
  it("reports a genuinely new key, and a repeat as already held", () => {
    const registry = new SubscriptionRegistry();

    expect(registry.acquire("ticker:BTC/USD", frame("ticker"))).toBe(true);
    expect(registry.acquire("ticker:BTC/USD", frame("ticker"))).toBe(false);
    expect(registry.keys()).toEqual(["ticker:BTC/USD"]);
  });

  it("drops a channel only when the last consumer lets go", () => {
    const registry = new SubscriptionRegistry();
    registry.acquire("ticker:BTC/USD", frame("ticker"));
    registry.acquire("ticker:BTC/USD", frame("ticker"));

    expect(registry.release("ticker:BTC/USD")).toBe(false);
    expect(registry.has("ticker:BTC/USD")).toBe(true);

    expect(registry.release("ticker:BTC/USD")).toBe(true);
    expect(registry.has("ticker:BTC/USD")).toBe(false);
  });

  it("releases nothing for a key it never held", () => {
    const registry = new SubscriptionRegistry();
    expect(registry.release("ticker:SOL/USD")).toBe(false);
  });

  it("does not resurrect a released key by releasing it again", () => {
    const registry = new SubscriptionRegistry();
    registry.acquire("ticker:BTC/USD", frame("ticker"));

    expect(registry.release("ticker:BTC/USD")).toBe(true);
    // A second release must not report another last-consumer departure, or the
    // manager sends a second `unsubscribe` for a channel already gone.
    expect(registry.release("ticker:BTC/USD")).toBe(false);
  });

  it("replays frames in the order the channels were first asked for", () => {
    const registry = new SubscriptionRegistry();
    registry.acquire("ticker:BTC/USD", frame("ticker"));
    registry.acquire("ohlc:BTC/USD:60", frame("ohlc"));
    registry.acquire("ticker:BTC/USD", frame("ticker"));

    expect(registry.frames()).toEqual([frame("ticker"), frame("ohlc")]);
  });

  it("holds the frame the channel was registered with, for the replay", () => {
    const registry = new SubscriptionRegistry();
    const message = frame("ohlc");
    registry.acquire("ohlc:BTC/USD:60", message);

    expect(registry.frames()[0]).toBe(message);
  });

  it("forgets everything on a clear", () => {
    const registry = new SubscriptionRegistry();
    registry.acquire("ticker:BTC/USD", frame("ticker"));
    registry.acquire("ohlc:BTC/USD:60", frame("ohlc"));

    registry.clear();

    expect(registry.keys()).toEqual([]);
    expect(registry.frames()).toEqual([]);
  });
});
