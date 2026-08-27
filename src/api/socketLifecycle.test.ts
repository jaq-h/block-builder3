// The connection state machine on its own, with no Kraken in it. Everything
// here is about the model: which transitions exist, what settles a promise,
// and what belongs to one socket rather than to the manager.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  CONNECTION_TRANSITIONS,
  SocketLifecycle,
  type ConnectionState,
  type SocketLifecycleConfig,
} from "@api/socketLifecycle";
import type { WebSocketStatus } from "@api/types";
import { FakeWebSocket, installFakeWebSocket } from "@/test/fakeWebSocket";

let uninstall: () => void;

beforeEach(() => {
  uninstall = installFakeWebSocket();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  uninstall();
});

interface Harness {
  lifecycle: SocketLifecycle;
  statuses: WebSocketStatus[];
  fatal: unknown[];
  /** Everything `onOpen` was able to see, recorded at the moment it ran. */
  openLog: { state: ConnectionState; statusesSoFar: number }[];
  lost: string[];
  prepareSignals: AbortSignal[];
  /** Releases a `prepare` that is deliberately left hanging. */
  resolvePrepare: (() => void) | null;
}

const build = (
  overrides: Partial<SocketLifecycleConfig> = {},
  options: { hangPrepare?: boolean; withPrepare?: boolean } = {},
): Harness => {
  const harness: Harness = {
    lifecycle: null as unknown as SocketLifecycle,
    statuses: [],
    fatal: [],
    openLog: [],
    lost: [],
    prepareSignals: [],
    resolvePrepare: null,
  };

  const prepare = (signal: AbortSignal) => {
    harness.prepareSignals.push(signal);
    if (!options.hangPrepare) return Promise.resolve();
    return new Promise<void>((resolve) => {
      harness.resolvePrepare = resolve;
    });
  };

  harness.lifecycle = new SocketLifecycle({
    name: "public",
    url: "wss://example.test/v2",
    maxReconnectAttempts: 3,
    reconnectBaseDelayMs: 1000,
    heartbeatIntervalMs: 30000,
    openStatus: "connected",
    onOpen: () => {
      harness.openLog.push({
        state: harness.lifecycle.state,
        statusesSoFar: harness.statuses.length,
      });
    },
    onMessage: () => {},
    onLost: (reason) => harness.lost.push(reason.message),
    onStatus: (status) => harness.statuses.push(status),
    onError: (error, isFatal) => {
      if (isFatal) harness.fatal.push(error);
    },
    ...(options.withPrepare || options.hangPrepare ? { prepare } : {}),
    ...overrides,
  });

  return harness;
};

const flush = () => vi.advanceTimersByTimeAsync(0);

// =============================================================================
// THE TABLE
// =============================================================================

describe("CONNECTION_TRANSITIONS", () => {
  const states: ConnectionState[] = [
    "idle",
    "connecting",
    "open",
    "reconnecting",
    "failed",
  ];

  it("names every state on both sides of the table", () => {
    expect(Object.keys(CONNECTION_TRANSITIONS).sort()).toEqual(
      [...states].sort(),
    );
    for (const targets of Object.values(CONNECTION_TRANSITIONS)) {
      for (const target of targets) {
        expect(states).toContain(target);
      }
    }
  });

  it("leaves no state without a way out, and no state unreachable", () => {
    for (const state of states) {
      expect(CONNECTION_TRANSITIONS[state].length).toBeGreaterThan(0);
      const reachedFrom = states.filter((from) =>
        CONNECTION_TRANSITIONS[from].includes(state),
      );
      // `idle` is where a machine starts; everything else has to be entered.
      if (state !== "idle") expect(reachedFrom.length).toBeGreaterThan(0);
    }
  });

  it("makes the terminal state terminal, with exactly two named ways out", () => {
    // `connecting` is the recovery an explicit caller asks for; `idle` is a
    // teardown. Nothing else, and nothing automatic.
    expect([...CONNECTION_TRANSITIONS.failed].sort()).toEqual([
      "connecting",
      "idle",
    ]);
  });

  it("gives `connecting` an exit for every way an attempt can end", () => {
    // Resolved, retried, given up on, and torn down. A missing one here is a
    // caller left suspended on a promise that never settles.
    expect([...CONNECTION_TRANSITIONS.connecting].sort()).toEqual([
      "failed",
      "idle",
      "open",
      "reconnecting",
    ]);
  });
});

