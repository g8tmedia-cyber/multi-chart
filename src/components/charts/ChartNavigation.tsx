import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ChartControlsContext } from './chart-contracts';

const hoverMargin = 32;

export default function ChartNavigation({ pan, zoom, reset }: Pick<ChartControlsContext, 'pan' | 'zoom' | 'reset'>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const navigation = ref.current;
    const plot = navigation?.closest<HTMLElement>('[data-chart-plot]');
    if (!navigation || !plot) return;

    // Observe the plot directly so the reveal area never intercepts chart gestures.
    const trackPointer = ({ clientX, clientY, pointerType }: PointerEvent) => {
      if (pointerType === 'touch') return;
      const { left, right, top, bottom } = navigation.getBoundingClientRect();
      const near = clientX >= left - hoverMargin && clientX <= right + hoverMargin &&
        clientY >= top - hoverMargin && clientY <= bottom + hoverMargin;
      navigation.toggleAttribute('data-pointer-near', near);
    };
    const hide = () => navigation.removeAttribute('data-pointer-near');

    plot.addEventListener('pointerenter', trackPointer, { passive: true });
    plot.addEventListener('pointermove', trackPointer, { passive: true });
    plot.addEventListener('pointerleave', hide);
    plot.addEventListener('pointercancel', hide);
    return () => {
      plot.removeEventListener('pointerenter', trackPointer);
      plot.removeEventListener('pointermove', trackPointer);
      plot.removeEventListener('pointerleave', hide);
      plot.removeEventListener('pointercancel', hide);
    };
  }, []);

  return (
    <div ref={ref} className="chart-navigation" role="group" aria-label="Chart navigation">
      <button aria-label="Pan to older candles" title="Pan left" onClick={() => pan(-1)}><ChevronLeft size={15} /></button>
      <button aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.25)}><Minus size={15} /></button>
      <button aria-label="Reset chart view" aria-keyshortcuts="Alt+R" title="Reset chart view (Alt+R)" onClick={reset}><RotateCcw size={14} /></button>
      <button aria-label="Zoom in" title="Zoom in" onClick={() => zoom(0.8)}><Plus size={15} /></button>
      <button aria-label="Pan to newer candles" title="Pan right" onClick={() => pan(1)}><ChevronRight size={15} /></button>
    </div>
  );
}
