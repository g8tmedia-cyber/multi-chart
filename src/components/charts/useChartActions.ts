import { useImperativeHandle, type Ref } from "react";
import type { Candle } from "@/lib/trading-types";
import type { ChartDrawingLayer } from "@/lib/chart-drawing";
import type { ChartView, ChartViewControls } from "@/lib/chart-types";
import { defaultChartCount } from "@/lib/chart-geometry";
import { automaticPriceRange, validPriceRange } from "@/lib/chart-price-scale";
import { priceToBarRatio } from "@/lib/chart-price-ratio";
import type { ChartDisplaySettings } from "@/components/charts/useChartDisplay";
import type { ChartInteractionState } from "@/components/charts/useChartInteractionState";
import type { ChartPriceScale } from "@/components/charts/useChartPriceScale";
import type { ChartViewport } from "@/components/charts/useChartViewport";
import type { ChartActionObserver } from "@/components/charts/useChartActionObserver";
import type { useChartSynchronization } from "@/components/charts/useChartSynchronization";

type Props = {
  candles: Candle[];
  marketView: boolean;
  drawingLayer?: ChartDrawingLayer;
  controlsRef?: Ref<ChartViewControls>;
  persistedView: ChartView;
  actionObserver: ChartActionObserver;
  onViewChange?: (view: ChartView) => void;
  plotWidth: number;
  top: number;
  priceBottom: number;
  price: ChartPriceScale;
  viewport: ChartViewport;
  interaction: ChartInteractionState;
  synchronize: ReturnType<typeof useChartSynchronization>;
};

// Explicit controls reuse the same state owners as gestures.
export function useChartActions({
  candles,
  marketView,
  drawingLayer,
  controlsRef,
  persistedView,
  actionObserver,
  onViewChange,
  plotWidth,
  top,
  priceBottom,
  price,
  viewport,
  interaction,
  synchronize,
}: Props) {
  const { range, rangeRef, setRange, following, zoomRange, visible } = viewport;
  const {
    settings,
    changeSettings,
    logarithmicAvailable,
    timeZone,
    priceScale,
    manualPrice,
    setManualPrice,
    priceRef,
    priceRatio,
    low,
    high,
  } = price;
  const { min, max } = priceRatio.bounds;
  const automatic = !price.activeManualPrice && !priceRatio.locked;
  const { setPointer } = interaction;
  const changeDisplay = (next: ChartDisplaySettings) => {
    const nextMode =
      next.priceScale === "log" && logarithmicAvailable ? "log" : "linear";
    const currentPrice = priceRatio.locked ? priceRef.current : manualPrice;
    const nextPrice =
      currentPrice && validPriceRange(currentPrice, nextMode)
        ? currentPrice
        : null;
    if (nextMode !== priceScale) interaction.clear(drawingLayer);
    const nextAutomatic = automaticPriceRange(
      visible.length ? low : nextMode === "log" ? 1 : 0,
      visible.length ? high : nextMode === "log" ? 10 : 1,
      nextMode,
    );
    const nextRatio = priceRatio.locked
      ? priceToBarRatio(
          nextPrice ?? nextAutomatic,
          nextMode,
          range.count,
          plotWidth,
          priceBottom - top,
        )
      : null;
    setManualPrice(nextPrice);
    changeSettings(next);
    onViewChange?.({
      ...persistedView,
      min: nextPrice?.min ?? null,
      max: nextPrice?.max ?? null,
      timeZone: next.timeZone,
      priceScale: nextMode,
      priceBarRatio: nextRatio ?? undefined,
    });
  };
  const restoreAutomatic = () => {
    priceRatio.autoScale();
    onViewChange?.({
      ...persistedView,
      min: null,
      max: null,
      priceBarRatio: undefined,
    });
  };
  const toggleAutomatic = () => {
    if (!automatic) {
      restoreAutomatic();
      return;
    }
    priceRatio.release();
    onViewChange?.({ ...persistedView, min, max, priceBarRatio: undefined });
  };
  const toggleRatio = () => {
    const ratio = priceRatio.toggle();
    onViewChange?.({
      ...persistedView,
      min,
      max,
      priceBarRatio: ratio ?? undefined,
    });
  };
  const reset = () => {
    synchronize.interact();
    synchronize.leave();
    following.current = !marketView;
    setRange({
      right: candles.length + 6,
      count: defaultChartCount(candles.length, marketView),
    });
    priceRatio.autoScale();
    setPointer(null);
  };
  const zoom = (factor: number) => {
    synchronize.interact();
    following.current = false;
    const next = zoomRange(
      rangeRef.current,
      factor,
      0.7,
      candles.length,
      Boolean(drawingLayer),
    );
    priceRatio.scaleTo(next.count);
    setRange(next);
  };
  const observed = {
    automatic,
    changeDisplay: (next: ChartDisplaySettings) => actionObserver.run(changeDisplay, next),
    restoreAutomatic: () => actionObserver.run(restoreAutomatic),
    toggleAutomatic: () => actionObserver.run(toggleAutomatic),
    toggleRatio: () => actionObserver.run(toggleRatio),
    reset: () => actionObserver.run(reset),
    zoom: (factor: number) => actionObserver.run(zoom, factor),
  };
  useImperativeHandle(controlsRef, () => ({
    getView: () => ({ ...persistedView }),
    resetView: observed.reset,
    zoom: observed.zoom,
    toggleLogScale: () => {
      if (logarithmicAvailable || settings.priceScale === "log")
        observed.changeDisplay({ timeZone, priceScale: settings.priceScale === "log" ? "linear" : "log" });
    },
    restoreView: (view) => {
      if (!Number.isFinite(view.right) || !Number.isFinite(view.count) || view.count <= 0) return;
      actionObserver.clear(); interaction.clear(drawingLayer); viewport.applyPanOffset(0);
      following.current = false;
      const mode = view.priceScale === "log" && logarithmicAvailable ? "log" : "linear";
      changeSettings({ timeZone: view.timeZone ?? timeZone, priceScale: mode });
      priceRatio.restore({ ...view, priceScale: mode });
      const bounds = view.min !== null && view.max !== null ? { min: view.min, max: view.max } : null;
      setManualPrice(bounds && validPriceRange(bounds, mode) ? bounds : null);
      if (bounds && validPriceRange(bounds, mode)) priceRef.current = bounds;
      setRange(viewport.clampRange({ right: candles.length + view.right, count: view.count }, candles.length, Boolean(drawingLayer)));
      onViewChange?.(view);
    },
  }));
  return observed;
}
