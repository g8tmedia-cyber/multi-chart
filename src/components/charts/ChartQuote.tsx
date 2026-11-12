import type { Candle } from "@/lib/trading-types";
import { formatChartPrice } from "@/lib/number-format";

export default function ChartQuote({ current }: { current?: Candle }) {
  if (!current) return null;
  return (
    <div data-chart-ohlc aria-live="off">
      <span>O {formatChartPrice(current.open)}</span>
      <span>H {formatChartPrice(current.high)}</span>
      <span>L {formatChartPrice(current.low)}</span>
      <span data-chart-direction={current.close >= current.open ? "bullish" : "bearish"}>
        C {formatChartPrice(current.close)}
      </span>
    </div>
  );
}
