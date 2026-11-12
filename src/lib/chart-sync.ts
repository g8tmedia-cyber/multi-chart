import type { Candle, Interval } from "@/lib/trading-types";
import type { ChartRange } from "@/lib/chart-geometry";
import {
  candleIndexToTime,
  timeToCandleIndex,
} from "@/lib/chart-time-coordinates";

export const MARKET_SYNC_GROUPS = ["A", "B", "C", "D", "none"] as const;
export type ChartSyncGroup = (typeof MARKET_SYNC_GROUPS)[number];
export type ChartSyncOptions = {
  crosshair: boolean;
  interval: boolean;
  time: boolean;
  dateRange: boolean;
};
export type ChartTimeWindow = { from: number; to: number };
export type ChartSyncEvent = {
  source: string;
  group: ChartSyncGroup;
} & (
  | { kind: "crosshair"; point: { time: number; price: number } | null }
  | { kind: "viewport"; window: ChartTimeWindow }
);
export type ChartSyncChannel = {
  publish: (event: ChartSyncEvent) => void;
  subscribe: (listener: (event: ChartSyncEvent) => void) => () => void;
};
export type ChartSyncBinding = {
  id: string;
  group: ChartSyncGroup;
  active: boolean;
  crosshair: boolean;
  time: boolean;
  dateRange: boolean;
  channel: ChartSyncChannel;
};
export function isChartSyncGroup(value: unknown): value is ChartSyncGroup {
  return MARKET_SYNC_GROUPS.some((group) => group === value);
}
export function isChartSyncOption(
  value: string,
): value is keyof ChartSyncOptions {
  return (
    value === "crosshair" ||
    value === "interval" ||
    value === "time" ||
    value === "dateRange"
  );
}
// The channel belongs to one mounted Markets workspace. No window/global bus can reach replay.
export function createChartSyncChannel(): ChartSyncChannel {
  const listeners = new Set<(event: ChartSyncEvent) => void>();
  return {
    publish(event) {
      for (const listener of [...listeners]) listener(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export function clampMarketRange(
  range: ChartRange,
  length: number,
  _blankSpace?: boolean,
): ChartRange {
  const count = Math.max(
    1,
    Math.min(2500, Number.isFinite(range.count) ? range.count : 110),
  );
  const minimum = Math.min(length + 6, Math.max(1, count * 0.15));
  return {
    count,
    right: Math.max(
      minimum,
      Math.min(
        length + Math.max(6, count * 0.85),
        Number.isFinite(range.right) ? range.right : length + 6,
      ),
    ),
  };
}
export function zoomMarketRange(
  range: ChartRange,
  factor: number,
  anchor: number,
  length: number,
  _blankSpace?: boolean,
): ChartRange {
  const at = Math.max(0, Math.min(1, anchor));
  const count = Math.max(1, Math.min(2500, range.count * factor));
  const point = range.right - range.count + at * range.count;
  return clampMarketRange({ count, right: point + (1 - at) * count }, length);
}
export function chartTimeWindow(
  candles: Candle[],
  interval: Interval,
  range: ChartRange,
): ChartTimeWindow | null {
  if (!candles.length) return null;
  const from = candleIndexToTime(candles, interval, range.right - range.count);
  const to = candleIndexToTime(candles, interval, range.right);
  return Number.isFinite(from) && Number.isFinite(to) && to > from
    ? { from, to }
    : null;
}
export function rangeForTimeWindow(
  candles: Candle[],
  interval: Interval,
  current: ChartRange,
  window: ChartTimeWindow,
  matchRange: boolean,
): ChartRange {
  if (
    !candles.length ||
    !Number.isFinite(window.from) ||
    !Number.isFinite(window.to) ||
    window.to <= window.from
  )
    return current;
  const right = timeToCandleIndex(candles, interval, window.to);
  const count = matchRange
    ? right - timeToCandleIndex(candles, interval, window.from)
    : current.count;
  return clampMarketRange({ right, count }, candles.length);
}