// =============================================================================
// STATES
// =============================================================================

describe("SocketLifecycle - states", () => {
  it("starts idle and reports itself disconnected", () => {
    const { lifecycle } = build();
    expect(lifecycle.state).toBe("idle");
    expect(lifecycle.status).toBe("disconnected");
  });

  it("goes idle -> connecting -> open across a handshake", async () => {
    const { lifecycle, statuses } = build();

    const connecting = lifecycle.connect();
    expect(lifecycle.state).toBe("connecting");
    expect(lifecycle.status).toBe("connecting");

    FakeWebSocket.last.openConnection();
    await connecting;

    expect(lifecycle.state).toBe("open");
    expect(statuses).toEqual(["connecting", "connected"]);
  });

  it("goes open -> reconnecting when the connection drops, then back", async () => {
    const { lifecycle } = build();

    const connecting = lifecycle.connect();
    FakeWebSocket.last.openConnection();
    await connecting;

    FakeWebSocket.last.dropConnection();
    expect(lifecycle.state).toBe("reconnecting");
    // A backoff is not a teardown, but the app-facing summary collapses both.
    expect(lifecycle.status).toBe("disconnected");

    await vi.advanceTimersByTimeAsync(1000);
    expect(lifecycle.state).toBe("connecting");

    FakeWebSocket.last.openConnection();
    await flush();
    expect(lifecycle.state).toBe("open");
  });

  it("goes to failed once the budget is spent, and stops on its own", async () => {
    const { lifecycle, fatal } = build();

    const connecting = lifecycle.connect().catch(() => {});
    FakeWebSocket.last.openConnection();
    await connecting;

    // Three attempts, then the fourth loss is terminal.
    for (const delay of [1000, 2000, 4000]) {
      FakeWebSocket.last.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(FakeWebSocket.instances).toHaveLength(4);

    FakeWebSocket.last.dropConnection();
    expect(lifecycle.state).toBe("failed");
    expect(lifecycle.status).toBe("error");
    expect(fatal).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(600000);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });
});

// =============================================================================
// TERMINAL STATE: THE WAY BACK
// =============================================================================

describe("SocketLifecycle - recovery from the terminal state", () => {
  const exhaust = async (lifecycle: SocketLifecycle) => {
    const connecting = lifecycle.connect().catch(() => {});
    FakeWebSocket.last.openConnection();
    await connecting;
    for (const delay of [1000, 2000, 4000]) {
      FakeWebSocket.last.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    FakeWebSocket.last.dropConnection();
    await flush();
    expect(lifecycle.state).toBe("failed");
  };

  it("reopens on an explicit connect", async () => {
    const { lifecycle } = build();
    await exhaust(lifecycle);

    const before = FakeWebSocket.instances.length;
    const reconnecting = lifecycle.connect();
    expect(lifecycle.state).toBe("connecting");
    expect(FakeWebSocket.instances).toHaveLength(before + 1);

    FakeWebSocket.last.openConnection();
    await reconnecting;
    expect(lifecycle.state).toBe("open");
  });

  it("hands the recovered socket a whole budget rather than a spent one", async () => {
    const { lifecycle, fatal } = build();
    await exhaust(lifecycle);

    // The recovery attempt fails immediately. With the old spent budget it
    // would go straight back to terminal with no retries at all; the way back
    // has to be a real one.
    const recovering = lifecycle.connect().catch(() => {});
    FakeWebSocket.last.dropConnection();
    await recovering;

    expect(lifecycle.state).toBe("reconnecting");
    expect(fatal).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(lifecycle.state).toBe("connecting");
  });

  it("refuses to reopen by itself, however long it is left alone", async () => {
    const { lifecycle } = build();
    await exhaust(lifecycle);

    const before = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(3600000);

    expect(lifecycle.state).toBe("failed");
    expect(FakeWebSocket.instances).toHaveLength(before);
  });
});

// =============================================================================
// PROMISE SETTLEMENT
// =============================================================================

describe("SocketLifecycle - promise settlement", () => {
  it("hands every racing caller the same promise", () => {
    const { lifecycle } = build();
    const first = lifecycle.connect();
    const second = lifecycle.connect();

    expect(second).toBe(first);
    expect(FakeWebSocket.instances).toHaveLength(1);
    void first.catch(() => {});
    lifecycle.disconnect(new Error("teardown"));
  });

  it("rejects a connect that disconnect abandons while connecting", async () => {
    const { lifecycle } = build();
    const connecting = lifecycle.connect();

    lifecycle.disconnect(new Error("torn down"));

    await expect(connecting).rejects.toThrow("torn down");
    expect(lifecycle.state).toBe("idle");
  });

  it("rejects a connect that disconnect abandons during prepare", async () => {
    const { lifecycle } = build({}, { hangPrepare: true });
    const connecting = lifecycle.connect();
    await flush();

    // No socket has been constructed yet: the attempt is still in `prepare`.
    expect(FakeWebSocket.instances).toHaveLength(0);

    lifecycle.disconnect(new Error("torn down"));

    await expect(connecting).rejects.toThrow("torn down");
  });

  it("does not construct a socket for an attempt abandoned mid-prepare", async () => {
    const harness = build({}, { hangPrepare: true });
    const connecting = harness.lifecycle.connect();
    await flush();

    harness.lifecycle.disconnect(new Error("torn down"));
    await expect(connecting).rejects.toThrow("torn down");

    // The prepare answers anyway - a response that had already left the server
    // when the abort landed - and this one does not police its own signal. The
    // machine must not open a socket on the back of it, because nothing would
    // then be holding that socket: its handlers all check ownership and go
    // quiet, so it would stay open to the far end with no owner at all.
    harness.resolvePrepare!();
    await vi.advanceTimersByTimeAsync(600000);

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(harness.lifecycle.state).toBe("idle");
  });

  it("rejects a connect when the attempt drops into a backoff", async () => {
    const { lifecycle } = build();
    const connecting = lifecycle.connect();

    FakeWebSocket.last.dropConnection();

    await expect(connecting).rejects.toThrow("connection closed");
    expect(lifecycle.state).toBe("reconnecting");
  });

  it("rejects a connect when the attempt is the one that goes terminal", async () => {
    const { lifecycle } = build({ maxReconnectAttempts: 0 });
    const connecting = lifecycle.connect();

    FakeWebSocket.last.dropConnection();

    await expect(connecting).rejects.toThrow("Gave up reconnecting");
    expect(lifecycle.state).toBe("failed");
  });

  it("leaves nothing pending whichever state disconnect interrupts", async () => {
    for (const arrive of ["connecting", "reconnecting", "open"] as const) {
      FakeWebSocket.reset();
      const { lifecycle } = build();

      const first = lifecycle.connect();
      if (arrive === "connecting") {
        // Already there.
      } else if (arrive === "reconnecting") {
        void first.catch(() => {});
        FakeWebSocket.last.dropConnection();
        await expect(first).rejects.toThrow();
      } else {
        FakeWebSocket.last.openConnection();
        await first;
      }

      const pending = lifecycle.connect();
      lifecycle.disconnect(new Error(`torn down from ${arrive}`));

      // An open socket resolves rather than rejects, because it was open when
      // the caller asked; every other arrival has to reject.
      if (arrive === "open") {
        await expect(pending).resolves.toBeUndefined();
      } else {
        await expect(pending).rejects.toThrow(`torn down from ${arrive}`);
      }
      expect(lifecycle.state).toBe("idle");
    }
  });
});

// =============================================================================
// ORDERING
// =============================================================================

describe("SocketLifecycle - ordering", () => {
  it("runs onOpen inside the open transition, before anyone is told", async () => {
    const { lifecycle, openLog, statuses } = build();

    const connecting = lifecycle.connect();
    // One status so far: "connecting".
    FakeWebSocket.last.openConnection();
    await connecting;

    expect(openLog).toEqual([{ state: "open", statusesSoFar: 1 }]);
    expect(statuses).toEqual(["connecting", "connected"]);
  });

  it("resolves the connect promise only after onOpen has run", async () => {
    const order: string[] = [];
    const harness = build({
      onOpen: () => order.push("onOpen"),
    });

    const connecting = harness.lifecycle.connect().then(() => {
      order.push("resolved");
    });
    FakeWebSocket.last.openConnection();
    await connecting;

    expect(order).toEqual(["onOpen", "resolved"]);
  });

  it("counts an open generation only when the socket actually opens", async () => {
    const { lifecycle } = build();
    expect(lifecycle.openGeneration).toBe(0);

    const connecting = lifecycle.connect();
    expect(lifecycle.openGeneration).toBe(0);

    FakeWebSocket.last.openConnection();
    await connecting;
    expect(lifecycle.openGeneration).toBe(1);

    FakeWebSocket.last.dropConnection();
    await vi.advanceTimersByTimeAsync(1000);
    expect(lifecycle.openGeneration).toBe(1);

    FakeWebSocket.last.openConnection();
    await flush();
    expect(lifecycle.openGeneration).toBe(2);
  });
});

// =============================================================================
// PER-SOCKET STATE
// =============================================================================

describe("SocketLifecycle - per-socket state", () => {
  it("keeps each instance's reconnect budget to itself", async () => {
    const first = build({ url: "wss://first.test/v2" });
    const second = build({ url: "wss://second.test/v2" });
    const socketsFor = (url: string) =>
      FakeWebSocket.instances.filter((s) => s.url === url);

    const a = first.lifecycle.connect().catch(() => {});
    socketsFor("wss://first.test/v2").at(-1)!.openConnection();
    await a;
    const b = second.lifecycle.connect().catch(() => {});
    socketsFor("wss://second.test/v2").at(-1)!.openConnection();
    await b;

    // Spend the first instance's budget entirely.
    for (const delay of [1000, 2000, 4000]) {
      socketsFor("wss://first.test/v2").at(-1)!.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    socketsFor("wss://first.test/v2").at(-1)!.dropConnection();
    await flush();
    expect(first.lifecycle.state).toBe("failed");

    // The second instance is untouched by any of that: still open, still
    // holding a full budget of its own.
    expect(second.lifecycle.state).toBe("open");
    expect(second.lifecycle.openGeneration).toBe(1);

    const before = socketsFor("wss://second.test/v2").length;
    socketsFor("wss://second.test/v2").at(-1)!.dropConnection();
    // The first retry, at the base delay, rather than the fourth at 8x it.
    await vi.advanceTimersByTimeAsync(1000);
    expect(socketsFor("wss://second.test/v2")).toHaveLength(before + 1);
  });

  it("aborts the attempt's own signal, and only when that attempt ends", async () => {
    const { lifecycle, prepareSignals } = build({}, { withPrepare: true });

    const connecting = lifecycle.connect();
    await flush();
    expect(prepareSignals).toHaveLength(1);
    expect(prepareSignals[0].aborted).toBe(false);

    FakeWebSocket.last.openConnection();
    await connecting;
    // An attempt that succeeded is still live; nothing has been called off.
    expect(prepareSignals[0].aborted).toBe(false);

    lifecycle.disconnect(new Error("torn down"));
    expect(prepareSignals[0].aborted).toBe(true);
  });

  it("stops a superseded attempt's socket from driving the machine", async () => {
    const { lifecycle } = build();

    lifecycle.connect().catch(() => {});
    const abandoned = FakeWebSocket.last;

    lifecycle.disconnect(new Error("torn down"));
    const reconnecting = lifecycle.connect();
    FakeWebSocket.last.openConnection();
    await reconnecting;

    abandoned.dropConnection();
    await vi.advanceTimersByTimeAsync(600000);

    expect(lifecycle.state).toBe("open");
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("pings on its own socket while open, and stops when it is not", async () => {
    const { lifecycle } = build();

    const connecting = lifecycle.connect();
    const socket = FakeWebSocket.last;
    socket.openConnection();
    await connecting;

    await vi.advanceTimersByTimeAsync(60000);
    expect(socket.sentMessages.filter((m) => m.method === "ping")).toHaveLength(
      2,
    );

    lifecycle.disconnect(new Error("torn down"));
    const before = socket.sent.length;
    await vi.advanceTimersByTimeAsync(600000);
    expect(socket.sent).toHaveLength(before);
  });
});
