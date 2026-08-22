import { useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { MarketContext, type MarketContextValue } from "./MarketContext";
import { DEFAULT_MARKET, MARKETS, findMarket } from "../data/markets";
import { fetchMarketPrecisions } from "../api/assetMetadata";
import type { Market, MarketPrecision } from "../types/markets";

// =============================================================================
// MARKET PROVIDER
// =============================================================================
//
// Holds the selected pair and the metadata Kraken publishes about all of them.
//
// The metadata is fetched once for the whole catalogue rather than per market,
// so switching pair re-prices the grid immediately instead of waiting on a
// round trip. It is fetched at all - rather than shipped as a table - because
// precision, tick size and the minimum order are Kraken's to change, and a
// stale table is a wrong table that looks right.
//
// When the fetch fails there is no precision for anything, and that is the
// honest state: the order path refuses to build a payload and says why, rather
// than pricing an ARB order to BTC's one decimal place and having the exchange
// reject it into silence.
//
// But honest is not the same as final. This metadata is a hard prerequisite for
// the entire order path, so a single dropped connection used to disable trading
// for the rest of the session with a page reload as the only way out. So the
// request is retried a bounded number of times, and asked again if the user
// selects a pair while nothing at all has loaded. There is deliberately no
// retry button: a control invented to work around a transient network failure
// is a product surface that then has to exist forever.

/** How many times the initial request is retried before it gives up. */
const MAX_ATTEMPTS = 3;

/** Backoff between attempts, in ms. One entry per retry after the first try. */
const RETRY_DELAYS_MS = [1_000, 3_000];

/**
 * What the loader below is allowed to touch. It lives outside the component so
 * a retry can call it by name: the same function expressed as a `useCallback`
 * would have to reach for itself from inside its own closure.
 */
interface LoadHandles {
  cancelled: { current: boolean };
  inFlight: { current: boolean };
  retryTimer: { current: ReturnType<typeof setTimeout> | null };
  onLoaded: (precisions: Map<string, MarketPrecision>) => void;
  onFailed: (message: string) => void;
}

const loadPrecisions = (handles: LoadHandles, attempt = 1): void => {
  if (handles.cancelled.current || handles.inFlight.current) return;
  handles.inFlight.current = true;

  fetchMarketPrecisions(MARKETS)
    .then((loaded) => {
      handles.inFlight.current = false;
      if (handles.cancelled.current) return;
      handles.onLoaded(loaded);
    })
    .catch((error: unknown) => {
      handles.inFlight.current = false;
      if (handles.cancelled.current) return;

      handles.onFailed(
        error instanceof Error
          ? error.message
          : "Could not load market precision from Kraken",
      );

      // Bounded: a pair Kraken has stopped listing, or a symbol typo in the
      // catalogue, fails identically every time, and retrying it forever would
      // be a request loop rather than a recovery.
      const delay = RETRY_DELAYS_MS[attempt - 1];
      if (attempt >= MAX_ATTEMPTS || delay === undefined) return;

      handles.retryTimer.current = setTimeout(() => {
        handles.retryTimer.current = null;
        loadPrecisions(handles, attempt + 1);
      }, delay);
    });
};

interface MarketProviderProps {
  children: ReactNode;
  /** Which market to open on. Only tests pass this. */
  initialMarket?: Market;
}

export const MarketProvider: FC<MarketProviderProps> = ({
  children,
  initialMarket = DEFAULT_MARKET,
}) => {
  const [market, setMarket] = useState<Market>(initialMarket);
  const [precisions, setPrecisions] = useState<Map<string, MarketPrecision>>(
    () => new Map(),
  );
  const [metadataError, setMetadataError] = useState<string | null>(null);

  // Nothing may set state after unmount, and no second request may start while
  // one is in flight - otherwise switching pair during a slow retry stampedes
  // the endpoint with a request per click.
  const cancelledRef = useRef(false);
  const inFlightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `useState` setters are stable, so these handles are built once and stay
  // valid for the life of the provider.
  const handlesRef = useRef<LoadHandles>({
    cancelled: cancelledRef,
    inFlight: inFlightRef,
    retryTimer: retryTimerRef,
    onLoaded: (loaded) => {
      setPrecisions(loaded);
      setMetadataError(null);
    },
    onFailed: setMetadataError,
  });

  useEffect(() => {
    const handles = handlesRef.current;
    handles.cancelled.current = false;
    loadPrecisions(handles);

    return () => {
      handles.cancelled.current = true;
      if (handles.retryTimer.current) {
        clearTimeout(handles.retryTimer.current);
        handles.retryTimer.current = null;
      }
    };
  }, []);

  // Choosing a pair is the clearest signal that the user wants to trade it, so
  // it is the natural moment to ask again after the retries ran out. Keyed on
  // having *nothing*, not on this pair being absent: a batch that answered
  // without a given pair answered - Kraken does not list it, and asking again
  // returns the same answer.
  useEffect(() => {
    if (precisions.size > 0) return;
    loadPrecisions(handlesRef.current);
  }, [market.symbol, precisions.size]);

  const precision = precisions.get(market.symbol) ?? null;

  const value: MarketContextValue = {
    market,
    precision,
    activeMarket: { market, precision },
    markets: MARKETS,
    // Reports whether it selected. A symbol the catalogue does not hold cannot
    // be selected, and a caller that acts on the selection - loading a saved
    // strategy priced against that pair, say - has to be able to tell, or it
    // reprices the strategy against whatever happened to be selected instead.
    selectMarket: (symbol: string) => {
      const next = findMarket(symbol);
      if (!next) return false;
      setMarket(next);
      return true;
    },
    metadataError,
  };

  return (
    <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
  );
};

export default MarketProvider;
