import { useLayoutEffect, useRef, useState } from "react";

type ChartSize = { width: number; height: number };

export function useChartSize(compact: boolean, hasHeader: boolean) {
  const host = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  // Deterministic SSR fallback only. CSS owns the actual compact, responsive,
  // flex-pane and fullscreen dimensions, measured before the first paint.
  const [size, setSize] = useState<ChartSize>(() => ({
    width: 1000,
    height: compact ? 350 : 420,
  }));

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const legend = header.current;
    let active = true;
    const update = (width: number, height: number) => {
      if (!active || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      // Ignore sub-centipixel noise and transient hidden/collapsed panes.
      const next = { width: Math.round(width * 100) / 100, height: Math.round(height * 100) / 100 };
      if (next.width <= 0 || next.height <= 0) return;
      setSize(previous => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    const measureHeader = () => {
      const height = legend?.getBoundingClientRect().height ?? 0;
      if (active && height > 0) setHeaderHeight(Math.ceil(height));
    };
    const measure = () => {
      const rect = element.getBoundingClientRect();
      update(rect.width, rect.height);
      measureHeader();
    };
    measure();
    const observer = typeof globalThis.ResizeObserver === "undefined" ? null : new globalThis.ResizeObserver(entries => {
      const entry = entries.find(item => item.target === element);
      if (entry) update(entry.contentRect.width, entry.contentRect.height);
      if (entries.some(item => item.target === legend)) measureHeader();
    });
    observer?.observe(element);
    if (legend) observer?.observe(legend, { box: 'border-box' });
    // Also covers CSS breakpoint changes and the no-ResizeObserver fallback.
    window.addEventListener("resize", measure);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [compact, hasHeader]);

  return { host, size, header, headerHeight: hasHeader ? headerHeight : 0 };
}
