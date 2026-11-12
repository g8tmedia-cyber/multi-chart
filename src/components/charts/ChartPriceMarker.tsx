import { useEffect, useState } from 'react';
import type { ChartProjection } from '@/lib/chart-drawing';
import { formatChartPrice } from '@/lib/number-format';
import type { Candle } from '@/lib/trading-types';

function formatCountdown(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const pad = (value: number) => String(value).padStart(2, '0');
  const clock = `${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  if (days > 0) return `${days}d ${pad(hours)}:${clock}`;
  return hours > 0 ? `${pad(hours)}:${clock}` : clock;
}

export default function ChartPriceMarker({ candle, closeAt, projection }: {
  candle: Candle;
  closeAt?: number;
  projection: ChartProjection;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (closeAt === undefined) return;
    let timer: number;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (at < closeAt) timer = window.setTimeout(tick, (closeAt - at) % 1000 || 1000);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [closeAt]);

  const { top, bottom, width } = projection;
  const y = projection.y(candle.close);
  if (!Number.isFinite(y) || y < top || y > bottom) return null;

  const remaining = closeAt === undefined ? 0 : Math.ceil((closeAt - now) / 1000);
  const countdown = remaining > 0 ? formatCountdown(remaining) : undefined;
  const height = countdown ? 35 : 20;
  const position = Math.max(top, Math.min(bottom - height, y - height / 2));
  const tone = candle.close >= candle.open ? 'up' : 'down';

  return <g data-price-tag={tone} pointerEvents="none">
    <rect x={width} y={position} width="78" height={height} rx="2" />
    <text x={width + 7} y={position + 14} className="chart-axis-text">{formatChartPrice(candle.close)}</text>
    {countdown && <text x={width + 7} y={position + 28} className="chart-axis-text chart-countdown"
      aria-label={`Candle closes in ${countdown}`} data-candle-countdown>{countdown}</text>}
  </g>;
}
