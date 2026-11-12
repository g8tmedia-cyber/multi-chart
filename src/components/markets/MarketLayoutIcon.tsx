import { MARKET_LAYOUTS, type MarketLayout } from '@/lib/markets-workspace';

const layoutColumns: Record<MarketLayout, number> = {
  single: 1,
  two_columns: 2,
  two_rows: 1,
  four: 2,
  six: 3,
  eight: 4,
};

export default function MarketLayoutIcon({
  layout,
  className = '',
}: {
  layout: MarketLayout;
  className?: string;
}) {
  const count = MARKET_LAYOUTS[layout].count;
  const columns = layoutColumns[layout];
  const rows = count / columns;
  const gap = 2;
  const width = (28 - gap * (columns - 1)) / columns;
  const height = (20 - gap * (rows - 1)) / rows;

  return (
    <svg
      width="32"
      height="24"
      viewBox="0 0 32 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={'h-6 w-8 shrink-0 ' + className}
      aria-hidden="true"
      focusable="false"
      data-market-layout-icon={layout}
    >
      {Array.from({ length: count }, (_, index) => (
        <rect
          key={index}
          x={2 + (index % columns) * (width + gap)}
          y={2 + Math.floor(index / columns) * (height + gap)}
          width={width}
          height={height}
          rx="1"
        />
      ))}
    </svg>
  );
}
