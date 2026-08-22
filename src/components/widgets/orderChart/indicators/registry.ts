import { colors } from "@styles/theme";
import {
  exponentialMovingAverage,
  simpleMovingAverage,
} from "./movingAverage";
import type { OverlayIndicator } from "./types";

// =============================================================================
// INDICATOR REGISTRY - the one list the chart draws from
// =============================================================================
//
// The toolbar, the line series and the enabled set are all derived from this
// array. There is no second list to keep in step: adding an entry here adds a
// button, a series and its lifecycle, and removing one removes all three.
//
// Colours are theme tokens. The three below are deliberately from different
// families so two averages on screen at once stay distinguishable, and none of
// them is the green/red the candles already use for direction.

export const OVERLAY_INDICATORS: readonly OverlayIndicator[] = [
  {
    id: "sma-20",
    label: "SMA 20",
    description: "20-period simple moving average",
    color: colors.accent.primary,
    compute: (candles) => simpleMovingAverage(candles, 20),
  },
  {
    id: "sma-50",
    label: "SMA 50",
    description: "50-period simple moving average",
    color: colors.conditional.text,
    compute: (candles) => simpleMovingAverage(candles, 50),
  },
  {
    id: "ema-20",
    label: "EMA 20",
    description: "20-period exponential moving average",
    color: colors.white.high,
    compute: (candles) => exponentialMovingAverage(candles, 20),
  },
] as const;
