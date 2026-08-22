// =============================================================================
// MARKET CONTEXT - which pair the whole app is looking at
// =============================================================================
//
// One selected market for the app, not one per component. The grid, the price
// feed and the chart each used to name `"BTC/USD"` for themselves; with more
// than one market that is three places that can disagree, and two of them would
// be showing a price for a pair the user is not trading.
//
// The context definition lives apart from its provider so the provider file
// exports a component and nothing else - the same split `OrdersStoreContext.ts`
// makes, and what keeps react-refresh able to hot-reload both.

import { createContext } from "react";
import type { ActiveMarket, Market, MarketPrecision } from "../types/markets";
import { DEFAULT_MARKET, MARKETS } from "../data/markets";

export interface MarketContextValue {
  /** The pair the user selected. */
  market: Market;
  /** Kraken's rules for it, or `null` until the metadata request answers. */
  precision: MarketPrecision | null;
  /** The two above as one value, for anything that needs both. */
  activeMarket: ActiveMarket;
  /** Every pair the selector offers. */
  markets: readonly Market[];
  /** Select a pair by its WebSocket v2 symbol. An unknown symbol is ignored. */
  selectMarket: (symbol: string) => void;
  /** Why the metadata could not be loaded, if it could not. */
  metadataError: string | null;
}

/**
 * The value a consumer outside a provider sees.
 *
 * It is a real default rather than a thrown error because these consumers are
 * grid components that render prices, and half the component tests mount them
 * on their own. `precision` is `null` here exactly as it is before the metadata
 * lands, so the no-provider case exercises the same "not known yet" branch the
 * running app does rather than a special one.
 */
const DEFAULT_CONTEXT: MarketContextValue = {
  market: DEFAULT_MARKET,
  precision: null,
  activeMarket: { market: DEFAULT_MARKET, precision: null },
  markets: MARKETS,
  selectMarket: () => {},
  metadataError: null,
};

export const MarketContext = createContext<MarketContextValue>(DEFAULT_CONTEXT);
