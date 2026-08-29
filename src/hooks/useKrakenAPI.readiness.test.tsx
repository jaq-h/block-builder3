// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

import { useKrakenAPI } from "./useKrakenAPI";
import { MarketProvider } from "@store/MarketProvider";
import { addBlocksToCell } from "@utils/blockMapping";
import { clearGrid } from "@utils/grid";
import { resetTradingMode, resetWebSocketManager, STATUS_ENDPOINT } from "@/api";
import { KRAKEN_ASSET_PAIRS_RESPONSE } from "@/test/marketFixtures";
import type { BlockData, GridData } from "@/types/grid";

// =============================================================================
// THE ORDER PATH CONSUMES THE READINESS, IN BOTH UNREADY STATES
// =============================================================================
//
// `useKrakenAPI` is the sixth price-formatting surface, and the only one that
// does not draw: it builds the Kraken payload. It has nothing different to do
// in `pending` and in `unavailable` - a payload cannot be formatted without the
// pair's rules either way - so it takes `precisionOf` rather than reading the
// status. That is exactly why it needs pinning from the outside: a surface that
// collapses the two states legitimately is the one whose refusal would still
// look right if it had gone back to deciding readiness for itself.
//
// So each case here drives the REAL provider through a REAL AssetPairs
// response, and asserts what the user gets: an order set, or a refusal and no
// orders. Nothing stamps a readiness by hand.

const limit: BlockData = {
  id: "b1",
  orderType: "limit",
  label: "Limit",
  abrv: "Lmt",
  allowedRows: [0, 1, 2],
  axis: 2,
  yPosition: 25,
  direction: "downside",
  axes: ["limit"],
};

const gridWithOneLimit = (): GridData =>
  addBlocksToCell(clearGrid(2, 3), { col: 0, row: 1 }, [limit], "bulk");

const tickerBody = (krakenPair: string, last: string) => ({
  error: [],
  result: {
    [krakenPair]: {
      a: [last, "1", "1"],
      b: [last, "1", "1"],
      c: [last, "0.1"],
      v: ["1", "1"],
      p: [last, last],
      t: [1, 1],
      l: [last, last],
      h: [last, last],
      o: last,
    },
  },
});

/**
 * Kraken's AssetPairs answer, held until the test releases it.
 *
 * Holding it is the only way to observe `pending` from the outside: it is the
 * window between mount and the catalogue landing, and it is the state that used
 * to be collapsed into "no rules for this pair".
 */
const deferredAssetPairs = () => {
  let release: (body: unknown) => void;
  const answered = new Promise<unknown>((resolve) => {
    release = resolve;
  });

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes(STATUS_ENDPOINT)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          mode: "simulation",
          liveAvailable: false,
          errors: [],
        }),
      } as Response;
    }

    if (url.includes("/0/public/AssetPairs")) {
      const body = await answered;
      return { ok: true, status: 200, json: async () => body } as Response;
    }

    const pair = new URL(url, "http://localhost").searchParams.get("pair")!;
    return {
      ok: true,
      status: 200,
      json: async () => tickerBody(pair, "50000.0"),
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    answerWith: async (body: unknown) => {
      await act(async () => {
        release(body);
        await Promise.resolve();
      });
    },
  };
};

/** Asks the hook to build a payload on click, and reports what came back. */
const Probe = () => {
  const { prepareOrdersFromGrid, orderError, currentPrice } = useKrakenAPI({
    autoConnect: false,
    pollInterval: 0,
  });

  return (
    <div>
      <span data-testid="price">{currentPrice ?? "none"}</span>
      <span data-testid="error">{orderError ?? "none"}</span>
      <span data-testid="orders" />
      <button
        type="button"
        onClick={(event) => {
          const orders = prepareOrdersFromGrid(gridWithOneLimit(), "0.001");
          const readout = event.currentTarget.parentElement!.querySelector(
            '[data-testid="orders"]',
          )!;
          readout.textContent = orders
            .map((order) => `${order.symbol} ${order.order_type}@${order.limit_price ?? "-"}`)
            .join(",");
        }}
      >
        prepare
      </button>
    </div>
  );
};

const mountAndPrice = async () => {
  render(
    <MarketProvider>
      <Probe />
    </MarketProvider>,
  );

  // Every offset is relative to the market price, so the refusal under test is
  // only reached once there is one - otherwise the "no price yet" refusal fires
  // first and the test would pass for the wrong reason.
  await waitFor(() =>
    expect(screen.getByTestId("price")).toHaveTextContent("50000"),
  );
};

const prepare = async () => {
  await act(async () => {
    screen.getByRole("button", { name: "prepare" }).click();
  });
};

beforeEach(() => {
  resetTradingMode();
  resetWebSocketManager();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTradingMode();
  resetWebSocketManager();
});

describe("the order path in each readiness state", () => {
  it("refuses to build a payload while the rules are still in flight", async () => {
    deferredAssetPairs();
    await mountAndPrice();

    await prepare();

    expect(screen.getByTestId("orders")).toHaveTextContent("");
    expect(screen.getByTestId("error")).toHaveTextContent(
      "Cannot prepare orders: Kraken's precision rules for BTC/USD have not loaded yet.",
    );
  });

  it("refuses once the answer describes no rules for the pair", async () => {
    const assetPairs = deferredAssetPairs();
    await mountAndPrice();

    await assetPairs.answerWith({ error: [], result: {} });
    await prepare();

    expect(screen.getByTestId("orders")).toHaveTextContent("");
    expect(screen.getByTestId("error")).toHaveTextContent(
      "Cannot prepare orders: Kraken's precision rules for BTC/USD have not loaded yet.",
    );
  });

  it("builds the payload at the pair's own precision once the rules land", async () => {
    const assetPairs = deferredAssetPairs();
    await mountAndPrice();

    await assetPairs.answerWith(KRAKEN_ASSET_PAIRS_RESPONSE);
    await prepare();

    // BTC prices to one decimal, and 25% below $50,000 is $37,500.
    expect(screen.getByTestId("orders")).toHaveTextContent("BTC/USD limit@37500.0");
    expect(screen.getByTestId("error")).toHaveTextContent("none");
  });
});
