import type { Interval } from '../lib/trading-types';

export type TradingViewSymbol = { symbol: string; name: string; exchange: string; type: string };

// The minute/hour conversion follows ICT Toolbox's tradingViewTimeframe.
const timeframes = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '2h': '120', '4h': '240', '1d': '1D', '1w': '1W', '1M': '1M',
} satisfies Partial<Record<Interval, string>>;

export const TRADINGVIEW_INTERVALS: readonly Interval[] = Object.keys(timeframes) as (keyof typeof timeframes)[];

export function tradingViewTimeframe(interval: string): string | undefined {
  if (!Object.hasOwn(timeframes, interval)) return;
  return timeframes[interval as keyof typeof timeframes];
}

export function isTradingViewSymbol(symbol: string): boolean {
  return /^[\p{L}\p{N}_.-]{1,32}:[\p{L}\p{N}_.!/@%&'$+-]{1,64}$/u.test(symbol);
}

export const TRADINGVIEW_PRESETS: readonly TradingViewSymbol[] = [
  { symbol: 'VANTAGE:NAS100', name: 'Nasdaq 100', exchange: 'VANTAGE', type: 'index' },
  { symbol: 'NASDAQ:AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'OANDA:EURUSD', name: 'Euro / U.S. Dollar', exchange: 'OANDA', type: 'forex' },
  { symbol: 'OANDA:XAUUSD', name: 'Gold / U.S. Dollar', exchange: 'OANDA', type: 'forex' },
  { symbol: 'BINANCE:BTCUSDT', name: 'Bitcoin / TetherUS', exchange: 'BINANCE', type: 'crypto' },
];
