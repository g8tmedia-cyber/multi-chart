import type { ChartProjection } from '@/lib/chart-drawing';
import type { Drawing } from './types';

const labels: Record<Drawing['type'], string> = {
  ray: 'Horizontal ray',
  line: 'Trend line',
  box: 'Rectangle',
};

type Props = {
  drawings: readonly Drawing[];
  projection: ChartProjection;
  selectedId?: string | null;
  draftId?: string;
  onSelect?: (id: string) => void;
  background?: boolean;
};

// Adapted from ICT Toolbox's AnnotationShapes. Pan previews use the saved ray
// anchor and adjust the right edge independently of the translated artwork.
export function DrawingShapes({
  drawings,
  projection,
  selectedId,
  draftId,
  onSelect,
  background = false,
}: Props) {
  const { x, y, width } = projection;
  return (
    <g data-manual-layer={background ? 'background' : 'foreground'}>
      {drawings.map((drawing) => {
        const [first, last = first] = drawing.points;
        if (!first || !last) return null;
        if (projection.priceScale === 'log' && Math.min(first.price, last.price) <= 0) return null;
        const x1 = x(first.time);
        const x2 = x(last.time);
        const y1 = y(first.price);
        const y2 = y(last.price);
        if (![x1, x2, y1, y2].every(Number.isFinite)) return null;
        const color = drawing.color ?? 'var(--drawing-accent, #38bdf8)';
        const rectangle = {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.max(1, Math.abs(x2 - x1)),
          height: Math.max(1, Math.abs(y2 - y1)),
        };
        if (background) {
          return drawing.type === 'box' && (
            <rect
              key={drawing.id}
              data-annotation-fill={drawing.id}
              {...rectangle}
              fill={color}
              fillOpacity={0.15}
              pointerEvents="none"
            />
          );
        }

        const preview = draftId === drawing.id;
        const selected = selectedId === drawing.id;
        const ray = drawing.type === 'ray';
        const line = { x1, y1, x2: ray ? width : x2, y2: ray ? y1 : y2 };
        const stroke = { stroke: color, strokeWidth: selected ? 2 : 1.3 };
        const cornerCursor = (x2 - x1) * (y2 - y1) >= 0 ? 'nwse-resize' : 'nesw-resize';
        const otherCornerCursor = cornerCursor === 'nwse-resize' ? 'nesw-resize' : 'nwse-resize';
        const handle = (cx: number, cy: number, id: string, cursor = 'move') => (
          <circle
            key={id}
            data-annotation-handle={id}
            cx={cx}
            cy={cy}
            r={5}
            fill="var(--chart-handle-fill, #10151f)"
            stroke={color}
            strokeWidth={1.5}
            style={{ cursor }}
          />
        );

        return (
          <g
            key={drawing.id}
            data-chart-event={preview ? undefined : ''}
            data-annotation-id={preview ? undefined : drawing.id}
            data-pan-ray-group={ray ? width : undefined}
            data-pan-ray-anchor={ray ? x1 : undefined}
            data-selected={selected}
            visibility={ray && x1 > width ? 'hidden' : undefined}
            role={preview ? undefined : 'button'}
            tabIndex={preview ? undefined : 0}
            aria-label={preview ? undefined : labels[drawing.type]}
            aria-pressed={preview ? undefined : selected}
            pointerEvents={preview ? 'none' : undefined}
            style={{ cursor: preview ? 'inherit' : 'move' }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onSelect?.(drawing.id);
              }
            }}
          >
            {!preview && <title>{labels[drawing.type]}</title>}
            {drawing.type === 'box' ? (
              <>
                <rect {...rectangle} fill="transparent" {...stroke} />
                {selected && [
                  handle(x1, y1, '0', cornerCursor),
                  handle(x2, y2, '1', cornerCursor),
                  handle(x1, y2, 'corner-01', otherCornerCursor),
                  handle(x2, y1, 'corner-10', otherCornerCursor),
                  handle(x1, (y1 + y2) / 2, 'time-0', 'ew-resize'),
                  handle(x2, (y1 + y2) / 2, 'time-1', 'ew-resize'),
                  handle((x1 + x2) / 2, y1, 'price-0', 'ns-resize'),
                  handle((x1 + x2) / 2, y2, 'price-1', 'ns-resize'),
                ]}
              </>
            ) : (
              <>
                <line
                  {...line}
                  {...stroke}
                  data-annotation-ray={ray ? '' : undefined}
                  data-pan-ray-edge={ray ? width : undefined}
                  visibility={ray ? (x1 > width ? 'hidden' : 'visible') : undefined}
                />
                {!preview && (
                  <line
                    {...line}
                    data-pan-ray-edge={ray ? width : undefined}
                    visibility={ray ? (x1 > width ? 'hidden' : 'visible') : undefined}
                    stroke="transparent"
                    strokeWidth={14}
                  />
                )}
                {selected && handle(x1, y1, '0')}
                {selected && !ray && handle(x2, y2, '1')}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}
