import { useLayoutEffect, useRef, useState } from 'react';
import type { ChartDrawingLayer } from '@/lib/chart-drawing';
import { DrawingShapes } from './DrawingShapes';
import type { Drawing, DrawingPoint, DrawingTool } from './types';

const MAX_TIME = 8_640_000_000_000_000;
const MAX_PRICE = 1e12;
const MIN_PRICE = Number.MIN_VALUE;

type Gesture = {
  original: Drawing;
  start: DrawingPoint;
  screenStart: { x: number; y: number };
  handle: string | null;
  logarithmic: boolean;
} & (
  | { mode: 'create'; pointerId: number | null; anchored: boolean }
  | { mode: 'edit'; pointerId: number }
);

type Props = {
  drawings: readonly Drawing[];
  onChange: (drawings: Drawing[]) => void;
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  scope: string;
  enabled?: boolean;
  active?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function freePoint(point: DrawingPoint, logarithmic: boolean): DrawingPoint {
  return {
    time: Math.round(clamp(point.time, 0, MAX_TIME)),
    price: clamp(point.price, logarithmic ? MIN_PRICE : -MAX_PRICE, MAX_PRICE),
  };
}

function handlePoints(gesture: Gesture, point: DrawingPoint, horizontal: boolean) {
  const { handle, original } = gesture;
  const points = original.points.map((anchor) => ({ ...anchor }));
  switch (handle) {
    case '0':
      points[0] = horizontal ? { ...point, price: points[1].price } : point;
      break;
    case '1':
      points[1] = horizontal ? { ...point, price: points[0].price } : point;
      break;
    case 'corner-01':
      points[0].time = point.time;
      points[1].price = point.price;
      break;
    case 'corner-10':
      points[1].time = point.time;
      points[0].price = point.price;
      break;
    case 'time-0':
      points[0].time = point.time;
      break;
    case 'time-1':
      points[1].time = point.time;
      break;
    case 'price-0':
      points[0].price = point.price;
      break;
    case 'price-1':
      points[1].price = point.price;
      break;
  }
  return points;
}

// Based on ICT Toolbox's useAnnotationDrawing. The saved anchors are absolute
// time/price coordinates so interval changes do not shift drawings.
function gesturePoints(gesture: Gesture, point: DrawingPoint, shiftKey: boolean) {
  const { original, start } = gesture;
  const horizontal = shiftKey && original.type === 'line';
  if (gesture.mode === 'create') {
    if (original.type === 'ray') return [point];
    return [start, horizontal ? { ...point, price: start.price } : point];
  }
  if (gesture.handle) return handlePoints(gesture, point, horizontal);

  const times = original.points.map((anchor) => anchor.time);
  const prices = original.points.map((anchor) => anchor.price);
  const timeOffset = clamp(point.time - start.time, -Math.min(...times), MAX_TIME - Math.max(...times));
  const priceOffset = clamp(point.price - start.price, -MAX_PRICE - Math.min(...prices), MAX_PRICE - Math.max(...prices));
  // On a log axis, equal vertical movement is a percentage change.
  const ratio = gesture.logarithmic
    ? clamp(point.price / start.price, MIN_PRICE / Math.min(...prices), MAX_PRICE / Math.max(...prices))
    : 1;
  return original.points.map((anchor) => freePoint({
    time: anchor.time + timeOffset,
    price: gesture.logarithmic ? anchor.price * ratio : anchor.price + priceOffset,
  }, gesture.logarithmic));
}

function samePoints(first: DrawingPoint[], second: DrawingPoint[]) {
  return first.length === second.length && first.every((point, index) => (
    point.time === second[index].time && point.price === second[index].price
  ));
}

function validGeometry(drawing: Drawing) {
  const [first, last] = drawing.points;
  if (!first || drawing.points.some((point) => !Number.isFinite(point.time) || !Number.isFinite(point.price))) {
    return false;
  }
  if (drawing.type === 'ray') return true;
  if (!last) return false;
  if (drawing.type === 'box') return first.time !== last.time && first.price !== last.price;
  return first.time !== last.time || first.price !== last.price;
}

function drawingHit(target: EventTarget) {
  return target instanceof Element ? target.closest('[data-annotation-id]') : null;
}

export function useChartDrawings({
  drawings,
  onChange,
  tool,
  onToolChange,
  scope,
  enabled = true,
  active = true,
}: Props) {
  const [selection, setSelection] = useState<string | null>(null);
  const [draft, setDraft] = useState<Drawing | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const selectedId = drawings.some((drawing) => drawing.id === selection) ? selection : null;

  function cancel() {
    gesture.current = null;
    setDraft(null);
  }

  useLayoutEffect(() => {
    setSelection(null);
  }, [scope]);

  useLayoutEffect(() => {
    cancel();
  }, [scope, tool, enabled]);

  useLayoutEffect(() => {
    if (!active) {
      cancel();
      setSelection(null);
    }
  }, [active]);

  function deleteSelected() {
    if (!selectedId) return;
    cancel();
    onChange(drawings.filter((drawing) => drawing.id !== selectedId));
    setSelection(null);
  }

  const objects = draft
    ? drawings.some((drawing) => drawing.id === draft.id)
      ? drawings.map((drawing) => drawing.id === draft.id ? draft : drawing)
      : [...drawings, draft]
    : drawings;

  const layer: ChartDrawingLayer = {
    cursor: tool !== 'select' && active && enabled ? 'crosshair' : 'default',
    render: (projection) => (
      <DrawingShapes
        drawings={objects}
        projection={projection}
        selectedId={draft?.id ?? selectedId}
        draftId={draft?.id}
        onSelect={setSelection}
      />
    ),
    renderBackground: (projection) => (
      <DrawingShapes drawings={objects} projection={projection} background />
    ),
    down: (rawPoint, event, projection) => {
      if (!enabled) return false;
      const logarithmic = projection.priceScale === 'log';
      const point = freePoint(rawPoint, logarithmic);
      const screenStart = { x: event.clientX, y: event.clientY };
      if (tool === 'select') {
        const hit = drawingHit(event.target);
        const drawing = drawings.find(({ id }) => id === hit?.getAttribute('data-annotation-id'));
        setSelection(drawing?.id ?? null);
        if (!drawing) return false;
        const handle = (event.target as Element)
          .closest('[data-annotation-handle]')?.getAttribute('data-annotation-handle') ?? null;
        gesture.current = {
          mode: 'edit', original: drawing, start: point, screenStart, handle, logarithmic,
          pointerId: event.pointerId,
        };
      } else {
        const current = gesture.current;
        if (current?.mode === 'create' && current.anchored) {
          current.pointerId = event.pointerId;
        } else {
          const drawing: Drawing = {
            id: globalThis.crypto.randomUUID?.() ?? globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-'),
            type: tool,
            points: tool === 'ray' ? [point] : [point, point],
          };
          gesture.current = {
            mode: 'create', original: drawing, start: point, screenStart, handle: null, logarithmic,
            pointerId: event.pointerId, anchored: false,
          };
          setSelection(null);
          setDraft(drawing);
        }
      }
      event.currentTarget.focus({ preventScroll: true });
      return true;
    },
    move: (rawPoint, event) => {
      const current = gesture.current;
      if (!current || (current.pointerId !== null && event.pointerId !== current.pointerId)) return;
      const points = gesturePoints(current, freePoint(rawPoint, current.logarithmic), event.shiftKey);
      setDraft({ ...current.original, points });
    },
    up: (rawPoint, event) => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const point = freePoint(rawPoint, current.logarithmic);
      const points = gesturePoints(current, point, event.shiftKey);
      const drawing = { ...current.original, points };
      const moved = Math.hypot(
        event.clientX - current.screenStart.x,
        event.clientY - current.screenStart.y,
      ) >= 3;
      if (current.mode === 'create' && drawing.type !== 'ray' && (
        (!current.anchored && !moved) || !validGeometry(drawing)
      )) {
        current.anchored = true;
        current.pointerId = null;
        setDraft(drawing);
        return;
      }
      cancel();
      if (!validGeometry(drawing)) return;
      if (current.mode === 'create') {
        onChange([...drawings, drawing]);
        setSelection(drawing.id);
        onToolChange('select');
      } else if (moved && !samePoints(points, current.original.points)) {
        onChange(drawings.map((object) => object.id === drawing.id ? drawing : object));
      }
    },
    cancel,
    doubleClick: (event) => Boolean(drawingHit(event.target)),
    key: (event) => {
      if (!active) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
        setSelection(null);
        onToolChange('select');
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        deleteSelected();
      }
    },
  };

  return { layer, selectedId, deleteSelected };
}
