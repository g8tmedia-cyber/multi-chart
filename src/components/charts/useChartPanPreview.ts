import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefCallback,
} from 'react';
import { collectPanTargets, paintPanTargets } from './chart-pan-targets';

// A pan is a visual translation until release, not a succession of expensive
// SVG reconstructions. Keep only the newest pointer sample for each paint.
export function useChartPanPreview() {
  const panLayerRef = useRef<globalThis.SVGGElement | null>(null);
  const timePanLayerRef = useRef<globalThis.SVGGElement | null>(null);
  const priceLayers = useRef(new Set<globalThis.SVGGElement>());
  const offset = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const targets = useRef<ReturnType<typeof collectPanTargets> | null>(null);
  const write = useCallback(() => {
    const { x, y } = offset.current;
    const horizontal = x === 0 ? '' : `translateX(${x}px)`;
    const vertical = y === 0 ? '' : `translateY(${y}px)`;
    const update = (
      element: globalThis.SVGGElement | null,
      transform: string,
    ) => {
      if (!element) return;
      // Avoid needless style mutations (and SVG invalidations) on a still axis.
      if (element.style.transform !== transform)
        element.style.transform = transform;
      const hint = transform ? 'transform' : '';
      if (element.style.willChange !== hint) element.style.willChange = hint;
    };
    update(
      panLayerRef.current,
      [horizontal, vertical].filter(Boolean).join(' '),
    );
    if (!targets.current)
      targets.current = collectPanTargets(panLayerRef.current);
    paintPanTargets(targets.current, x, y);
    update(timePanLayerRef.current, horizontal);
    for (const layer of priceLayers.current) update(layer, vertical);
  }, []);
  // A worker reply or arriving candle may update the SVG during a held pan.
  // Rebind targets and reapply edges before paint, without restarting the drag.
  useLayoutEffect(() => {
    targets.current = null;
    if (offset.current.x !== 0 || offset.current.y !== 0) write();
  });
  const clear = useCallback(() => {
    if (
      frame.current === null &&
      offset.current.x === 0 &&
      offset.current.y === 0
    )
      return;
    if (frame.current !== null) globalThis.cancelAnimationFrame(frame.current);
    frame.current = null;
    offset.current = { x: 0, y: 0 };
    write();
  }, [write]);
  const translate = useCallback(
    (x: number, y: number) => {
      if (x === 0 && y === 0) {
        clear();
        return;
      }
      offset.current = { x, y };
      if (frame.current === null)
        frame.current = globalThis.requestAnimationFrame(() => {
          frame.current = null;
          write();
        });
    },
    [clear, write],
  );
  // React 19 callback-ref cleanup lets independent price markers, trades, labels
  // and the last-price line share the exact same Y transform without a render.
  const pricePanLayerRef: RefCallback<globalThis.SVGGElement> = useCallback(
    (node: globalThis.SVGGElement | null) => {
      if (!node) return;
      priceLayers.current.add(node);
      write();
      return () => {
        priceLayers.current.delete(node);
      };
    },
    [write],
  );
  useEffect(() => clear, [clear]);
  return {
    panLayerRef,
    timePanLayerRef,
    pricePanLayerRef,
    offset,
    translate,
    clear,
  };
}
