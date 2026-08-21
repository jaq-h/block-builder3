// The public and private sockets keep separate reconnect state. Proving that
// needs the server to report live trading, which needs module mocks, which are
// file-scoped - hence a second file rather than another `describe` in
// `krakenWebSocket.test.ts`.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./tradingMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tradingMode")>()),
  isLiveTradingAvailable: () => true,
}));

vi.mock("./krakenServer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./krakenServer")>()),
  getWebSocketToken: async () => "test-token",
}));

import { KrakenWebSocketManager } from "./krakenWebSocket";
import { FakeWebSocket, installFakeWebSocket } from "@/test/fakeWebSocket";

const PUBLIC_URL = "wss://ws.kraken.com/v2";
const PRIVATE_URL = "wss://ws-auth.kraken.com/v2";

let uninstall: () => void;
let manager: KrakenWebSocketManager;

beforeEach(() => {
  uninstall = installFakeWebSocket();
  vi.useFakeTimers();
  manager = new KrakenWebSocketManager();
});

afterEach(() => {
  vi.useRealTimers();
  uninstall();
});

const socketsFor = (url: string) =>
  FakeWebSocket.instances.filter((s) => s.url === url);

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("KrakenWebSocketManager - per-socket reconnect state", () => {
  it("does not spend the private socket's budget on public failures", async () => {
    const pub = manager.connectPublic();
    FakeWebSocket.last.openConnection();
    await pub;

    const priv = manager.connectPrivate();
    await flush();
    const privateSocket = socketsFor(PRIVATE_URL).at(-1)!;
    privateSocket.openConnection();
    await priv;

    expect(manager.getStatus().private).toBe("authenticated");

    // Burn four of the public socket's five attempts.
    for (const delay of [1000, 2000, 4000, 8000]) {
      socketsFor(PUBLIC_URL).at(-1)!.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(socketsFor(PUBLIC_URL)).toHaveLength(5);

    // The private socket now drops for the first time. With one shared counter
    // it would already be four attempts deep and wait 16s; with its own budget
    // it retries after 1s.
    const privateSocketsBefore = socketsFor(PRIVATE_URL).length;
    socketsFor(PRIVATE_URL).at(-1)!.dropConnection();
    await vi.advanceTimersByTimeAsync(1000);

    expect(socketsFor(PRIVATE_URL)).toHaveLength(privateSocketsBefore + 1);
  });

  it("does not reset the private backoff when the public socket reopens", async () => {
    const priv = manager.connectPrivate();
    await flush();
    socketsFor(PRIVATE_URL).at(-1)!.openConnection();
    await priv;

    // Burn all five private attempts.
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      socketsFor(PRIVATE_URL).at(-1)!.dropConnection();
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(socketsFor(PRIVATE_URL)).toHaveLength(6);

    // A healthy public connection must not hand the private socket a fresh
    // budget it has not earned.
    const pub = manager.connectPublic();
    socketsFor(PUBLIC_URL).at(-1)!.openConnection();
    await pub;

    socketsFor(PRIVATE_URL).at(-1)!.dropConnection();
    await vi.advanceTimersByTimeAsync(60000);

    expect(socketsFor(PRIVATE_URL)).toHaveLength(6);
    expect(manager.getStatus().private).toBe("error");
  });
});
