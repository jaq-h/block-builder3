import { PriceScaleMode } from "lightweight-charts";

// =============================================================================
// PRICE SCALE - what the logarithmic option is, and what it deliberately is not
// =============================================================================
//
// It changes ONE thing: how the chart's own price axis maps a price to a pixel
// inside the chart pane. It does not change any price.
//
// That distinction is the whole safety argument for shipping this option in a
// codebase that has spent two days deleting "one fact derived two ways"
// defects. The grid and the chart share exactly one fact - the price a block
// represents - and both take it from `priceAtOffset` through `calculatePrice`
// (see `orderPriceLines.ts`). A price line is placed by handing that price to
// the chart, which converts it with whichever mode is set here; the candle at
// that price converts identically, so a line still lands exactly on the level
// it names under either mode.
//
// They share no coordinate space: the grid's axis is a 0-50% control track
// inside a ~220px cell, the chart's is a price axis over the visible candle
// range in a separate panel of a different height. Nothing outside this widget
// reads a chart coordinate, and nothing inside it converts a pixel back into a
// price. So there is no second derivation for a logarithmic mapping to break.

export type PriceScaleKind = "linear" | "logarithmic";

export interface PriceScaleOption {
  kind: PriceScaleKind;
  /** Button text. */
  label: string;
  /** Accessible name - "Log" is not a description of anything. */
  description: string;
}

export const PRICE_SCALE_OPTIONS: readonly PriceScaleOption[] = [
  {
    kind: "linear",
    label: "Linear",
    description: "Linear price scale",
  },
  {
    kind: "logarithmic",
    label: "Log",
    description: "Logarithmic price scale",
  },
] as const;

export const DEFAULT_PRICE_SCALE: PriceScaleKind = "linear";

/** The library mode for a scale. The only place the two vocabularies meet. */
export const priceScaleMode = (kind: PriceScaleKind): PriceScaleMode =>
  kind === "logarithmic" ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal;
