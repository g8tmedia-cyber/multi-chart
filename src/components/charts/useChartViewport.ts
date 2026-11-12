import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { Candle, Interval } from '@/lib/trading-types';
import type { ChartDrag, ChartView } from '@/lib/chart-types';
import {
  candleIndex,
  clampRange as clampReplayRange,
  defaultChartCount,
  zoomRange as zoomReplayRange,
  type ChartRange,
} from '@/lib/chart-geometry';
import { clampMarketRange, zoomMarketRange } from '@/lib/chart-sync';
import { retainCandleViewport } from '@/lib/chart-viewport';
import { timeToCandleIndex } from '@/lib/chart-time-coordinates';
import { useChartPanPreview } from '@/components/charts/useChartPanPreview';

type Props = {
  candles: Candle[];
  interval: Interval;
  marketView: boolean;
  savedView?: ChartView | null;
  focusTime?: number;
  replayCursor?: number;
  hasDrawingLayer: boolean;
  drag: RefObject<ChartDrag | null>;
  panning?: boolean;
};

export function useChartViewport({
  candles,
  interval,
  marketView,
  savedView,
  focusTime,
  replayCursor,
  hasDrawingLayer,
  drag,
  panning = false,
}: Props) {
  const clampRange = marketView ? clampMarketRange : clampReplayRange;
  const zoomRange = marketView ? zoomMarketRange : zoomReplayRange;
  const [range, setRangeState] = useState<ChartRange>(() => {
    const initial = {
      right: candles.length + (savedView?.right ?? 6),
      count: savedView?.count ?? defaultChartCount(candles.length, marketView),
    };
    if (!marketView) return initial;
    if (!candles.length) return initial;
    return clampRange(
      initial.right < 0 ? { ...initial, right: candles.length + 6 } : initial,
      candles.length,
    );
  });
  const rangeRef = useRef(range);
  // Batch drag-originated range updates to one setState per animation frame so
  // pointermove events (60–120+/s) don't trigger a full React re-render each time.
  const rafPending = useRef<number | null>(null);
  const pendingRange = useRef<ChartRange | null>(null);
  useLayoutEffect(() => {
    if (pendingRange.current === null) rangeRef.current = range;
  }, [range]);
  const setRange = useRef<typeof setRangeState>((value) => {
    if (drag.current) {
      // Resolve functional updaters immediately against the latest ref value so
      // the pending value is always current even if multiple moves arrive before
      // the frame fires.
      const next =
        typeof value === 'function' ? value(rangeRef.current) : value;
      if (
        next.right === rangeRef.current.right &&
        next.count === rangeRef.current.count
      )
        return;
      pendingRange.current = next;
      rangeRef.current = next;
      if (rafPending.current === null) {
        rafPending.current = globalThis.requestAnimationFrame(() => {
          rafPending.current = null;
          const queued = pendingRange.current;
          pendingRange.current = null;
          if (queued !== null) setRangeState(queued);
        });
      }
    } else {
      if (rafPending.current !== null) {
        globalThis.cancelAnimationFrame(rafPending.current);
        rafPending.current = null;
        pendingRange.current = null;
      }
      const next =
        typeof value === 'function' ? value(rangeRef.current) : value;
      rangeRef.current = next;
      setRangeState(next);
    }
  }).current;
  const previous = useRef(candles);
  const previousReplayCursor = useRef(replayCursor);
  const following = useRef(!marketView);

  useLayoutEffect(() => {
    const old = previous.current;
    const previousCursor = previousReplayCursor.current;
    previous.current = candles;
    previousReplayCursor.current = replayCursor;
    const replayAdvanced =
      !marketView &&
      replayCursor !== undefined &&
      previousCursor !== undefined &&
      replayCursor > previousCursor;
    if ((old === candles && !replayAdvanced) || !candles.length) return;
    const rebase = (project: (current: ChartRange) => ChartRange) => {
      // rangeRef includes the newest pointer sample even before its RAF paints.
      // Rebase that sample, not stale React state, and retire its old queue so
      // a late frame cannot snap back over newly loaded history/replay bars.
      if (rafPending.current !== null)
        globalThis.cancelAnimationFrame(rafPending.current);
      rafPending.current = null;
      pendingRange.current = null;
      const retained = project(rangeRef.current);
      if (drag.current)
        drag.current.right += retained.right - rangeRef.current.right;
      rangeRef.current = retained;
      setRangeState(retained);
    };
    if (marketView) {
      rebase((current) => {
        const nextLast = candles.at(-1)!;
        const previousLast = old.at(-1);
        const followLive = previousLast && nextLast.time > previousLast.time &&
          current.right >= old.length - 1 && !drag.current;
        const next = followLive
          ? { ...current, right: current.right + candles.length - old.length }
          : retainCandleViewport(current, old, candles, interval);
        const right = !old.length && next.right < 0 ? candles.length + 6 : next.right;
        return clampRange({ ...next, right }, candles.length);
      });
      return;
    }
    if (replayCursor !== undefined) {
      const tailAdvanced =
        old.length > 0 &&
        candles[candles.length - 1].time > old[old.length - 1].time;
      const followReplay = replayAdvanced || tailAdvanced;
      if (followReplay) following.current = true;
      // Keep the newest bar at the user's chosen screen position, not a fixed
      // right margin. A clock tick without a newly closed bar has zero shift;
      // history-only prepends instead retain the visible candles by timestamp.
      const project = (current: ChartRange): ChartRange =>
        clampRange(
          followReplay
            ? { ...current, right: current.right + candles.length - old.length }
            : retainCandleViewport(current, old, candles, interval),
          candles.length,
          hasDrawingLayer,
        );
      rebase(project);
      return;
    }
    const oldFirst = old[0]?.time;
    const newFirst = candles[0].time;
    rebase((current) => {
      if (oldFirst !== undefined && newFirst < oldFirst) {
        const prepend = candleIndex(candles, oldFirst);
        return clampRange(
          { ...current, right: current.right + prepend },
          candles.length,
          hasDrawingLayer,
        );
      }
      if (newFirst !== oldFirst || following.current) {
        return clampRange(
          { ...current, right: candles.length + 6 },
          candles.length,
          hasDrawingLayer,
        );
      }
      return clampRange(current, candles.length, hasDrawingLayer);
    });
  }, [
    candles,
    clampRange,
    drag,
    hasDrawingLayer,
    interval,
    marketView,
    replayCursor,
  ]);

  const focusProjection = useRef({ clampRange, hasDrawingLayer, interval });
  focusProjection.current = { clampRange, hasDrawingLayer, interval };
  useEffect(() => {
    if (focusTime === undefined || !candles.length) return;
    const current = focusProjection.current;
    following.current = false;
    setRangeState((range) =>
      current.clampRange(
        {
          ...range,
          right:
            (current.hasDrawingLayer
              ? timeToCandleIndex(candles, current.interval, focusTime)
              : candleIndex(candles, focusTime)) +
            range.count * 0.7,
        },
        candles.length,
        current.hasDrawingLayer,
      ),
    );
    // Focus is a request, not a derived viewport. Renders/settings changes must
    // not replay the request and undo a user's subsequent pan.
  }, [focusTime, candles]);

  // Cancel any pending RAF on unmount to prevent setState after unmount.
  useEffect(
    () => () => {
      if (rafPending.current !== null)
        globalThis.cancelAnimationFrame(rafPending.current);
    },
    [],
  );

  // Both axes are a visual preview until release. Vertical jitter must not
  // rebuild price geometry while horizontal geometry is only translated.
  const {
    panLayerRef,
    timePanLayerRef,
    pricePanLayerRef,
    offset,
    translate,
    clear,
  } = useChartPanPreview();
  const applyPanOffset = useCallback(
    (dx: number, width?: number, dy = 0) => {
      const base = rangeRef.current;
      const next =
        width && dx !== 0
          ? clampRange(
              {
                count: base.count,
                right: base.right - (dx / width) * base.count,
              },
              candles.length,
              hasDrawingLayer,
            )
          : null;
      const horizontal =
        next && width ? ((base.right - next.right) / base.count) * width : dx;
      translate(horizontal, dy);
    },
    [candles.length, clampRange, hasDrawingLayer, translate],
  );

  const commitPan = useCallback(
    (width: number) => {
      const dx = offset.current.x,
        queued = pendingRange.current;
      clear();
      if (rafPending.current !== null)
        globalThis.cancelAnimationFrame(rafPending.current);
      rafPending.current = null;
      pendingRange.current = null;
      if (dx === 0 && queued === null) return;
      const base = rangeRef.current;
      const next = clampRange(
        { count: base.count, right: base.right - (dx / width) * base.count },
        candles.length,
        hasDrawingLayer,
      );
      // A second pointer can begin before React commits; pinch must start from
      // this completed pan rather than from the previous render's range.
      rangeRef.current = next;
      setRangeState(next);
    },
    [candles.length, clampRange, hasDrawingLayer, offset, clear],
  );

  const start = Math.max(0, Math.floor(range.right - range.count) - 1);
  const end = Math.min(candles.length, Math.ceil(range.right) + 1);
  const visible = useMemo(
    () => candles.slice(start, end),
    [candles, start, end],
  );
  // The price scale still uses only visible candles. Buffer artwork during a
  // held drag so translating the plot never exposes an undrawn adjacent window.
  // Auto-fit pans already rebuild the visible range each paint. Triple-size
  // buffers only help the transform-only fixed/locked-price path.
  const panPreviewActive =
    panning && Boolean(drag.current?.verticalPan) && !drag.current?.distance;
  const buffer = panPreviewActive ? Math.ceil(range.count) : 0;
  const panStart = Math.max(0, start - buffer);
  const panEnd = Math.min(candles.length, end + buffer);
  const panVisible = useMemo(
    () => (panPreviewActive ? candles.slice(panStart, panEnd) : visible),
    [panPreviewActive, candles, panStart, panEnd, visible],
  );
  return {
    range,
    setRange,
    rangeRef,
    following,
    clampRange,
    zoomRange,
    start,
    visible,
    panLayerRef,
    timePanLayerRef,
    pricePanLayerRef,
    panStart,
    panVisible,
    panPreviewActive,
    applyPanOffset,
    commitPan,
  };
}
export type ChartViewport = ReturnType<typeof useChartViewport>;
