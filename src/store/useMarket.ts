import { useContext } from "react";
import { MarketContext, type MarketContextValue } from "./MarketContext";

/**
 * The pair the app is trading, and Kraken's rules for it.
 *
 * Every module that needs a symbol asks for it here rather than naming one.
 * That is the whole point: a component that names its own pair is a component
 * that can show a price for a market the user is not looking at.
 */
export const useMarket = (): MarketContextValue => useContext(MarketContext);
