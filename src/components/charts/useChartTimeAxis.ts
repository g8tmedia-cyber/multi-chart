import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, Interval } from "@/lib/trading-types";
import type { ChartRange } from "@/lib/chart-geometry";
import { chartTimeTicks, estimateTimeLabelWidth } from "@/lib/chart-time-axis";

type MeasureText = (label: string) => number;

export function useChartTimeAxis(
  candles: readonly Candle[],
  interval: Interval,
  range: ChartRange,
  width: number,
  timeZone: string,
  overscan = false,
) {
  const measurementRef = useRef<globalThis.SVGTextElement>(null);
  const [measureText, setMeasureText] = useState<MeasureText>();
  useEffect(() => {
    const element = measurementRef.current;
    // SSR and jsdom use deterministic, conservative estimates without canvas.
    if (!element || typeof globalThis.CanvasRenderingContext2D === "undefined")
      return;
    let disposed = false;
    const refresh = () => {
      if (disposed) return;
      let context: globalThis.CanvasRenderingContext2D | null;
      try {
        context = document.createElement("canvas").getContext("2d");
      } catch {
        return;
      }
      if (!context) return;
      const style = window.getComputedStyle(element);
      context.font =
        (style.fontStyle || "normal") +
        " " +
        (style.fontWeight || "400") +
        " " +
        (style.fontSize || "10px") +
        " " +
        (style.fontFamily || "sans-serif");
      const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
      const cache = new Map<string, number>();
      const measure: MeasureText = (label) => {
        const cached = cache.get(label);
        if (cached !== undefined) return cached;
        const actual =
          context.measureText(label).width +
          Math.max(0, label.length - 1) * letterSpacing;
        const result =
          Number.isFinite(actual) && actual > 0
            ? actual
            : estimateTimeLabelWidth(label);
        cache.set(label, result);
        return result;
      };
      setMeasureText(() => measure);
    };
    refresh();
    const fonts = document.fonts;
    void fonts?.ready?.then(refresh, () => undefined);
    fonts?.addEventListener("loadingdone", refresh);
    return () => {
      disposed = true;
      fonts?.removeEventListener("loadingdone", refresh);
    };
  }, []);
  const { right, count } = range;
  const ticks = useMemo(() => {
    const generated = chartTimeTicks({ candles, interval,
      range: overscan ? { right: right + count, count: count * 3 } : { right, count },
      width: overscan ? width * 3 : width, timeZone, measureText });
    return overscan ? generated.map(tick => ({ ...tick, x: tick.x - width, labelX: tick.labelX - width })) : generated;
  }, [candles, interval, right, count, width, timeZone, measureText, overscan]);
  return { ticks, measurementRef };
}
