import { PriceScaleMode } from "lightweight-charts";

import type { PriceScaleKind } from "./priceScale";

// =============================================================================
// THE ONE PLACE THE TWO VOCABULARIES MEET
// =============================================================================
//
// This is deliberately a module of its own rather than a function at the bottom
// of `priceScale.ts`, and the reason is the bundle rather than the code.
//
// `PriceScaleMode` is an enum, so importing it is a *value* import: whatever
// module names it pulls `lightweight-charts` in with it. `priceScale.ts` is
// reachable from `ChartHeader`, which the eager chunk renders as the placeholder
// while the chart chunk is still in flight - so a value import there would land
// the largest dependency in the app back in the initial payload and quietly undo
// the code split. See `AGENTS.md` under "The chart panel".
//
// Nothing outside the lazy chart chunk imports this file.

/** The library mode for a scale. */
export const priceScaleMode = (kind: PriceScaleKind): PriceScaleMode =>
  kind === "logarithmic" ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal;
