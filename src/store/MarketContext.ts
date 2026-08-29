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
import type { Market } from "../types/markets";
import {
  pendingPriceFormat,
  type PriceFormatReadiness,
} from "../utils/priceFormatReadiness";
import { DEFAULT_MARKET, MARKETS } from "../data/markets";

export interface MarketContextValue {
  /** The pair the user selected. */
  market: Market;
  /**
   * Whether this pair's prices can be written yet, and at what precision.
   *
   * The one answer every price-rendering surface reads. Kraken's rules reach a
   * caller only through this value, and the two facts it is derived from - the
   * precision-or-null and whether the request has answered - are deliberately
   * **not** on this context. They were, and six surfaces recombined them into
   * six independent judgements; see `utils/priceFormatReadiness.ts` for what
   * that cost and `priceFormatReadiness.test.ts` for what stops it returning.
   */
  priceFormat: PriceFormatReadiness;
  /** Every pair the selector offers. */
  markets: readonly Market[];
  /**
   * Select a pair by its WebSocket v2 symbol.
   *
   * Returns whether the catalogue holds it. A caller that only wants the
   * selection changed can ignore the answer; a caller that goes on to act as
   * though the pair is now selected - rehydrating a saved strategy priced
   * against it, say - must not, because a symbol we do not ship leaves the
   * previous selection in place.
   */
  selectMarket: (symbol: string) => boolean;
  /**
   * Why the *batch* could not be loaded, if it could not.
   *
   * **Not a readiness signal, and never to be read as one.** A batch that
   * answers without one pair reports no error at all while that pair has no
   * rules, and a request that fails after an earlier one succeeded reports an
   * error over pairs whose rules are in hand - so this is wrong in both
   * directions as a test of whether a price can be drawn. `priceFormat` is that
   * test. This is the load failure, for a surface that wants to say what went
   * wrong rather than whether anything did.
   */
  metadataError: string | null;
}

/**
 * The value a consumer outside a provider sees.
 *
 * It is a real default rather than a thrown error because these consumers are
 * grid components that render prices, and half the component tests mount them
 * on their own. The readiness is `pending` here exactly as it is before the
 * metadata lands, so the no-provider case exercises the same "not known yet"
 * branch the running app does rather than a special one.
 */
const DEFAULT_CONTEXT: MarketContextValue = {
  market: DEFAULT_MARKET,
  priceFormat: pendingPriceFormat(DEFAULT_MARKET),
  markets: MARKETS,
  selectMarket: () => false,
  metadataError: null,
};

export const MarketContext = createContext<MarketContextValue>(DEFAULT_CONTEXT);
