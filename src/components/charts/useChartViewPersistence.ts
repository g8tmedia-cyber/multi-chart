import { useEffect, useMemo, useRef } from "react";
import type { ChartRange } from "@/lib/chart-geometry";
import type { PriceRange, PriceScaleMode } from "@/lib/chart-price-scale";
import type { ChartView } from "@/lib/chart-types";

type Props = {
  range: ChartRange;
  candleCount: number;
  bounds: PriceRange;
  manual: boolean;
  ratio: number | null;
  timeZone: string;
  priceScale: PriceScaleMode;
  marketView: boolean;
  onViewChange?: (view: ChartView) => void;
};

export function useChartViewPersistence({
  range,
  candleCount,
  bounds,
  manual,
  ratio,
  timeZone,
  priceScale,
  marketView,
  onViewChange,
}: Props) {
  const min = manual || ratio !== null ? bounds.min : null;
  const max = manual || ratio !== null ? bounds.max : null;
  const view = useMemo<ChartView>(
    () => ({
      right: range.right - candleCount,
      count: range.count,
      min,
      max,
      timeZone,
      priceScale,
      priceBarRatio: ratio ?? undefined,
    }),
    [
      range.right,
      range.count,
      candleCount,
      min,
      max,
      timeZone,
      priceScale,
      ratio,
    ],
  );

  useEffect(() => {
    if (!onViewChange) return;
    const timer = window.setTimeout(() => onViewChange(view), 350);
    return () => window.clearTimeout(timer);
  }, [view, onViewChange]);

  const latest = useRef({ onViewChange, view });
  latest.current = { onViewChange, view };
  useEffect(() => {
    if (!marketView) return;
    const flush = () => latest.current.onViewChange?.(latest.current.view);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [marketView]);
  return view;
}
