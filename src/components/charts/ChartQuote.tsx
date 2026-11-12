import { useLayoutEffect, useRef } from "react";
import type { Candle } from "@/lib/trading-types";
import { formatChartPrice } from "@/lib/number-format";

export default function ChartQuote({ current }: { current?: Candle }) {
  const container = useRef<HTMLDivElement>(null);
  const values = useRef<HTMLDivElement>(null);
  const hasCurrent = Boolean(current);
  useLayoutEffect(() => {
    const row = container.current;
    const content = values.current;
    if (!row || !content) return;
    const fit = () => {
      const available = row.clientWidth;
      const natural = content.scrollWidth;
      if (available > 0 && natural > 0) {
        row.style.setProperty('--ohlc-scale', String(Math.min(1, available / natural)));
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    observer.observe(content);
    return () => observer.disconnect();
  }, [hasCurrent]);
  if (!current) return null;
  return (
    <div ref={container} data-chart-ohlc aria-live="off">
      <div ref={values} data-chart-ohlc-values>
        <span>O {formatChartPrice(current.open)}</span>
        <span>H {formatChartPrice(current.high)}</span>
        <span>L {formatChartPrice(current.low)}</span>
        <span data-chart-direction={current.close >= current.open ? "bullish" : "bearish"}>
          C {formatChartPrice(current.close)}
        </span>
      </div>
    </div>
  );
}
