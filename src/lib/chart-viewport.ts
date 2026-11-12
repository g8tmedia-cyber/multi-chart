import type { Candle, Interval } from "@/lib/trading-types";
import type { ChartRange } from "@/lib/chart-geometry";
import { candleIndex } from "@/lib/chart-geometry";
import { timeToCandleIndex } from "@/lib/chart-time-coordinates";

/** Keep a real candle at its existing screen coordinate when the data window changes. */
export function retainCandleViewport(
  range: ChartRange,
  previous: Candle[],
  candles: Candle[],
  interval: Interval,
): ChartRange {
  if (!candles.length || previous === candles) return range;
  if (!previous.length)
    return { ...range, right: range.right + candles.length };

  const preferred = Math.max(
    0,
    Math.min(previous.length - 1, Math.round(range.right - range.count / 2)),
  );
  const anchorTime = previous[preferred].time;
  const anchorIndex = candleIndex(candles, anchorTime);
  if (candles[anchorIndex]?.time === anchorTime) {
    const shift = anchorIndex - preferred;
    return shift === 0 ? range : { ...range, right: range.right + shift };
  }
  let oldIndex = 0,
    nextIndex = 0,
    distance = Infinity;
  let shift: number | undefined;
  // Match actual timestamps, not the array length or the right edge's extrapolated time.
  // This handles rolling tails, prepends, backfills and market-closure gaps alike.
  while (oldIndex < previous.length && nextIndex < candles.length) {
    const oldTime = previous[oldIndex].time,
      nextTime = candles[nextIndex].time;
    if (oldTime < nextTime) oldIndex++;
    else if (oldTime > nextTime) nextIndex++;
    else {
      const candidateDistance = Math.abs(oldIndex - preferred);
      if (candidateDistance < distance) {
        distance = candidateDistance;
        shift = nextIndex - oldIndex;
      }
      if (oldIndex >= preferred) break;
      oldIndex++;
      nextIndex++;
    }
  }
  // With no overlap, retain the old view's time instead of jumping to the new tail.
  if (shift === undefined)
    shift =
      timeToCandleIndex(candles, interval, anchorTime) -
      preferred;
  return shift === 0 ? range : { ...range, right: range.right + shift };
}
