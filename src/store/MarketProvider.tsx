import { useEffect, useState, type FC, type ReactNode } from "react";
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

  useEffect(() => {
    let cancelled = false;

    fetchMarketPrecisions(MARKETS)
      .then((loaded) => {
        if (cancelled) return;
        setPrecisions(loaded);
        setMetadataError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMetadataError(
          error instanceof Error
            ? error.message
            : "Could not load market precision from Kraken",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const precision = precisions.get(market.symbol) ?? null;

  const value: MarketContextValue = {
    market,
    precision,
    activeMarket: { market, precision },
    markets: MARKETS,
    // An unknown symbol leaves the selection alone. The selector can only offer
    // what the catalogue holds, so reaching this means something went wrong
    // somewhere else, and switching to a pair with no metadata would be the
    // worse answer.
    selectMarket: (symbol: string) => {
      const next = findMarket(symbol);
      if (next) setMarket(next);
    },
    metadataError,
  };

  return (
    <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
  );
};

export default MarketProvider;
