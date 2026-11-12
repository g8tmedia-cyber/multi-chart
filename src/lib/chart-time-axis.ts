import type { Candle, Interval } from '@/lib/trading-types';
import type { ChartRange } from '@/lib/chart-geometry';
import { isChartTimeZone } from '@/lib/chart-timezones';

export const TIME_AXIS_LABEL_GAP = 14;
export const TIME_AXIS_MIN_CENTER_DISTANCE = 56;
export const TIME_AXIS_EDGE_PADDING = 4;
export type ChartTimeTickKind = 'year' | 'month' | 'day' | 'time';
export type ChartTimeTick = {
  index: number;
  time: number;
  x: number;
  labelX: number;
  label: string;
  width: number;
  kind: ChartTimeTickKind;
  weight: number;
};
type Options = {
  candles: readonly Candle[];
  interval: Interval;
  range: ChartRange;
  width: number;
  timeZone: string;
  measureText?: (label: string) => number;
};
type LocalTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
type Significance = { kind: ChartTimeTickKind; weight: number };
const intradayDivisors = [
  { milliseconds: 12 * 3600000, weight: 38 },
  { milliseconds: 6 * 3600000, weight: 36 },
  { milliseconds: 3 * 3600000, weight: 34 },
  { milliseconds: 3600000, weight: 32 },
  { milliseconds: 30 * 60000, weight: 28 },
  { milliseconds: 15 * 60000, weight: 26 },
  { milliseconds: 5 * 60000, weight: 24 },
  { milliseconds: 60000, weight: 20 },
  { milliseconds: 30000, weight: 18 },
  { milliseconds: 15000, weight: 16 },
  { milliseconds: 5000, weight: 14 },
];

// Conservative SSR / non-measuring-browser fallback for the short English date
// and clock labels. The browser supplies real font metrics after hydration.
export function estimateTimeLabelWidth(label: string): number {
  return label.length * 7;
}

// Calendar fields depend only on timestamp + timezone, not price, viewport or
// source. Bound both caches so long replays cannot retain the entire archive.
const calendarCache = new Map<
  string,
  {
    local: Intl.DateTimeFormat;
    month: Intl.DateTimeFormat;
    day: Intl.DateTimeFormat;
    times: Map<number, LocalTime | null>;
  }
>();
function calendarFor(zone: string) {
  let entry = calendarCache.get(zone);
  if (!entry) {
    entry = {
      local: new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }),
      month: new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        month: 'short',
      }),
      day: new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        month: 'short',
        day: 'numeric',
      }),
      times: new Map(),
    };
    if (calendarCache.size >= 4)
      calendarCache.delete(calendarCache.keys().next().value!);
    calendarCache.set(zone, entry);
  }
  return entry;
}
function cachedLocalTime(
  time: number,
  calendar: ReturnType<typeof calendarFor>,
): LocalTime | null {
  const cached = calendar.times.get(time);
  if (cached !== undefined) return cached;
  const result = localTime(time, calendar.local);
  if (calendar.times.size >= 8192)
    calendar.times.delete(calendar.times.keys().next().value!);
  calendar.times.set(time, result);
  return result;
}
function localTime(
  time: number,
  formatter: Intl.DateTimeFormat,
): LocalTime | null {
  if (!Number.isFinite(time) || !Number.isFinite(new Date(time).getTime()))
    return null;
  const parts = formatter.formatToParts(time);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}
function wallTime(value: LocalTime): number {
  return Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
}
function significance(
  current: LocalTime,
  previous: LocalTime | null,
  interval: Interval,
): Significance {
  const intraday =
    !interval.endsWith('d') &&
    !interval.endsWith('w') &&
    !interval.endsWith('M');
  if (previous) {
    if (current.year !== previous.year) return { kind: 'year', weight: 70 };
    if (current.month !== previous.month) return { kind: 'month', weight: 60 };
    if (current.day !== previous.day) return { kind: 'day', weight: 50 };
  } else {
    const midnight =
      current.hour === 0 && current.minute === 0 && current.second === 0;
    if (interval === '1M' || (current.day === 1 && (!intraday || midnight)))
      return current.month === 1
        ? { kind: 'year', weight: 70 }
        : { kind: 'month', weight: 60 };
    if (!intraday || midnight) return { kind: 'day', weight: 50 };
    return { kind: 'time', weight: 30 };
  }
  if (!intraday) return { kind: 'day', weight: 50 };
  const now = wallTime(current),
    before = wallTime(previous);
  for (const divisor of intradayDivisors) {
    if (
      Math.floor(now / divisor.milliseconds) !==
      Math.floor(before / divisor.milliseconds)
    )
      return { kind: 'time', weight: divisor.weight };
  }
  return { kind: 'time', weight: 10 };
}

