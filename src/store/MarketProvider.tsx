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
// request is retried a bounded number of times, asked again whenever the user
// selects a pair while nothing at all has loaded - including the pair already
// selected, which is a React bail-out and so cannot be caught by watching the
// selection - and asked again when the tab regains focus or the browser comes
// back online. There is deliberately no retry button: a control invented to
// work around a transient network failure is a product surface that then has to
// exist forever.

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
  /**
   * Which chain is the live one. Every start below takes the next number, so a
   * chain can ask whether something newer has replaced it since.
   *
   * Its one real job is the armed retry, because that is the only place a
   * superseded chain can still act. Recovery makes two chains at once ordinary:
   * a failure arms a backoff, and a focus, an `online` event or a selection can
   * start a fresh chain before that timer fires. `retryTimer` is a single slot
   * and cannot hold both, so the second arming overwrites the first handle
   * without clearing it and neither a success nor an unmount can reach the
   * orphan. Comparing this number at the moment the timer fires is what retires
   * it instead - a chain that is no longer current does not ask again, and the
   * chain that replaced it owns the retry from there.
   *
   * Left unretired, that orphan fired against a provider that already held a
   * complete set of rules, asked Kraken for them again, and on failure wrote
   * `metadataError` over the populated map - which put recovery back on and had
   * every later tab switch and selection re-request an answer already in hand.
   */
  generation: { current: number };
  /** The request in flight, so an unmounting provider can abandon it. */
  request: { current: AbortController | null };
  onLoaded: (precisions: Map<string, MarketPrecision>) => void;
  onFailed: (message: string) => void;
}

const loadPrecisions = (handles: LoadHandles, attempt = 1): void => {
  if (handles.cancelled.current || handles.inFlight.current) return;
  handles.inFlight.current = true;

  const generation = ++handles.generation.current;
  const controller = new AbortController();
  handles.request.current = controller;

  /**
   * Whether this attempt's answer is still wanted. The in-flight guard above
   * means no other chain can have started while this one was running, so today
   * only the cancelled flag can be false here; the generation is compared for
   * the case the settle path ever stops being mutually exclusive with a start.
   */
  const current = () =>
    !handles.cancelled.current && generation === handles.generation.current;

  fetchMarketPrecisions(MARKETS, controller.signal)
    .then((loaded) => {
      handles.inFlight.current = false;
      if (!current()) return;
      handles.request.current = null;

      // Drop this chain's own pending retry, if it still holds the slot. This
      // is a tidy-up rather than the guarantee: the slot holds at most one
      // timer, so an answer cannot reach a retry some other chain armed. What
      // stops that one is the generation check in the timer itself.
      if (handles.retryTimer.current) {
        clearTimeout(handles.retryTimer.current);
        handles.retryTimer.current = null;
      }

      handles.onLoaded(loaded);
    })
    .catch((error: unknown) => {
      handles.inFlight.current = false;
      if (!current()) return;
      handles.request.current = null;

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
        // Only the live chain may continue. Anything newer - a focus, an
        // `online` event, a selection - has taken over the job of getting an
        // answer, and it carries its own bounded backoff.
        if (generation !== handles.generation.current) return;
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
  const [metadataSettled, setMetadataSettled] = useState(false);

  // Nothing may set state after unmount, and no second request may start while
  // one is in flight - otherwise switching pair during a slow retry stampedes
  // the endpoint with a request per click.
  const cancelledRef = useRef(false);
  const inFlightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);

  // `useState` setters are stable, so these handles are built once and stay
  // valid for the life of the provider.
  const handlesRef = useRef<LoadHandles>({
    cancelled: cancelledRef,
    inFlight: inFlightRef,
    retryTimer: retryTimerRef,
    generation: generationRef,
    request: requestRef,
    onLoaded: (loaded) => {
      setPrecisions(loaded);
      setMetadataError(null);
      setMetadataSettled(true);
    },
    onFailed: (message) => {
      setMetadataError(message);
      setMetadataSettled(true);
    },
  });

  useEffect(() => {
    const handles = handlesRef.current;
    handles.cancelled.current = false;
    loadPrecisions(handles);

    return () => {
      handles.cancelled.current = true;
      // The cancelled flag stops the answer being written; this stops the
      // request being made at all, so an unmounted provider leaves nothing on
      // the wire waiting out its own timeout.
      handles.request.current?.abort();
      handles.request.current = null;
      if (handles.retryTimer.current) {
        clearTimeout(handles.retryTimer.current);
        handles.retryTimer.current = null;
      }
    };
  }, []);

  // Whether asking again could still change the answer. Keyed on the request
  // rather than on the map being empty: Kraken answering 200 for a catalogue it
  // describes none of resolves normally, so an empty map is a settled answer
  // too - and gating on its size left the listeners and `selectMarket` asking
  // once per tab switch and once per selection, for the rest of the session,
  // for an answer that will not change. It is the same rule `selectMarket`
  // states below for a single absent pair, applied to the whole batch.
  const needsMetadata = !metadataSettled || metadataError !== null;

  // The two moments the environment has actually changed rather than the user
  // merely waiting: the tab comes back to the front, and the browser regains
  // connectivity. Both are worth spending a request on, and neither is worth
  // one once the request has answered - so the listeners exist only while it
  // has not, or answered with a failure. Each retry starts its own bounded
  // chain; the in-flight flag is what stops a burst of events from stampeding
  // the endpoint.
  useEffect(() => {
    if (needsMetadata === false) return;

    const handles = handlesRef.current;
    const retry = () => loadPrecisions(handles);

    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
    };
  }, [needsMetadata]);

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

      // Choosing a pair is the clearest signal that the user wants to trade it,
      // so it is the natural moment to ask again after the retries ran out.
      // Asked here rather than from an effect keyed on the selection, because
      // choosing the pair that is *already* selected is a React bail-out - and
      // the user stuck on the pair they actually want is precisely the one with
      // no other way back. Keyed on the request never having answered, not on
      // this pair being absent: a batch that answered without a given pair
      // answered - Kraken does not list it, and asking again returns the same
      // answer.
      if (needsMetadata) loadPrecisions(handlesRef.current);
      return true;
    },
    metadataError,
    metadataSettled,
  };

  return (
    <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
  );
};

export default MarketProvider;
