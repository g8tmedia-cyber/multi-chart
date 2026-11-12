import { duration, type Candle, type Interval } from "@/lib/trading-types";

// Empty chart space is extrapolated from the timeframe, never from unrevealed OHLC data.
function offsetTime(origin: number, interval: Interval, bars: number): number {
  if (interval !== "1M") return origin + bars * duration(interval);
  const date = new Date(origin);
  date.setUTCMonth(date.getUTCMonth() + bars);
  return date.getTime();
}
function offsetIndex(origin: number, interval: Interval, time: number): number {
  if (interval !== "1M") return (time - origin) / duration(interval);
  const first = new Date(origin),
    at = new Date(time);
  let whole =
    (at.getUTCFullYear() - first.getUTCFullYear()) * 12 +
    at.getUTCMonth() -
    first.getUTCMonth();
  if (offsetTime(origin, interval, whole) > time) whole--;
  const start = offsetTime(origin, interval, whole),
    end = offsetTime(origin, interval, whole + 1);
  return whole + (time - start) / (end - start);
}
// Preserve within-candle times and source coordinates across timeframe changes.
export function timeToCandleIndex(
  candles: Candle[],
  interval: Interval,
  time: number,
): number {
  if (!candles.length) return 0;
  const last = candles.length - 1;
  if (time < candles[0].time)
    return offsetIndex(candles[0].time, interval, time);
  if (time >= candles[last].time)
    return last + offsetIndex(candles[last].time, interval, time);
  let lo = 0,
    hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (candles[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1;
  return i + (time - candles[i].time) / (candles[i + 1].time - candles[i].time);
}
export function candleIndexToTime(
  candles: readonly Candle[],
  interval: Interval,
  index: number,
): number {
  if (!candles.length) return 0;
  const last = candles.length - 1;
  if (index < 0 || index >= last) {
    const origin = index < 0 ? 0 : last,
      offset = index - origin,
      whole = Math.floor(offset);
    const start = offsetTime(candles[origin].time, interval, whole),
      end = offsetTime(candles[origin].time, interval, whole + 1);
    return Math.round(start + (offset - whole) * (end - start));
  }
  const i = Math.floor(index);
  return Math.round(
    candles[i].time + (index - i) * (candles[i + 1].time - candles[i].time),
  );
}

// Use the same bar grid as candle rendering, including compressed market gaps
// and blank future space. This requires no unrevealed candle data.
export function snapTimeToCandle(
  candles: Candle[],
  interval: Interval,
  time: number,
): number {
  if (!candles.length) return time;
  return candleIndexToTime(
    candles, interval, Math.round(timeToCandleIndex(candles, interval, time)),
  );
}
