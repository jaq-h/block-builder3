/**
 * The connection lifecycle of one WebSocket, as an explicit state machine.
 *
 * This module owns **live connection state** and nothing else. What the app
 * *wants* to be subscribed to is registered intent and lives in
 * `subscriptionRegistry.ts`; the two are deliberately separate types, because
 * conflating them is what produced every lifecycle defect this replaced - a
 * failed connect that dropped the channels, a reconnect that came back silent,
 * a caller left suspended on a socket nobody owned any more.
 *
 * ## The states
 *
 * - `idle`         - no socket and no attempt. The state a manager starts in
 *                    and the state `disconnect()` returns it to.
 * - `connecting`   - one attempt is in flight: whatever `prepare` has to do
 *                    (the private socket mints its token here) followed by the
 *                    handshake. Exactly one attempt exists at a time.
 * - `open`         - the socket is open and has been restored: `onOpen` has
 *                    run, so registered intent is already on the wire before
 *                    any caller is told the connection is up.
 * - `reconnecting` - the connection went away, budget remains, and a backoff
 *                    timer is armed. No socket exists in this state.
 * - `failed`       - terminal. The reconnect budget is spent and nothing will
 *                    retry on its own. `connect()` is the one way out, and it
 *                    is an explicit act by a caller that wants a connection.
 *
 * ## The transitions
 *
 * `CONNECTION_TRANSITIONS` below is the whole table, and `transition()`
 * refuses an edge that is not in it rather than letting an unforeseen sequence
 * quietly redefine the model.
 *
 * ## What the machine guarantees
 *
 * - **One attempt, one promise.** Every caller racing a connect is handed the
 *   same promise, and that promise settles exactly once: resolved on entry to
 *   `open`, rejected on entry to `reconnecting`, `failed` or `idle`. No exit
 *   from `connecting` leaves it pending.
 * - **Per-socket reconnect state.** The budget, the timer and the abort handle
 *   belong to this instance and to the attempt inside it, so one socket's
 *   flapping cannot spend another's budget, and a stale attempt's handlers
 *   cannot drive the current one.
 * - **Ordering is structural.** `onOpen` runs inside the `open` transition,
 *   before the status is announced and before the connect promise resolves, so
 *   "connect, then subscribe, then replay" is not something callers have to
 *   arrange between themselves.
 */

import type { WebSocketMessage, WebSocketStatus } from "./types";

/** The kinds of socket the app runs. Each gets its own machine instance. */
export type SocketKind = "public" | "private";

/** Every state the connection lifecycle can be in. */
export type ConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "failed";

/**
 * The legal edges, written down rather than implied. `transition()` throws on
 * anything absent here, which is what keeps a new call site from inventing a
 * sixth state out of a boolean.
 */
export const CONNECTION_TRANSITIONS: Readonly<
  Record<ConnectionState, readonly ConnectionState[]>
> = {
  idle: ["connecting"],
  connecting: ["open", "reconnecting", "failed", "idle"],
  open: ["reconnecting", "failed", "idle"],
  reconnecting: ["connecting", "idle"],
  failed: ["connecting", "idle"],
};

/**
 * How each state reports itself to the rest of the app. `open` is the one that
 * differs per socket - the public socket is "connected", the private one is
 * "authenticated", because it holds a token by the time it opens at all.
 */
const STATE_STATUS: Readonly<
  Record<Exclude<ConnectionState, "open">, WebSocketStatus>
> = {
  idle: "disconnected",
  connecting: "connecting",
  reconnecting: "disconnected",
  failed: "error",
};

export interface SocketLifecycleConfig {
  /** Which socket this is. Used for messages only; state is per instance. */
  name: SocketKind;
  url: string;
  /** Attempts after the first before the machine gives up and goes terminal. */
  maxReconnectAttempts: number;
  /** First backoff delay. Each further attempt doubles it. */
  reconnectBaseDelayMs: number;
  heartbeatIntervalMs: number;
  /** The status to report on entering `open`. */
  openStatus: WebSocketStatus;
  /**
   * Anything that must happen before the socket is constructed. The private
   * socket mints its Kraken token here. It **must** honour `signal`: the
   * signal is aborted the moment the attempt is abandoned, and whatever
   * `prepare` obtained must not outlive it.
   *
   * Omit it entirely when there is nothing to do - the machine then constructs
   * the socket synchronously inside `connect()`, so two callers racing on
   * mount cannot observe a window with no socket in it.
   */
  prepare?: (signal: AbortSignal) => Promise<void>;
  /**
   * Run inside the `open` transition, before the status is announced and
   * before the connect promise resolves. This is where registered intent is
   * replayed onto the fresh socket.
   */
  onOpen?: () => void;
  onMessage: (data: WebSocketMessage) => void;
  /**
   * Run whenever the machine leaves `connecting` or `open` without an open
   * socket - a drop, a failed attempt, or an explicit disconnect. Everything
   * scoped to that one connection is released here: the private token, and
   * every request still waiting on a reply that is never coming.
   */
  onLost?: (reason: Error) => void;
  onStatus: (status: WebSocketStatus) => void;
  onError: (error: unknown, fatal: boolean) => void;
}

