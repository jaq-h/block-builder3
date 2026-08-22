import type { LineData, UTCTimestamp } from "lightweight-charts";

// =============================================================================
// OVERLAY INDICATOR - the shape every indicator on the price pane has
// =============================================================================
//
// An indicator is a *pure function of the candles* plus the presentation the
// chart needs to draw it. Nothing here knows about React, about the chart
// instance, or about the price scale - which is what keeps an indicator
// testable against a published series rather than against a screenshot, and
// what makes it independent of whether the pane is linear or logarithmic.
//
// Adding one is two steps and no wiring: write the pure `compute`, then add an
// entry to `OVERLAY_INDICATORS` in `registry.ts`. The toolbar renders itself
// from that list and `useIndicatorSeries` creates, feeds and disposes the line
// series for whatever is in it.

/**
 * The only part of a candle an overlay indicator is allowed to read.
 *
 * Deliberately narrower than `CandlestickData`: a moving average is defined on
 * the close, and a signature that accepted the whole candle would invite the
 * next indicator to reach for `open`/`high`/`low` inconsistently. An indicator
 * that genuinely needs the range (an ATR, a Bollinger band) widens this type
 * once, for everybody.
 */
export interface IndicatorCandle {
  time: UTCTimestamp;
  close: number;
}

export interface OverlayIndicator {
  /** Stable identity, used as the React key and the enabled-set member. */
  id: string;
  /** Toolbar button text. Short, because the toolbar is narrow. */
  label: string;
  /**
   * Spelled out for the accessible name. The label is an abbreviation, and
   * "SMA 20" read aloud is not a description of anything. The button's name is
   * `label: description`, so the visible text stays inside it rather than being
   * replaced by it: WCAG 2.5.3 Label in Name, which is what lets someone
   * driving the app by voice say the words they can see.
   */
  description: string;
  /** A token from `src/styles/theme.ts`. Never a literal colour. */
  color: string;
  /** Pure. Same candles in, same line out, on any price scale. */
  compute: (candles: readonly IndicatorCandle[]) => LineData<UTCTimestamp>[];
}
