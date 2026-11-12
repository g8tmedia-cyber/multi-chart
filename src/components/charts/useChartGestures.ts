import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { Candle } from '@/lib/trading-types';
import type { ChartDrawingLayer, ChartProjection } from '@/lib/chart-drawing';
import { defaultChartCount } from '@/lib/chart-geometry';
import {
  panPriceRange,
  scalePriceRange,
  type PriceRange,
} from '@/lib/chart-price-scale';
import type { ChartHistory } from '@/components/charts/useChartHistory';
import type { ChartInteractionState } from '@/components/charts/useChartInteractionState';
import type { ChartPriceScale } from '@/components/charts/useChartPriceScale';
import type { ChartViewport } from '@/components/charts/useChartViewport';
import type { useChartSynchronization } from '@/components/charts/useChartSynchronization';

type Props = {
  host: RefObject<HTMLDivElement | null>;
  size: { width: number; height: number };
  candles: Candle[];
  marketView: boolean;
  drawingLayer?: ChartDrawingLayer;
  projection: ChartProjection;
  plotWidth: number;
  top: number;
  bottom: number;
  priceBottom: number;
  viewport: ChartViewport;
  price: ChartPriceScale;
  history: ChartHistory;
  interaction: ChartInteractionState;
  synchronize: ReturnType<typeof useChartSynchronization>;
  restoreAutomatic: () => void;
  reset: () => void;
  zoom: (factor: number) => void;
};

