export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const INTERVALS = [
  '1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h',
  '8h', '12h', '1d', '3d', '1w', '1M',
] as const;
export type Interval = (typeof INTERVALS)[number];

const durations: Record<Interval, number> = {
  '1s': 1000, '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000,
  '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000,
  '6h': 21600000, '8h': 28800000, '12h': 43200000, '1d': 86400000,
  '3d': 259200000, '1w': 604800000, '1M': 2678400000,
};

export const duration = (interval: Interval): number => durations[interval];

export function candleEnd(time: number, interval: Interval): number {
  if (interval !== '1M') return time + duration(interval);
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}
