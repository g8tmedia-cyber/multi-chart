import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Candle, Interval } from "@/lib/trading-types";
import type { ChartRange } from "@/lib/chart-geometry";
import {
  chartTimeWindow,
  rangeForTimeWindow,
  type ChartSyncBinding,
  type ChartTimeWindow,
} from "@/lib/chart-sync";

type Runtime = {
  candles: Candle[];
  interval: Interval;
  range: ChartRange;
  setRange: Dispatch<SetStateAction<ChartRange>>;
  following: RefObject<boolean>;
  hasEarlier: boolean;
  loadingHistory: boolean;
  onLoadEarlier?: () => void;
};
type Pending = {
  window: ChartTimeWindow;
  matchRange: boolean;
  remaining: number;
  requestedOldest: number | null;
};
type Point = { time: number; price: number };
const frame = (callback: () => void): number =>
  typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(callback, 16);
const cancelFrame = (id: number | null) => {
  if (id === null) return;
  if (typeof window.cancelAnimationFrame === "function")
    window.cancelAnimationFrame(id);
  else window.clearTimeout(id);
};
export function useChartSynchronization(
  binding: ChartSyncBinding | undefined,
  runtime: Runtime,
) {
  const [externalPoint, setExternalPoint] = useState<Point | null>(null);
  const latest = useRef({ binding, runtime });
  latest.current = { binding, runtime };
  const pending = useRef<Pending | null>(null),
    lastSource = useRef<string | null>(null);
  const viewportFrame = useRef<number | null>(null),
    pointerFrame = useRef<number | null>(null),
    nextPointer = useRef<Point | null>(null);
  const applyPending = useCallback(() => {
    const request = pending.current,
      r = latest.current.runtime;
    if (!request || !r.candles.length) return;
    r.following.current = false;
    r.setRange((current) => {
      const next = rangeForTimeWindow(
        r.candles,
        r.interval,
        current,
        request.window,
        request.matchRange,
      );
      return Math.abs(next.right - current.right) < 0.000001 &&
        Math.abs(next.count - current.count) < 0.000001
        ? current
        : next;
    });
    const oldest = r.candles[0].time;
    // Fetch actual history only. A failed/unchanged cursor is never retried in a loop.
    if (
      request.window.from < oldest &&
      r.hasEarlier &&
      !r.loadingHistory &&
      r.onLoadEarlier &&
      request.remaining > 0 &&
      request.requestedOldest !== oldest
    ) {
      request.requestedOldest = oldest;
      request.remaining--;
      r.onLoadEarlier();
    }
  }, []);
  const sendViewport = useCallback(() => {
    if (viewportFrame.current !== null) return;
    viewportFrame.current = frame(() => {
      viewportFrame.current = null;
      const { binding: b, runtime: r } = latest.current;
      if (!b || b.group === "none" || (!b.time && !b.dateRange)) return;
      const window = chartTimeWindow(r.candles, r.interval, r.range);
      if (window)
        b.channel.publish({
          kind: "viewport",
          source: b.id,
          group: b.group,
          window,
        });
    });
  }, []);
  const channel = binding?.channel,
    id = binding?.id,
    group = binding?.group;
  const crosshair = binding?.crosshair,
    time = binding?.time,
    dateRange = binding?.dateRange,
    active = binding?.active;
  const firstTime = runtime.candles[0]?.time,
    lastTime = runtime.candles[runtime.candles.length - 1]?.time;
  useEffect(() => {
    setExternalPoint(null);
    lastSource.current = null;
    pending.current = null;
    if (!channel || id === undefined || group === undefined) return;
    const unsubscribe = channel.subscribe((event) => {
      const { binding: b } = latest.current;
      if (
        !b ||
        event.source === b.id ||
        b.group === "none" ||
        event.group !== b.group
      )
        return;
      if (event.kind === "crosshair") {
        if (!b.crosshair) return;
        if (event.point) {
          lastSource.current = event.source;
          setExternalPoint(event.point);
        } else if (lastSource.current === event.source) {
          lastSource.current = null;
          setExternalPoint(null);
        }
      } else if (b.time || b.dateRange) {
        pending.current = {
          window: event.window,
          matchRange: b.dateRange,
          remaining: 32,
          requestedOldest: null,
        };
        applyPending();
      }
    });
    return () => {
      unsubscribe();
      channel.publish({ kind: "crosshair", source: id, group, point: null });
    };
  }, [channel, id, group, crosshair, time, dateRange, applyPending]);
  useEffect(() => {
    applyPending();
  }, [
    runtime.candles,
    runtime.hasEarlier,
    runtime.loadingHistory,
    applyPending,
  ]);
  useEffect(() => {
    if (active && group !== "none" && (time || dateRange)) sendViewport();
  }, [active, group, time, dateRange, sendViewport]);
  useEffect(() => {
    const b = latest.current.binding;
    if (
      b?.active &&
      b.group !== "none" &&
      (b.time || b.dateRange) &&
      latest.current.runtime.following.current &&
      !pending.current
    )
      sendViewport();
  }, [
    runtime.range.right,
    runtime.range.count,
    firstTime,
    lastTime,
    sendViewport,
  ]);
  useEffect(
    () => () => {
      cancelFrame(viewportFrame.current);
      cancelFrame(pointerFrame.current);
      viewportFrame.current = null;
      pointerFrame.current = null;
      nextPointer.current = null;
      pending.current = null;
      const b = latest.current.binding;
      if (b)
        b.channel.publish({
          kind: "crosshair",
          source: b.id,
          group: b.group,
          point: null,
        });
    },
    [],
  );
  return {
    externalPoint,
    interact: () => {
      pending.current = null;
      const b = latest.current.binding;
      if (b && b.group !== "none" && (b.time || b.dateRange)) sendViewport();
    },
    pointer: (point: Point | null) => {
      const binding = latest.current.binding;
      if (!binding?.crosshair || binding.group === "none") return;
      nextPointer.current = point;
      if (pointerFrame.current !== null) return;
      pointerFrame.current = frame(() => {
        pointerFrame.current = null;
        const b = latest.current.binding;
        if (b?.crosshair && b.group !== "none")
          b.channel.publish({
            kind: "crosshair",
            source: b.id,
            group: b.group,
            point: nextPointer.current,
          });
      });
    },
    leave: () => {
      cancelFrame(pointerFrame.current);
      pointerFrame.current = null;
      nextPointer.current = null;
      const b = latest.current.binding;
      if (b?.crosshair && b.group !== "none")
        b.channel.publish({
          kind: "crosshair",
          source: b.id,
          group: b.group,
          point: null,
        });
    },
  };
}