/**
 * Original SVG implementation, informed by Lightweight Charts' public algorithm:
 * prioritize calendar boundaries, then admit lower-weight ticks only when they fit.
 * Reference: tradingview/lightweight-charts src/model/tick-marks.ts at
 * efa9bd49e8116a33cb0c1dee61c5bef74b8d0dea. No library code is imported/copied.
 * Candidates use revealed candle timestamps only, never prefetched/future OHLC.
 */
export function chartTimeTicks({
  candles,
  interval,
  range,
  width,
  timeZone,
  measureText,
}: Options): ChartTimeTick[] {
  if (
    !candles.length ||
    !Number.isFinite(width) ||
    width <= 2 * TIME_AXIS_EDGE_PADDING ||
    !Number.isFinite(range.count) ||
    range.count <= 0 ||
    !Number.isFinite(range.right)
  )
    return [];
  const first = Math.max(0, Math.ceil(range.right - range.count));
  const last = Math.min(candles.length - 1, Math.floor(range.right));
  if (first > last) return [];
  const zone = isChartTimeZone(timeZone) ? timeZone : 'UTC';
  const calendar = calendarFor(zone),
    monthFormatter = calendar.month,
    dayFormatter = calendar.day;
  const widths = new Map<string, number>();
  const labelWidth = (label: string) => {
    const cached = widths.get(label);
    if (cached !== undefined) return cached;
    let measured = estimateTimeLabelWidth(label);
    try {
      const actual = measureText?.(label);
      if (actual !== undefined && Number.isFinite(actual) && actual > 0)
        measured = actual;
    } catch {
      /* Keep the safe, deterministic fallback. */
    }
    const result = Math.ceil(measured) + 2;
    widths.set(label, result);
    return result;
  };
  let previous =
    first > 0 ? cachedLocalTime(candles[first - 1].time, calendar) : null;
  const candidates: ChartTimeTick[] = [];
  for (let index = first; index <= last; index++) {
    const time = candles[index].time,
      current = cachedLocalTime(time, calendar);
    if (!current) continue;
    const importance = significance(current, previous, interval);
    previous = current;
    const x = ((index - range.right + range.count) / range.count) * width;
    if (x < 0 || x > width) continue;
    const label =
      importance.kind === 'year'
        ? String(current.year)
        : importance.kind === 'month'
          ? monthFormatter.format(time)
          : importance.kind === 'day'
            ? dayFormatter.format(time)
            : String(current.hour).padStart(2, '0') +
              ':' +
              String(current.minute).padStart(2, '0') +
              (interval === '1s' ? ':' + String(current.second).padStart(2, '0') : '');
    const textWidth = labelWidth(label);
    if (textWidth > width - 2 * TIME_AXIS_EDGE_PADDING) continue;
    const labelX = Math.max(
      TIME_AXIS_EDGE_PADDING + textWidth / 2,
      Math.min(width - TIME_AXIS_EDGE_PADDING - textWidth / 2, x),
    );
    candidates.push({
      index,
      time,
      x,
      labelX,
      label,
      width: textWidth,
      ...importance,
    });
  }
  candidates.sort(
    (left, right) => right.weight - left.weight || left.index - right.index,
  );
  const accepted: ChartTimeTick[] = [];
  for (const candidate of candidates) {
    const left = candidate.labelX - candidate.width / 2,
      right = candidate.labelX + candidate.width / 2;
    // Test the final label boxes AFTER edge alignment, not just bar indices.
    // This also prevents several off-center labels piling up at the plot edge.
    const fits = accepted.every(
      (other) =>
        Math.abs(candidate.labelX - other.labelX) >=
          TIME_AXIS_MIN_CENTER_DISTANCE &&
        (right + TIME_AXIS_LABEL_GAP <= other.labelX - other.width / 2 ||
          left - TIME_AXIS_LABEL_GAP >= other.labelX + other.width / 2),
    );
    if (fits) accepted.push(candidate);
  }
  return accepted.sort((left, right) => left.index - right.index);
}