/** A promise plus the handles to settle it from outside. */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/**
 * One connection attempt. Everything here is scoped to a single socket, which
 * is the point: a superseded attempt owns its own abort handle and its own
 * waiters, so abandoning it cannot touch its replacement.
 */
interface Attempt {
  socket: WebSocket | null;
  readonly controller: AbortController;
  readonly settled: Deferred<void>;
}

/**
 * Detach every handler before letting go of a socket, so an orphan cannot
 * still drive status or schedule a reconnect after it has been replaced.
 */
const abandon = (socket: WebSocket | null): void => {
  if (!socket) return;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  if (
    socket.readyState === WebSocket.CONNECTING ||
    socket.readyState === WebSocket.OPEN
  ) {
    socket.close();
  }
};

export class SocketLifecycle {
  private readonly config: SocketLifecycleConfig;

  private currentState: ConnectionState = "idle";
  private attempt: Attempt | null = null;

  /** Per-socket, never shared: this instance's own retry budget and timer. */
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Bumped on every entry to `open`. A caller that wants to know whether the
   * connection it is holding was re-established underneath it - and therefore
   * whether the replay has already sent its frame - compares this across an
   * await instead of guessing from a readyState it sampled beforehand.
   */
  private generation = 0;

  constructor(config: SocketLifecycleConfig) {
    this.config = config;
  }

  get state(): ConnectionState {
    return this.currentState;
  }

  get status(): WebSocketStatus {
    return this.currentState === "open"
      ? this.config.openStatus
      : STATE_STATUS[this.currentState];
  }

  get openGeneration(): number {
    return this.generation;
  }

  /**
   * Ask for a live connection.
   *
   * Every state answers definitively, including the terminal one: an explicit
   * `connect()` is the defined way back from `failed`, and it hands the socket
   * a fresh budget. Nothing the machine does on its own reaches that branch,
   * so a socket that gave up stays given up until a consumer asks again.
   */
  connect(): Promise<void> {
    switch (this.currentState) {
      case "open":
        return Promise.resolve();

      case "connecting":
        // Racing callers share the one attempt rather than opening a second
        // socket over the top of the first.
        return this.attempt!.settled.promise;

      case "reconnecting":
        // The armed backoff is exactly what this caller is waiting out.
        this.clearReconnectTimer();
        return this.beginAttempt();

      case "failed":
        this.reconnectAttempts = 0;
        return this.beginAttempt();

      case "idle":
        return this.beginAttempt();
    }
  }

