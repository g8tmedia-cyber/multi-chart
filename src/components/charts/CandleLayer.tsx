import { memo } from "react";
import type { Candle } from "@/lib/trading-types";

type Props = {
  visible: Candle[];
  start: number;
  x: (index: number) => number;
  y: (price: number) => number;
  bodyWidth: number;
};

function CandleLayer({
  visible,
  start,
  x,
  y,
  bodyWidth,
}: Props) {
  return (
    <>
      {visible.map((c, i) => {
        const cx = x(start + i);
        const direction = c.close >= c.open ? "bullish" : "bearish";
        const colour = `hsl(var(--chart-${direction}))`;
        const wick = `hsl(var(--chart-${direction}-wick, var(--chart-${direction})))`;
        return (
          <g key={c.time} data-candle-time={c.time} pointerEvents="none">
            <line
              x1={cx}
              x2={cx}
              y1={y(c.high)}
              y2={y(c.low)}
              stroke={wick}
              strokeWidth="1"
            />
            <rect
              x={cx - bodyWidth / 2}
              y={y(Math.max(c.open, c.close))}
              width={bodyWidth}
              height={Math.max(1, Math.abs(y(c.open) - y(c.close)))}
              fill={colour}
            />
          </g>
        );
      })}
    </>
  );
}

// Crosshair-only renders must not reconcile every candle.
export default memo(CandleLayer);
