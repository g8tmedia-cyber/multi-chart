import { useEffect, useRef, type RefObject } from "react";
import type { Candle, Interval } from "@/lib/trading-types";
import type { ChartRange } from "@/lib/chart-geometry";

type Props = {
  marketView: boolean;
  replayCursor?: number;
  candles: Candle[];
  interval: Interval;
  range: ChartRange;
  rangeRef: RefObject<ChartRange>;
  hasEarlier: boolean;
  loadingHistory: boolean;
  historyRetryAt?: number | null;
  onLoadEarlier?: () => void;
};

export function useChartHistory({
  marketView,
  replayCursor,
  candles,
  interval,
  range,
  rangeRef,
  hasEarlier,
  loadingHistory,
  historyRetryAt,
  onLoadEarlier,
}: Props) {
  const intent = useRef(false);
  const boundary = useRef<string | null>(null);
  useEffect(() => {
    if (
      (!marketView && replayCursor === undefined) ||
      !intent.current ||
      !hasEarlier ||
      loadingHistory ||
      !onLoadEarlier ||
      !candles.length ||
      rangeRef.current.right - rangeRef.current.count > 12 ||
      (historyRetryAt ?? 0) > Date.now()
    )
      return;
    const key = interval + "|" + candles[0].time;
    if (boundary.current === key) return;
    boundary.current = key;
    onLoadEarlier();
  }, [
    marketView,
    replayCursor,
    hasEarlier,
    loadingHistory,
    onLoadEarlier,
    candles,
    range.right,
    range.count,
    interval,
    historyRetryAt,
    rangeRef,
  ]);
  useEffect(() => {
    if (
      (!marketView && replayCursor === undefined) ||
      !intent.current ||
      !hasEarlier ||
      loadingHistory ||
      !onLoadEarlier ||
      !historyRetryAt ||
      rangeRef.current.right - rangeRef.current.count > 12
    )
      return;
    const timer = window.setTimeout(
      () => {
        boundary.current = null;
        onLoadEarlier();
      },
      Math.max(1000, historyRetryAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [
    marketView,
    replayCursor,
    hasEarlier,
    loadingHistory,
    onLoadEarlier,
    historyRetryAt,
    range.right,
    range.count,
    rangeRef,
  ]);
  return { intent, boundary };
}
export type ChartHistory = ReturnType<typeof useChartHistory>;