  /** Send a frame, but only on a socket that is actually open. */
  send(message: unknown): boolean {
    const socket = this.attempt?.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  /**
   * Tear the connection down and return to `idle`.
   *
   * This is the only exit that is not driven by the socket, so it has to do by
   * hand everything the socket handlers would have done: abort the attempt
   * (which cancels an in-flight `prepare`, so a private token is never minted
   * for a connection that no longer exists), detach and close the socket,
   * release connection-scoped state, and settle the caller who is suspended on
   * the connect promise. Its resolve paths all hang off handlers this method
   * has just detached, so without the explicit rejection that caller waits
   * forever.
   */
  disconnect(reason: Error): void {
    this.clearReconnectTimer();
    this.stopHeartbeat();

    const attempt = this.attempt;
    this.attempt = null;
    if (attempt) {
      attempt.controller.abort(reason);
      abandon(attempt.socket);
    }

    this.reconnectAttempts = 0;
    this.config.onLost?.(reason);

    if (this.currentState !== "idle") {
      this.transition("idle");
    }
    // Announced even from `idle`, so a caller that tears down twice still sees
    // one unambiguous "this connection is down" for each attempt.
    this.config.onStatus(this.status);

    attempt?.settled.reject(reason);
  }

  // ───────────────────────────────────────────────────────────────────
  // The machine
  // ───────────────────────────────────────────────────────────────────

  private transition(next: ConnectionState): void {
    if (!CONNECTION_TRANSITIONS[this.currentState].includes(next)) {
      throw new Error(
        `Illegal ${this.config.name} socket transition: ${this.currentState} -> ${next}`,
      );
    }
    this.currentState = next;
  }

  /** Transition and announce in one step, for every state but `open`. */
  private enter(next: Exclude<ConnectionState, "open">): void {
    this.transition(next);
    this.config.onStatus(this.status);
  }

  private beginAttempt(): Promise<void> {
    this.transition("connecting");
    this.config.onStatus(this.status);

    const attempt: Attempt = {
      socket: null,
      controller: new AbortController(),
      settled: deferred<void>(),
    };
    this.attempt = attempt;

    const run = async (): Promise<void> => {
      const { prepare } = this.config;
      if (prepare) {
        await prepare(attempt.controller.signal);
        if (attempt.controller.signal.aborted) {
          throw new Error(
            `The ${this.config.name} WebSocket attempt was abandoned`,
          );
        }
      }
      this.openSocket(attempt);
    };

    run().catch((error: unknown) => {
      // A superseded attempt has already been accounted for; only the current
      // one may move the machine.
      if (this.attempt !== attempt) return;
      this.handleLost(
        error instanceof Error ? error : new Error(String(error)),
      );
    });

    return attempt.settled.promise;
  }

  private openSocket(attempt: Attempt): void {
    const socket = new WebSocket(this.config.url);
    attempt.socket = socket;

    // Every handler checks that this attempt is still the current one, so a
    // socket that was replaced mid-flight goes quietly instead of flipping
    // status or scheduling a reconnect for a connection nobody is using.
    const owns = () => this.attempt === attempt;

    socket.onopen = () => {
      if (!owns()) return;
      this.enterOpen(attempt);
    };

    socket.onmessage = (event: MessageEvent) => {
      if (!owns()) return;
      try {
        this.config.onMessage(
          JSON.parse(event.data as string) as WebSocketMessage,
        );
      } catch (error) {
        console.error(
          `Failed to parse ${this.config.name} WebSocket message:`,
          error,
        );
      }
    };

    socket.onerror = (error: Event) => {
      if (!owns()) return;
      // Reported, but not a transition: the platform follows a connection
      // error with a close, and `onclose` is the single edge the machine moves
      // on. Two edges for one failure is how a socket came to be counted twice
      // against its own budget.
      this.config.onError(error, false);
    };

    socket.onclose = () => {
      if (!owns()) return;
      this.handleLost(
        new Error(`The ${this.config.name} WebSocket connection closed`),
      );
    };
  }

  private enterOpen(attempt: Attempt): void {
    this.transition("open");
    this.reconnectAttempts = 0;
    this.generation += 1;
    this.startHeartbeat();

    // Restore before anyone is told the connection is up, so no observer can
    // see an open socket that is not carrying the channels it is meant to.
    this.config.onOpen?.();

    this.config.onStatus(this.status);
    attempt.settled.resolve();
  }

  /**
   * The connection is gone. Decide between another attempt and the terminal
   * state, and settle everything scoped to the attempt that just died.
   */
  private handleLost(reason: Error): void {
    const attempt = this.attempt;
    this.attempt = null;
    this.stopHeartbeat();

    if (attempt) {
      attempt.controller.abort(reason);
      abandon(attempt.socket);
    }

    this.config.onLost?.(reason);

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      const fatal = new Error(
        `Gave up reconnecting the ${this.config.name} WebSocket after ${this.config.maxReconnectAttempts} attempts`,
      );
      console.warn(fatal.message);
      this.enter("failed");
      attempt?.settled.reject(fatal);
      // Tell the UI. Staying silent here is what left the app looking
      // connected while the connection was permanently dead.
      this.config.onError(fatal, true);
      return;
    }

    this.reconnectAttempts += 1;
    const delay =
      this.config.reconnectBaseDelayMs *
      Math.pow(2, this.reconnectAttempts - 1);

    this.enter("reconnecting");
    attempt?.settled.reject(reason);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.currentState !== "reconnecting") return;
      // The retry is the machine's own, not a caller's, so its rejection is
      // reported through `status` and `error` rather than thrown at nobody.
      this.beginAttempt().catch(() => {});
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // Per socket, because a shared heartbeat means one socket's teardown stops
    // the other's pings - which is exactly what a single manager-wide interval
    // driven off the public socket's open used to do.
    this.heartbeatTimer = setInterval(() => {
      this.send({ method: "ping" });
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
