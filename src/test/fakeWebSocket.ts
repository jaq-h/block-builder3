/**
 * A minimal, controllable stand-in for the browser `WebSocket`.
 *
 * It is deliberately strict where the real thing is strict: `send` throws while
 * the socket is still CONNECTING, exactly as Chrome does. That is what turns the
 * connect race in `KrakenWebSocketManager` into a test failure rather than a
 * silent pass.
 */
export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  /** Every socket constructed since the last `reset()`, in order. */
  static instances: FakeWebSocket[] = [];

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  /** The most recently constructed socket. */
  static get last(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error("No FakeWebSocket has been constructed");
    return socket;
  }

  readyState: number = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  /** True once `close()` was called on this socket by the code under test. */
  closedByClient = false;

  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;

  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error(
        "InvalidStateError: Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.",
      );
    }
    this.sent.push(data);
  }

  close(): void {
    this.closedByClient = true;
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  // ─── Test controls ────────────────────────────────────────────────

  /** Complete the handshake. */
  openConnection(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** Drop the connection from the far end, as a network failure would. */
  dropConnection(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  /** Deliver a frame from the server. */
  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  /** Every frame this socket was asked to send, parsed. */
  get sentMessages(): Record<string, unknown>[] {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }
}

/**
 * Install the fake as the global `WebSocket` and return a teardown function.
 */
export const installFakeWebSocket = (): (() => void) => {
  const original = (globalThis as { WebSocket?: unknown }).WebSocket;
  FakeWebSocket.reset();
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
  return () => {
    (globalThis as { WebSocket?: unknown }).WebSocket = original;
    FakeWebSocket.reset();
  };
};
