import type { Ref } from "react";
import type { ChartTimeTick } from "@/lib/chart-time-axis";
import { formatChartPrice } from "@/lib/number-format";

type AxisBounds = {
  plotWidth: number;
  bottom: number;
  size: { width: number; height: number };
};
type PriceAxisProps = AxisBounds & {
  ticks: number[];
  y: (price: number) => number;
  panLayerRef?: Ref<globalThis.SVGGElement>;
  clipId?: string;
};
export function ChartPriceAxis({
  plotWidth,
  bottom,
  size,
  ticks,
  y,
  panLayerRef,
  clipId,
}: PriceAxisProps) {
  return (
    <>
      <line
        x1={plotWidth}
        x2={plotWidth}
        y1="0"
        y2={bottom}
        stroke="hsl(var(--border))"
      />
      <line
        x1="0"
        x2={size.width}
        y1={bottom}
        y2={bottom}
        stroke="hsl(var(--border))"
      />
      <g clipPath={clipId ? "url(#" + clipId + ")" : undefined}>
        <g ref={panLayerRef} data-pan-price-axis>
      {ticks.map((price) => (
        <g key={price}>
          <line
            aria-hidden="true"
            x1={plotWidth}
            x2={plotWidth + 4}
            y1={y(price)}
            y2={y(price)}
            stroke="hsl(var(--border))"
          />
          <text
            data-chart-price-tick
            x={plotWidth + 9}
            y={y(price) + 4}
            fill="hsl(var(--muted-foreground))"
            className="chart-axis-text"
          >
            {formatChartPrice(price)}
          </text>
        </g>
      ))}
        </g>
      </g>
    </>
  );
}

type TimeAxisProps = AxisBounds & {
  timeTicks: ChartTimeTick[];
  timeAxisMeasurement: Ref<globalThis.SVGTextElement>;
  fullTime: (time: number) => string;
  panLayerRef?: Ref<globalThis.SVGGElement>;
  clipId?: string;
};
export function ChartTimeAxis({
  plotWidth,
  bottom,
  size,
  timeTicks,
  timeAxisMeasurement,
  fullTime,
  panLayerRef,
  clipId,
}: TimeAxisProps) {
  return (
    <>
      <rect
        data-chart-axis="time"
        x={0}
        y={bottom}
        width={plotWidth}
        height={size.height - bottom}
        fill="transparent"
        className="cursor-ew-resize"
      >
        <title>
          Drag time scale horizontally to adjust candle spacing and release the
          price-to-bar ratio lock. Double-click to reset time scaling.
        </title>
      </rect>
      <text
        ref={timeAxisMeasurement}
        className="chart-axis-text"
        visibility="hidden"
        aria-hidden="true"
        pointerEvents="none"
      />
      <g clipPath={clipId ? "url(#" + clipId + ")" : undefined}>
        <g ref={panLayerRef} data-pan-time-axis>
      {timeTicks.map((tick) => (
        <g key={tick.time} className="cursor-ew-resize">
          <title>{fullTime(tick.time)}</title>
          <line
            aria-hidden="true"
            x1={tick.x}
            x2={tick.x}
            y1={bottom}
            y2={bottom + 4}
            stroke="hsl(var(--border))"
          />
          <text
            data-chart-time-tick
            data-time={tick.time}
            data-label-width={tick.width}
            data-tick-kind={tick.kind}
            x={tick.labelX}
            y={bottom + 21}
            textAnchor="middle"
            aria-label={fullTime(tick.time)}
            fill="hsl(var(--muted-foreground))"
            className="chart-axis-text"
          >
            {tick.label}
          </text>
        </g>
      ))}
        </g>
      </g>
    </>
  );
}
export function ChartPriceAxisHitArea({ plotWidth, bottom, size }: AxisBounds) {
  return (
    <rect
      data-chart-axis="price"
      x={plotWidth}
      y={0}
      width={size.width - plotWidth}
      height={bottom}
      fill="transparent"
      className="cursor-ns-resize"
    >
      <title>
        Drag price scale vertically to stretch or compress candles and release
        the price-to-bar ratio lock. Double-click to restore automatic price
        scaling.
      </title>
    </rect>
  );
}
