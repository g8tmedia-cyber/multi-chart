import { useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/trading-types";
import type { ChartView } from "@/lib/chart-types";
import {
  automaticPriceRange,
  validPriceRange,
  type PriceRange,
  type PriceScaleMode,
} from "@/lib/chart-price-scale";
import { useChartDisplay } from "@/components/charts/useChartDisplay";
import { usePriceToBarRatio } from "@/components/charts/usePriceToBarRatio";

type Props = {
  visible: Candle[];
  savedView?: ChartView | null;
  marketTimeZone?: string;
  hasDrawingLayer: boolean;
  count: number;
  width: number;
  height: number;
  autoTopSpace: number;
};

export function useChartPriceScale({
  visible,
  savedView,
  marketTimeZone,
  hasDrawingLayer,
  count,
  width,
  height,
  autoTopSpace,
}: Props) {
  const { settings, changeSettings } = useChartDisplay(savedView, marketTimeZone);
  const logarithmicAvailable = useMemo(
    () =>
      visible.every((candle) =>
        Number.isFinite(candle.low) && candle.low > 0,
      ),
    [visible],
  );
  const timeZone = settings.timeZone;
  const priceScale: PriceScaleMode =
    settings.priceScale === "log" && logarithmicAvailable ? "log" : "linear";
  const [manualPrice, setManualPrice] = useState<PriceRange | null>(
    savedView?.min != null && savedView?.max != null
      ? { min: savedView.min, max: savedView.max }
      : null,
  );
  const activeManualPrice =
    manualPrice && validPriceRange(manualPrice, priceScale)
      ? manualPrice
      : null;
  const priceRef = useRef<PriceRange>({ min: 0, max: 1 });
  const { low, high } = useMemo(() => {
    let low = Infinity, high = -Infinity;
    for (const candle of visible) {
      low = Math.min(low, candle.low);
      high = Math.max(high, candle.high);
    }
    return visible.length ? { low, high } : { low: 0, high: 1 };
  }, [visible]);
  const automatic = useMemo(() => automaticPriceRange(
    visible.length ? low : priceScale === "log" ? 1 : 0,
    visible.length ? high : priceScale === "log" ? 10 : 1,
    priceScale,
    autoTopSpace / Math.max(1, height),
  ), [visible.length, low, high, priceScale, autoTopSpace, height]);
  const priceRatio = usePriceToBarRatio({
    savedView,
    mode: priceScale,
    count,
    width,
    height,
    setManualPrice,
    bounds:
      activeManualPrice ??
      (!visible.length &&
      hasDrawingLayer &&
      validPriceRange(priceRef.current, priceScale)
        ? priceRef.current
        : automatic),
  });
  priceRef.current = priceRatio.bounds;
  return {
    settings,
    changeSettings,
    logarithmicAvailable,
    timeZone,
    priceScale,
    manualPrice,
    setManualPrice,
    activeManualPrice,
    priceRef,
    priceRatio,
    low,
    high,
  };
}
export type ChartPriceScale = ReturnType<typeof useChartPriceScale>;
