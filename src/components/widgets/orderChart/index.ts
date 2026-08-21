// The panel is exported through its lazy boundary, so every consumer gets the
// code-split version and no import can accidentally pull `lightweight-charts`
// back into the initial chunk.
export { default as OrderChart } from "./LazyOrderChart";
