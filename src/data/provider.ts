import type { Candle } from '@/lib/trading-types';

export type Connection = 'connecting' | 'live' | 'updating' | 'reconnecting' | 'delayed' | 'offline';
export type HistoryBoundary = 'end' | 'limit';
export type CandleClose = { time: number; closeAt: number };
export type CandlePage = { candles: Candle[]; hasEarlier: boolean; hasLater?: boolean; terminalReason?: HistoryBoundary; candleClose?: CandleClose };
export type PageOptions = { before?: number; from?: number; limit?: number };
export type StreamStatus = {
  connection: Connection;
  delaySeconds?: number | null;
  candleClose?: CandleClose;
};
export type StreamListener = {
  onCandle: (candle: Candle) => void;
  onStatus: (status: StreamStatus) => void;
};
