import type { FC } from "react";
import { useMarket } from "../../store/useMarket";
import { formatMarketPrice } from "../../utils/marketFormat";
import {
  marketSelectorRow,
  marketSelectorLabel,
  marketSelect,
  marketSelectWrapper,
  marketSelectChevron,
  marketPriceReadout,
  marketMetadataWarning,
} from "./MarketSelector.styles";

// =============================================================================
// MARKET SELECTOR - which pair the app is trading
// =============================================================================
//
// A native `<select>` on purpose. It is the one control that is already
// keyboard operable everywhere, already announces its own value change, and
// already opens as the platform's own picker on a phone - none of which a
// styled listbox gets without reimplementing it. The accessible name comes from
// a real `<label htmlFor>` rather than an `aria-label`, so it is visible as well
// as announced.
//
// The change itself needs no live-region announcement of its own: a `<select>`
// speaks its new value when it changes. What is *not* conveyed that way is the
// consequence - every block on the grid re-prices against a different market -
// and that sentence belongs to the grid's own announcer, which is the single
// owner of everything the grid says. `GridArea` reports it; nothing here
// announces, because a second announcer is exactly what
// `src/utils/gridAnnouncements.ts` exists to prevent.

interface MarketSelectorProps {
  /** The market price to show beside the selector, if one has loaded. */
  currentPrice: number | null;
  /** Set when the price feed is failing, so the readout can say so. */
  priceError?: string | null;
}

const MarketSelector: FC<MarketSelectorProps> = ({
  currentPrice,
  priceError,
}) => {
  const { market, markets, activeMarket, selectMarket, metadataError } =
    useMarket();

  return (
    <div className={marketSelectorRow}>
      <label className={marketSelectorLabel} htmlFor="market-selector">
        Market
      </label>

      <span className={marketSelectWrapper}>
        <select
          id="market-selector"
          className={marketSelect}
          value={market.symbol}
          onChange={(event) => selectMarket(event.target.value)}
        >
          {markets.map((option) => (
            <option key={option.symbol} value={option.symbol}>
              {option.name} ({option.symbol})
            </option>
          ))}
        </select>
        {/* Decorative: the select's own arrow is hidden so the control can be
            themed, and this replaces it. The select above owns the semantics. */}
        <span className={marketSelectChevron} aria-hidden="true">
          ▾
        </span>
      </span>

      <span className={marketPriceReadout}>
        {priceError
          ? "Price unavailable"
          : currentPrice === null
            ? "Loading price…"
            : formatMarketPrice(currentPrice, activeMarket)}
      </span>

      {/* Without Kraken's rules for the pair no order can be priced, and the
          Execute path refuses rather than guessing. Say so here as well, so the
          refusal is not the first the user hears of it. */}
      {metadataError && (
        <span className={marketMetadataWarning} role="status">
          Precision rules unavailable - orders cannot be submitted
        </span>
      )}
    </div>
  );
};

export default MarketSelector;
