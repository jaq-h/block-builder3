// Barrel export for all strategy assembly contexts

// Grid Data Context — business state (lowest frequency changes)
export { GridDataContext, useGridData } from "./GridDataContext";

// Drag Context — drag UI state (medium frequency changes)
export { DragContext, useDrag } from "./DragContext";

// Hover Context — hover UI state (highest frequency changes)
export { HoverContext, useHover } from "./HoverContext";

// Static Context — refs & immutable data (never changes after mount)
export { StaticContext, useStatic } from "./StaticContext";
