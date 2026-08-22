import { useEffect, useState } from "react";
import { recordMount, recordUnmount } from "./mountTracker";
import { useMarket } from "@store/useMarket";
import type { OrderConfig } from "@/types/grid";

const useMountTally = (name: string): void => {
  useEffect(() => {
    recordMount(name);
    return () => recordUnmount(name);
  }, [name]);
};

/**
 * Stand-in panels that count their own mounts and hold a scrap of state, so a
 * test can put something in one and check it is still there later. Losing that
 * state is the user-facing bug these stubs exist to catch.
 */
export const AssemblyPanelStub = () => {
  const [draft, setDraft] = useState("");
  useMountTally("assembly");

  return (
    <div data-testid="assembly-panel">
      <label htmlFor="assembly-draft">assembly draft</label>
      <input
        id="assembly-draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </div>
  );
};

export const OrdersPanelStub = () => {
  const [draft, setDraft] = useState("");
  useMountTally("orders");

  return (
    <div data-testid="orders-panel">
      <label htmlFor="orders-draft">orders draft</label>
      <input
        id="orders-draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </div>
  );
};

/**
 * An assembly panel that can drive the market selection and a submission.
 *
 * The real panel owns both - the market selector is a row inside it, and
 * Execute Trade is on its action bar - so a test about what happens to a
 * *submitted* strategy needs a stand-in that can do the same two things
 * without mounting the grid.
 */
export const MarketAssemblyPanelStub = ({
  onConfigChange,
  onExecute,
}: {
  onConfigChange: (config: OrderConfig) => void;
  onExecute: () => void;
}) => {
  const { market, selectMarket } = useMarket();
  useMountTally("assembly");

  return (
    <div data-testid="assembly-panel">
      <span data-testid="selected-market">{market.symbol}</span>
      <button type="button" onClick={() => selectMarket("ARB/USD")}>
        pick arb
      </button>
      <button type="button" onClick={() => selectMarket("BTC/USD")}>
        pick btc
      </button>
      <button
        type="button"
        onClick={() =>
          onConfigChange({
            "sa-limit-limit-1": {
              col: 0,
              row: 1,
              type: "limit",
              axis: 2,
              yPosition: 25,
              direction: "upside",
            },
          })
        }
      >
        build a strategy
      </button>
      <button type="button" onClick={onExecute}>
        execute
      </button>
    </div>
  );
};