// Drawing tools receive pointer input before viewport gestures.
export function useChartGestures({
  host,
  size,
  candles,
  marketView,
  drawingLayer,
  projection,
  plotWidth,
  top,
  bottom,
  priceBottom,
  viewport,
  price,
  history,
  interaction,
  synchronize,
  restoreAutomatic,
  reset,
  zoom,
}: Props) {
  const {
    rangeRef,
    setRange,
    following,
    clampRange,
    zoomRange,
    applyPanOffset,
    commitPan,
  } = viewport;
  const {
    priceScale,
    priceRatio,
    setManualPrice,
    priceRef,
    activeManualPrice,
  } = price;
  const { manualDrag, drag, points, setPointer, setPanning } = interaction;
  const gestureBounds = useRef<globalThis.DOMRect | null>(null);
  const priceFrame = useRef<number | null>(null);
  const pendingPrice = useRef<PriceRange | null>(null);
  const flushPrice = () => {
    if (priceFrame.current !== null)
      globalThis.cancelAnimationFrame(priceFrame.current);
    priceFrame.current = null;
    const next = pendingPrice.current;
    pendingPrice.current = null;
    if (next) {
      priceRef.current = next;
      setManualPrice(next);
    }
  };
  const queuePrice = (next: PriceRange, forceManual = false) => {
    const current = pendingPrice.current ?? priceRef.current;
    if (!forceManual && current.min === next.min && current.max === next.max)
      return;
    pendingPrice.current = next;
    if (priceFrame.current === null)
      priceFrame.current = globalThis.requestAnimationFrame(() => {
        priceFrame.current = null;
        const queued = pendingPrice.current;
        pendingPrice.current = null;
        if (queued) {
          priceRef.current = queued;
          setManualPrice(queued);
        }
      });
  };
  useEffect(
    () => () => {
      if (priceFrame.current !== null)
        globalThis.cancelAnimationFrame(priceFrame.current);
    },
    [],
  );
  const historyScrollIntent = history.intent;
  const historyBoundary = history.boundary;
  const previousPriceScale = useRef(priceScale);
  useEffect(() => {
    if (previousPriceScale.current === priceScale) return;
    previousPriceScale.current = priceScale;
    drawingLayer?.cancel();
    manualDrag.current = false;
    points.current.clear();
    drag.current = null;
    pendingPrice.current = null;
    if (priceFrame.current !== null)
      globalThis.cancelAnimationFrame(priceFrame.current);
    priceFrame.current = null;
    applyPanOffset(0);
    setPanning(false);
    setPointer(null);
  }, [
    priceScale,
    drawingLayer,
    manualDrag,
    points,
    drag,
    setPointer,
    setPanning,
    applyPanOffset,
  ]);
  // Keep the native, non-passive wheel listener stable while its handler always
  // sees the latest lock, bounds and source window (including prepended history).
  const wheelHandler = useRef<(event: globalThis.WheelEvent) => void>(
    () => undefined,
  );
  wheelHandler.current = (event) => {
    event.preventDefault();
    following.current = false;
    const element = host.current;
    if (!element) return;
    const rect = element.getBoundingClientRect(),
      px =
        (event.clientX - rect.left) *
        (rect.width > 0 ? size.width / rect.width : 1),
      py =
        (event.clientY - rect.top) *
        (rect.height > 0 ? size.height / rect.height : 1);
    const factor = Math.exp(
      Math.max(-200, Math.min(200, event.deltaY)) * 0.003,
    );
    if (px >= plotWidth) {
      priceRatio.release();
      setManualPrice(scalePriceRange(priceRef.current, factor, priceScale));
      return;
    }
    historyScrollIntent.current = true;
    synchronize.interact();
    if (py >= bottom) {
      priceRatio.release();
      setManualPrice(priceRef.current);
    }
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      setRange(
        clampRange(
          {
            ...rangeRef.current,
            right:
              rangeRef.current.right +
              ((event.deltaX || event.deltaY) / plotWidth) *
                rangeRef.current.count,
          },
          candles.length,
          Boolean(drawingLayer),
        ),
      );
      return;
    }
    const next = zoomRange(
      rangeRef.current,
      factor,
      px / plotWidth,
      candles.length,
      Boolean(drawingLayer),
    );
    if (py < bottom)
      priceRatio.scaleTo(
        next.count,
        (py - top) / (priceBottom - top),
        priceRef.current,
      );
    setRange(next);
  };
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wheel = (event: globalThis.WheelEvent) => wheelHandler.current(event);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [host]);
  const locate = (e: PointerEvent<globalThis.SVGSVGElement>) => {
    const rect =
      points.current.has(e.pointerId) &&
      !manualDrag.current &&
      gestureBounds.current
        ? gestureBounds.current
        : e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * size.width) / Math.max(1, rect.width),
      y: ((e.clientY - rect.top) * size.height) / Math.max(1, rect.height),
    };
  };
  const down = (e: PointerEvent<globalThis.SVGSVGElement>) => {
    if (e.button !== 0 || e.defaultPrevented) return;
    const point = locate(e);
    if (
      point.x < plotWidth &&
      point.y >= top &&
      point.y < priceBottom &&
      drawingLayer?.down(projection.point(point.x, point.y), e, projection)
    ) {
      manualDrag.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    if ((e.target as Element).closest('[data-chart-event]')) return;
    const mode =
      point.y >= bottom ? 'time' : point.x >= plotWidth ? 'price' : 'pan';
    if (mode !== 'price') {
      historyScrollIntent.current = true;
      historyBoundary.current = null;
    }
    if (points.current.size) {
      flushPrice();
      commitPan(plotWidth);
    }
    gestureBounds.current = e.currentTarget.getBoundingClientRect();
    points.current.set(e.pointerId, point);
    if (mode !== 'price') {
      following.current = false;
      synchronize.interact();
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const all = [...points.current.values()];
    setPointer(null);
    synchronize.leave();
    setPanning(mode === 'pan' && all.length === 1);
    drag.current = {
      mode,
      x: point.x,
      y: point.y,
      price: { ...priceRef.current },
      right: rangeRef.current.right,
      count: rangeRef.current.count,
      verticalPan: Boolean(activeManualPrice || priceRatio.locked),
      ...(all.length === 2
        ? { distance: Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y) }
        : {}),
    };
  };
  const move = (e: PointerEvent<globalThis.SVGSVGElement>) => {
    const point = locate(e);
    const active = points.current.has(e.pointerId) && drag.current;
    if (manualDrag.current || !active) {
      const inside =
        point.x >= 0 &&
        point.x < plotWidth &&
        point.y >= top &&
        point.y < bottom;
      setPointer(inside ? point : null);
      const semantic = projection.point(point.x, point.y);
      const crosshair = projection.point(point.x, point.y, true);
      synchronize.pointer(
        inside ? { time: crosshair.time, price: semantic.price } : null,
      );
      drawingLayer?.move(semantic, e);
      return;
    }
    // A viewport gesture is not drawing hover or crosshair movement. Publishing
    // those states here used to force a full React commit for every pointer event.
    points.current.set(e.pointerId, point);
    const all = [...points.current.values()],
      initial = active;
    if (initial.mode === 'price') {
      if (Math.abs(point.y - initial.y) < 1) return;
      priceRatio.release();
      queuePrice(
        scalePriceRange(
          initial.price,
          Math.exp(Math.max(-6, Math.min(6, (point.y - initial.y) * 0.01))),
          priceScale,
        ),
      );
      return;
    }
    if (initial.mode === 'time') {
      if (Math.abs(point.x - initial.x) < 1) return;
      synchronize.interact();
      priceRatio.release();
      queuePrice(initial.price, !activeManualPrice);
      const factor = Math.exp(
        Math.max(-6, Math.min(6, (point.x - initial.x) * 0.01)),
      );
      const count = Math.max(
        marketView ? 1 : 15,
        Math.min(2500, initial.count * factor),
      );
      setRange({ right: initial.right, count });
      return;
    }
    if (all.length === 2 && initial.distance) {
      synchronize.interact();
      const distance = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
      const next = zoomRange(
        { right: initial.right, count: initial.count },
        initial.distance / Math.max(1, distance),
        (all[0].x + all[1].x) / 2 / plotWidth,
        candles.length,
        Boolean(drawingLayer),
      );
      priceRatio.scaleTo(
        next.count,
        ((all[0].y + all[1].y) / 2 - top) / (priceBottom - top),
        initial.price,
      );
      setRange(next);
      return;
    }
    const dx = point.x - initial.x;
    if (!initial.verticalPan) {
      setRange(
        clampRange(
          {
            count: initial.count,
            right: initial.right - (dx / plotWidth) * initial.count,
          },
          candles.length,
          Boolean(drawingLayer),
        ),
      );
      return;
    }
    // Preview manual pans with a transform and commit their price range on release.
    const dy = point.y - initial.y;
    applyPanOffset(dx, plotWidth, dy);
    pendingPrice.current = panPriceRange(
      initial.price,
      dy / (priceBottom - top),
      priceScale,
    );
  };
  const up = (e: PointerEvent<globalThis.SVGSVGElement>) => {
    if (manualDrag.current) {
      const point = locate(e);
      drawingLayer?.up(projection.point(point.x, point.y), e);
      manualDrag.current = false;
    }
    flushPrice();
    points.current.delete(e.pointerId);
    commitPan(plotWidth);
    const remaining = [...points.current.values()];
    if (remaining.length === 1) {
      const point = remaining[0];
      drag.current = {
        mode: 'pan',
        x: point.x,
        y: point.y,
        right: rangeRef.current.right,
        count: rangeRef.current.count,
        price: { ...priceRef.current },
        verticalPan: Boolean(activeManualPrice || priceRatio.locked),
      };
      setPanning(true);
    } else {
      drag.current = null;
      gestureBounds.current = null;
      setPanning(false);
    }
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* Capture may already have ended. */
    }
  };
  const cancel = (e: PointerEvent<globalThis.SVGSVGElement>) => {
    // Normal release also emits lostpointercapture; leave completed pans alone.
    if (!manualDrag.current && !points.current.has(e.pointerId)) return;
    if (manualDrag.current) {
      drawingLayer?.cancel();
      manualDrag.current = false;
    }
    if (drag.current?.mode === 'pan') {
      pendingPrice.current = null;
      if (priceFrame.current !== null)
        globalThis.cancelAnimationFrame(priceFrame.current);
      priceFrame.current = null;
    }
    // Auto-fit paints real ranges while held, unlike a translated pan. Restore
    // its (history-rebased) origin on cancellation, including queued frames.
    if (drag.current?.mode === 'pan' && !drag.current.verticalPan)
      setRange({ right: drag.current.right, count: drag.current.count });
    applyPanOffset(0);
    points.current.clear();
    up(e);
  };
  const doubleClick = (e: MouseEvent<globalThis.SVGSVGElement>) => {
    if (drawingLayer?.doubleClick?.(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect(),
      px = ((e.clientX - rect.left) * size.width) / Math.max(1, rect.width),
      py = ((e.clientY - rect.top) * size.height) / Math.max(1, rect.height);
    if (py >= bottom) {
      priceRatio.release();
      setManualPrice(priceRef.current);
      synchronize.interact();
      following.current = !marketView;
      setRange({
        right: candles.length + 6,
        count: defaultChartCount(candles.length, marketView),
      });
    } else if (px >= plotWidth) restoreAutomatic();
    else reset();
  };
  const keyboard = (e: KeyboardEvent<globalThis.SVGSVGElement>) => {
    drawingLayer?.key?.(e);
    if (e.defaultPrevented) return;
    if ((e.target as Element).closest('[data-chart-event]')) return;
    if (
      ['ArrowLeft', 'ArrowRight', '+', '=', '-', 'Home', 'End'].includes(e.key)
    )
      e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      synchronize.interact();
      following.current = false;
      if (e.key === 'ArrowLeft') {
        historyScrollIntent.current = true;
        historyBoundary.current = null;
      }
      setRange((r) =>
        clampRange(
          {
            ...r,
            right: r.right + ((e.key === 'ArrowLeft' ? -1 : 1) * r.count) / 5,
          },
          candles.length,
          Boolean(drawingLayer),
        ),
      );
    }
    if (e.key === '+' || e.key === '=') zoom(0.8);
    if (e.key === '-') zoom(1.25);
    if (e.key === 'Home' || e.key === 'End') reset();
    if (e.key === 'Escape') {
      setPointer(null);
      synchronize.leave();
    }
  };
  return { down, move, up, cancel, doubleClick, keyboard };
}
