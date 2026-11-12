import type { PriceRange, PriceScaleMode } from "@/lib/chart-price-scale";

// Wire-compatible chart geometry shared by Markets, replay and drawing tools.
// Persisted field names and optional legacy display values intentionally stay unchanged.
export type ChartPoint = { time: number; price: number };
export type ChartView = {
  right: number;
  count: number;
  min: number | null;
  max: number | null;
  timeZone?: string;
  priceScale?: PriceScaleMode;
  priceBarRatio?: number;
};
export type ChartPixelPoint = { x: number; y: number };
export type ChartDrag = {
  mode: "pan" | "price" | "time";
  x: number;
  y: number;
  right: number;
  count: number;
  price: PriceRange;
  verticalPan: boolean;
  distance?: number;
};
export type ChartViewAction = { before: ChartView; after: ChartView; kind: "gesture" | "wheel" | "keyboard" | "control" };
export type ChartViewControls = {
  resetView: () => void;
  zoom: (factor: number) => void;
  toggleLogScale: () => void;
  // Optional for older adapters; applying history does not create a new action.
  restoreView?: (view: ChartView) => void;
  /** Current rendered view, without waiting for the persistence debounce. */
  getView?: () => ChartView;
};
export type ChartOverlays = {
  fvg: boolean;
  sweep: boolean;
  structure: boolean;
  levels: boolean;
  swings?: boolean;
  equalHighs?: boolean;
  equalLows?: boolean;
};
export const defaultOverlays: ChartOverlays = {
  fvg: true,
  sweep: true,
  structure: true,
  levels: true,
};
