import type { ChartPixelPoint } from "@/lib/chart-types";
import { formatChartPrice } from "@/lib/number-format";

type Props = {
  pointer: ChartPixelPoint | null;
  crosshairX: number;
  plotWidth: number;
  top: number;
  bottom: number;
};
export function ChartCrosshairLines({
  pointer,
  crosshairX,
  plotWidth,
  top,
  bottom,
}: Props) {
  return (
    <>
      {pointer && (
        <g data-chart-crosshair pointerEvents="none">
          <line
            x1={crosshairX}
            x2={crosshairX}
            y1={top}
            y2={bottom}
            stroke="hsl(var(--chart-crosshair))"
            strokeDasharray="4 4"
          />
          <line
            x1="0"
            x2={plotWidth}
            y1={pointer.y}
            y2={pointer.y}
            stroke="hsl(var(--chart-crosshair))"
            strokeDasharray="4 4"
          />
        </g>
      )}
    </>
  );
}

type LabelProps = Props & {
  pointerTime?: number;
  priceAtY: (pixel: number) => number;
  formatTime: (time: number) => string;
};
export function ChartCrosshairLabels({
  pointer,
  crosshairX,
  plotWidth,
  top,
  bottom,
  pointerTime,
  priceAtY,
  formatTime,
}: LabelProps) {
  const timeLabel = pointerTime === undefined ? "" : formatTime(pointerTime);
  const labelWidth = Math.min(plotWidth, Math.max(160, timeLabel.length * 7 + 16));
  const labelLeft = Math.max(0, Math.min(plotWidth - labelWidth, crosshairX - labelWidth / 2));
  return (
    <>
      {pointer && (
        <g pointerEvents="none">
          <rect
            x={plotWidth}
            y={Math.max(top, Math.min(bottom - 22, pointer.y - 11))}
            width="78"
            height="22"
            fill="hsl(var(--secondary))"
          />
          <text
            data-chart-crosshair-price
            x={plotWidth + 7}
            y={Math.max(top + 15, Math.min(bottom - 7, pointer.y + 4))}
            fill="hsl(var(--foreground))"
            className="chart-axis-text"
          >
            {formatChartPrice(priceAtY(pointer.y))}
          </text>
          {pointerTime !== undefined && (
            <>
              <rect
                x={labelLeft}
                y={bottom + 1}
                width={labelWidth}
                height="26"
                rx="3"
                fill="hsl(var(--secondary))"
              />
              <text
                data-chart-crosshair-time
                x={labelLeft + labelWidth / 2}
                y={bottom + 18}
                textAnchor="middle"
                fill="hsl(var(--foreground))"
                className="chart-axis-text"
              >
                {timeLabel}
              </text>
            </>
          )}
        </g>
      )}
    </>
  );
}
