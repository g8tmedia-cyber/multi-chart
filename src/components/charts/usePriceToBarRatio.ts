import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ChartView } from "@/lib/chart-drawing";
import type { PriceRange, PriceScaleMode } from "@/lib/chart-price-scale";
import {
  fitPriceToBarRatio,
  priceToBarRatio,
  validPriceToBarRatio,
} from "@/lib/chart-price-ratio";

type Props = {
  savedView?: ChartView | null;
  mode: PriceScaleMode;
  bounds: PriceRange;
  count: number;
  width: number;
  height: number;
  setManualPrice: Dispatch<SetStateAction<PriceRange | null>>;
};
export function usePriceToBarRatio({
  savedView,
  mode,
  bounds: base,
  count,
  width,
  height,
  setManualPrice,
}: Props) {
  const [lock, setLock] = useState<{
    ratio: number;
    mode: PriceScaleMode;
  } | null>(() => {
    const ratio = savedView?.priceBarRatio;
    return validPriceToBarRatio(ratio)
      ? { ratio, mode: savedView?.priceScale === "log" ? "log" : "linear" }
      : null;
  });
  // A global linear/log change keeps the lock on, but captures the corresponding
  // transformed ratio instead of interpreting a linear ratio as logarithmic.
  const ratio = lock
    ? lock.mode === mode
      ? lock.ratio
      : priceToBarRatio(base, mode, count, width, height)
    : null;
  useEffect(() => {
    if (lock && lock.mode !== mode)
      setLock(ratio === null ? null : { ratio, mode });
  }, [lock, mode, ratio]);
  const bounds =
    ratio === null
      ? base
      : fitPriceToBarRatio(base, mode, ratio, count, width, height);
  const release = () => {
    setManualPrice(bounds);
    setLock(null);
  };
  const toggle = (): number | null => {
    if (lock) {
      release();
      return null;
    }
    const next = priceToBarRatio(bounds, mode, count, width, height);
    if (next !== null) {
      setManualPrice(bounds);
      setLock({ ratio: next, mode });
    }
    return next;
  };
  const autoScale = () => {
    setLock(null);
    setManualPrice(null);
  };
  const scaleTo = (nextCount: number, anchor = 0.5, source = bounds) => {
    if (ratio !== null)
      setManualPrice(
        fitPriceToBarRatio(
          source,
          mode,
          ratio,
          nextCount,
          width,
          height,
          anchor,
        ),
      );
  };
  return {
    bounds,
    ratio,
    locked: ratio !== null,
    toggle,
    release,
    autoScale,
    scaleTo,
    restore: (view: ChartView) => setLock(validPriceToBarRatio(view.priceBarRatio)
      ? { ratio: view.priceBarRatio, mode: view.priceScale === "log" ? "log" : "linear" } : null),
  };
}
