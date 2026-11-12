import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ChartView, ChartViewAction } from '@/lib/chart-types';

export function sameChartView(a: ChartView, b: ChartView): boolean {
 return a.right === b.right && a.count === b.count && a.min === b.min && a.max === b.max
  && a.timeZone === b.timeZone && a.priceScale === b.priceScale && a.priceBarRatio === b.priceBarRatio;
}

// Only explicit interactions enter history. Quotes, prepends, replay clocks,
// resize, hydration and the persistence debounce must never become undo steps.
export function useChartActionObserver(view: ChartView, onAction?: (action: ChartViewAction) => void) {
 const current = useRef(view), notify = useRef(onAction);
 current.current = view; notify.current = onAction;
 const pending = useRef<{ before: ChartView; kind: ChartViewAction['kind'] } | null>(null);
 const pointers = useRef(new Set<number>()), frame = useRef<number | null>(null);
 const commit = useCallback(() => {
  if (pointers.current.size || !pending.current) return;
  const action = pending.current; pending.current = null;
  if (!sameChartView(action.before, current.current)) notify.current?.({ ...action, after: current.current });
 }, []);
 useLayoutEffect(() => {
  if (!pointers.current.size && pending.current && !sameChartView(pending.current.before, view)) commit();
 });
 const settle = useCallback(() => {
  if (!notify.current || pointers.current.size) return;
  if (frame.current !== null) globalThis.cancelAnimationFrame(frame.current);
  frame.current = globalThis.requestAnimationFrame(() => { frame.current = null; commit(); });
 }, [commit]);
 const begin = useCallback((kind: ChartViewAction['kind'] = 'control') => {
  if (!notify.current) return;
  if (!pointers.current.size && pending.current && pending.current.kind !== kind) commit();
  if (!pending.current) pending.current = { before: current.current, kind };
 }, [commit]);
 const clear = useCallback(() => {
  if (frame.current !== null) globalThis.cancelAnimationFrame(frame.current);
  frame.current = null; pending.current = null; pointers.current.clear();
 }, []);
 useEffect(() => clear, [clear]);
 const run = <Args extends unknown[]>(action: (...args: Args) => void, ...args: Args) => {
  begin(); action(...args); settle();
 };
 return { begin, settle, clear, run,
  pointerDown: (id: number) => { begin('gesture'); if (notify.current) pointers.current.add(id); },
  pointerUp: (id: number) => { pointers.current.delete(id); settle(); },
  pointerCancel: (id: number) => { if (pointers.current.has(id)) clear(); },
 };
}
export type ChartActionObserver = ReturnType<typeof useChartActionObserver>;
