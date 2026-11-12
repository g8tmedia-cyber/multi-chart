import {
  Children,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  equalMarketGridSizes,
  MARKET_LAYOUTS,
  type MarketGridSizes,
  type MarketLayout,
} from '@/lib/markets-workspace';

type Axis = 'columns' | 'rows';
type Drag = {
  axis: Axis;
  index: number;
  origin: number;
  extent: number;
  sizes: MarketGridSizes;
};
type Props = {
  layout: MarketLayout;
  maximized: number | null;
  paneIds: string[];
  sizes: Record<string, MarketGridSizes>;
  onResize: (columns: number, sizes: MarketGridSizes) => void;
  children: ReactNode[];
};
export function adjustMarketDivider(
  sizes: MarketGridSizes,
  axis: Axis,
  index: number,
  delta: number,
): MarketGridSizes {
  const values = [...sizes[axis]],
    total = values[index] + values[index + 1];
  if (!Number.isFinite(total) || !Number.isFinite(delta)) return sizes;
  const minimum = Math.min(15, 100 / values.length / 2);
  values[index] = Math.max(
    minimum,
    Math.min(total - minimum, values[index] + delta),
  );
  values[index + 1] = total - values[index];
  return { ...sizes, [axis]: values };
}
export default function MarketGrid({
  layout,
  maximized,
  paneIds,
  sizes,
  onResize,
  children,
}: Props) {
  const root = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null),
    draftRef = useRef<MarketGridSizes | null>(null);
  const [viewport, setViewport] = useState(0),
    [draft, setDraft] = useState<MarketGridSizes | null>(null);
  useEffect(() => {
    const update = () => setViewport(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const definition = MARKET_LAYOUTS[layout],
    columns =
      viewport < 640
        ? 1
        : viewport < 1024
          ? Math.min(2, definition.columns)
          : definition.columns;
  const count = definition.count,
    key = layout + ':' + columns;
  const current = draft ?? sizes[key] ?? equalMarketGridSizes(count, columns),
    rows = current.rows.length;
  useEffect(() => {
    drag.current = null;
    draftRef.current = null;
    setDraft(null);
  }, [layout, columns, maximized]);
  const start = (
    event: PointerEvent<HTMLDivElement>,
    axis: Axis,
    index: number,
  ) => {
    if (event.button !== 0 || !root.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = root.current.getBoundingClientRect();
    drag.current = {
      axis,
      index,
      origin: axis === 'columns' ? event.clientX : event.clientY,
      extent: Math.max(1, axis === 'columns' ? rect.width : rect.height),
      sizes: current,
    };
    draftRef.current = current;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const initial = drag.current;
    if (!initial) return;
    const coordinate =
      initial.axis === 'columns' ? event.clientX : event.clientY;
    const next = adjustMarketDivider(
      initial.sizes,
      initial.axis,
      initial.index,
      ((coordinate - initial.origin) / initial.extent) * 100,
    );
    draftRef.current = next;
    setDraft(next);
  };
  const finish = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (!drag.current) return;
    if (commit && draftRef.current) onResize(columns, draftRef.current);
    drag.current = null;
    draftRef.current = null;
    setDraft(null);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      /* Capture may have ended outside the grid. */
    }
  };
  const reset = () => {
    drag.current = null;
    draftRef.current = null;
    setDraft(null);
    onResize(columns, equalMarketGridSizes(count, columns));
  };
  const keyboard = (
    event: KeyboardEvent<HTMLDivElement>,
    axis: Axis,
    index: number,
  ) => {
    if (event.key === 'Home') {
      event.preventDefault();
      reset();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      drag.current = null;
      draftRef.current = null;
      setDraft(null);
      return;
    }
    const negative = axis === 'columns' ? 'ArrowLeft' : 'ArrowUp',
      positive = axis === 'columns' ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== negative && event.key !== positive) return;
    event.preventDefault();
    onResize(
      columns,
      adjustMarketDivider(
        current,
        axis,
        index,
        (event.key === negative ? -1 : 1) * (event.shiftKey ? 5 : 2),
      ),
    );
  };
  const separator = (axis: Axis, index: number) => {
    const values = current[axis],
      percentage = values
        .slice(0, index + 1)
        .reduce((sum, value) => sum + value, 0);
    const offset = index + 0.5 - (percentage / 100) * (values.length - 1);
    const style: CSSProperties =
      axis === 'columns'
        ? { left: 'calc(' + percentage + '% + ' + offset + 'px)' }
        : { top: 'calc(' + percentage + '% + ' + offset + 'px)' };
    return (
      <div
        key={axis + index}
        role="separator"
        tabIndex={0}
        aria-label={
          'Resize chart ' + axis + ' ' + (index + 1) + ' and ' + (index + 2)
        }
        aria-orientation={axis === 'columns' ? 'vertical' : 'horizontal'}
        aria-valuemin={5}
        aria-valuemax={95}
        aria-valuenow={Math.round(percentage)}
        className={
          'market-divider ' +
          (axis === 'columns' ? 'market-divider-column' : 'market-divider-row')
        }
        style={style}
        onPointerDown={(event) => start(event, axis, index)}
        onPointerMove={move}
        onPointerUp={(event) => finish(event, true)}
        onPointerCancel={(event) => finish(event, false)}
        onDoubleClick={reset}
        onKeyDown={(event) => keyboard(event, axis, index)}
      />
    );
  };
  const nodes = Children.toArray(children);
  const tracks = (values: number[]) =>
    maximized === null
      ? values.map((value) => 'minmax(0, ' + value + 'fr)').join(' ')
      : 'minmax(0, 1fr)';
  const gridStyle = {
    '--market-row-count': maximized === null ? rows : 1,
    gridTemplateColumns: tracks(current.columns),
    gridTemplateRows: tracks(current.rows),
  } as CSSProperties;
  return (
    <div
      ref={root}
      data-market-layout={layout}
      data-market-columns={columns}
      data-market-maximized={maximized !== null}
      className="market-grid"
      style={gridStyle}
    >
      {nodes.map((node, index) => (
        <div
          key={paneIds[index]}
          hidden={maximized !== null && maximized !== index}
          className="market-grid-cell"
        >
          {node}
        </div>
      ))}
      {maximized === null &&
        columns > 1 &&
        current.columns
          .slice(0, -1)
          .map((_, index) => separator('columns', index))}
      {maximized === null &&
        rows > 1 &&
        current.rows.slice(0, -1).map((_, index) => separator('rows', index))}
    </div>
  );
}
