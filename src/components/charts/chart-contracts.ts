import type { ReactNode, Ref } from "react";
import type { Candle, Interval } from "@/lib/trading-types";
import type { ChartDrawingLayer, ChartProjection } from "@/lib/chart-drawing";
import type { ChartSyncBinding } from "@/lib/chart-sync";
import type { ChartView, ChartViewAction, ChartViewControls } from "@/lib/chart-types";
import type { ChartDisplaySettings } from "@/components/charts/useChartDisplay";

export type ChartLayerGeometry = {
  fullTime: (time: number) => string;
  timeZone: string;
  candles: Candle[];
  x: (index: number) => number;
  y: (price: number) => number;
  plotWidth: number;
};
export type ChartLayers = {
  zones?: (geometry: ChartLayerGeometry) => ReactNode;
  levels?: (geometry: ChartLayerGeometry) => ReactNode;
  overlays?: (geometry: ChartLayerGeometry) => ReactNode;
};
export type ChartFooterContext = {
  current?: Candle;
  timeZone: string;
  priceScale: ChartDisplaySettings["priceScale"];
  requestedPriceScale: ChartDisplaySettings["priceScale"];
  fullTime: (time: number) => string;
  changeDisplay: (settings: ChartDisplaySettings) => void;
};
export type ChartControlsContext = {
  settings: ChartDisplaySettings;
  timeZone: string;
  logarithmicAvailable: boolean;
  automatic: boolean;
  ratioLocked: boolean;
  changeDisplay: (settings: ChartDisplaySettings) => void;
  toggleAutomatic: () => void;
  toggleRatio: () => void;
  reset: () => void;
  zoom: (factor: number) => void;
  pan: (direction: -1 | 1) => void;
};
export type CandlestickChartProps = {
  mode: "market" | "replay";
  frame?: "card" | "embedded";
  showCandles?: boolean;
  candles: Candle[];
  interval?: Interval;
  compact?: boolean;
  drawingLayer?: ChartDrawingLayer;
  savedView?: ChartView | null;
  focusTime?: number;
  // Optional workspace clock: replay follows the newest bar at its user-positioned horizontal anchor.
  replayCursor?: number;
  onViewChange?: (view: ChartView) => void;
  onViewAction?: (action: ChartViewAction) => void;
  pending?: boolean;
  controlsRef?: Ref<ChartViewControls>;
  chartSync?: ChartSyncBinding;
  historyRetryAt?: number | null;
  hasEarlier?: boolean;
  loadingHistory?: boolean;
  onLoadEarlier?: () => void;
  timeZoneOverride?: string;
  layers?: ChartLayers;
  renderHeader?: (current: Candle | undefined, ref: Ref<HTMLDivElement>) => ReactNode;
  renderPriceMarker?: (projection: ChartProjection) => ReactNode;
  // Adapter-owned interactive trade levels. The renderer never executes trades.
  renderTradeLevels?: (projection: ChartProjection) => ReactNode;
  renderFooter?: (context: ChartFooterContext) => ReactNode;
  // Optional alternate chrome. Data, geometry, and default workspaces are unchanged.
  renderControls?: (context: ChartControlsContext) => ReactNode;
};
export type ChartAdapterProps = Omit<CandlestickChartProps, "mode">;
