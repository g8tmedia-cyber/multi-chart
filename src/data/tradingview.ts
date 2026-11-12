import type { Candle, Interval } from '@/lib/trading-types';
import type { CandlePage, PageOptions, StreamListener, StreamStatus } from './provider';
import type { TradingViewSymbol } from './tradingview-shared';

export { isTradingViewSymbol, TRADINGVIEW_INTERVALS, TRADINGVIEW_PRESETS } from './tradingview-shared';
export type { TradingViewSymbol } from './tradingview-shared';

const base = '/api/tradingview';

class TradingViewRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function canRetryTradingView(error: unknown) {
  return !(error instanceof TradingViewRequestError) || error.status < 400 || error.status >= 500 ||
    error.status === 408 || error.status === 429;
}

async function read<T>(route: string, params: URLSearchParams, signal = AbortSignal.timeout(30_000)): Promise<T> {
  const response = await fetch(`${base}/${route}?${params}`, { signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new TradingViewRequestError(body?.error ?? 'The local TradingView guest connection is unavailable.', response.status);
  }
  return body as T;
}

export function searchTradingViewSymbols(query: string, signal?: AbortSignal): Promise<TradingViewSymbol[]> {
  return read('search', new URLSearchParams({ q: query }), signal);
}

type Subscription = { listeners: Set<StreamListener>; status: StreamStatus; latest?: Candle };
type FeedConnection = {
  source: EventSource;
  key: string;
  markets: Set<string>;
  retained: Map<string, Subscription>;
  lastEvent: number;
  watchdog: ReturnType<typeof setInterval>;
};
const subscriptions = new Map<string, Subscription>();
const inFlightPages = new Map<string, Promise<CandlePage>>();
let connection: FeedConnection | undefined;
let opening: FeedConnection | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 1000;
let scheduled = false;

function notifyStatus(subscription: Subscription, status: StreamStatus) {
  subscription.status = status;
  for (const listener of subscription.listeners) listener.onStatus(status);
}

function closeStream(stream?: FeedConnection) {
  if (!stream) return;
  clearInterval(stream.watchdog);
  stream.source.close();
}

function markUncovered() {
  for (const [market, subscription] of subscriptions) {
    if (!connection?.markets.has(market) && subscription.status.connection !== 'offline' &&
        subscription.status.connection !== 'reconnecting') notifyStatus(subscription, { connection: 'reconnecting' });
  }
}

function updateStream() {
  scheduled = false;
  clearTimeout(retry);
  const keys = [...subscriptions.keys()].sort();
  const key = JSON.stringify(keys);
  if (opening?.key === key) return;
  closeStream(opening);
  opening = undefined;
  if (connection?.key === key) return;
  if (!keys.length) {
    closeStream(connection);
    connection = undefined;
    retryDelay = 1000;
    return;
  }

  // Keep existing panes connected until the new multiplexed stream is ready.
  // A completely different layout has no shared subscriptions to keep alive.
  const previous = connection;
  if (previous && !keys.some((market) => previous.markets.has(market))) {
    closeStream(previous);
    connection = undefined;
    markUncovered();
  }
  const params = new URLSearchParams(keys.map((market) => ['market', market]));
  const source = new EventSource(`${base}/stream?${params}`);
  const stream: FeedConnection = {
    source, key, markets: new Set(keys), retained: new Map(), lastEvent: Date.now(),
    watchdog: setInterval(() => {
      const timeout = opening === stream ? 12_000 : 45_000;
      if (Date.now() - stream.lastEvent >= timeout) fail();
    }, 3000),
  };
  opening = stream;

  function fail() {
    if (connection !== stream && opening !== stream) return;
    if (opening === stream) {
      opening = undefined;
    } else {
      connection = undefined;
    }
    closeStream(stream);
    markUncovered();
    clearTimeout(retry);
    retry = setTimeout(updateStream, retryDelay);
    retryDelay = Math.min(15_000, retryDelay * 2);
  }

  function receive<T>(event: MessageEvent<string>, handle: (subscription: Subscription, value: T) => void) {
    if (connection !== stream) return;
    let message: { market: string; value: T };
    try { message = JSON.parse(event.data); }
    catch { return; }
    if (!message || !stream.markets.has(message.market) || message.value == null) return;
    stream.lastEvent = Date.now();
    const subscription = subscriptions.get(message.market) ?? stream.retained.get(message.market);
    if (subscription) handle(subscription, message.value);
  }

  source.addEventListener('open', () => {
    if (opening !== stream) return;
    closeStream(connection);
    opening = undefined;
    connection = stream;
    stream.lastEvent = Date.now();
    clearTimeout(retry);
    retryDelay = 1000;
  });
  source.addEventListener('heartbeat', () => { stream.lastEvent = Date.now(); });
  source.addEventListener('status', (event: MessageEvent<string>) => receive<StreamStatus>(event, notifyStatus));
  source.addEventListener('candle', (event: MessageEvent<string>) => receive<Candle>(event, (subscription, candle) => {
    if (!subscription.latest || candle.time >= subscription.latest.time) subscription.latest = candle;
    for (const listener of subscription.listeners) listener.onCandle(candle);
  }));
  source.addEventListener('error', fail);
}

function refreshStream() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(updateStream);
}

export function loadTradingViewCandles(symbol: string, interval: Interval, { from, before, limit = 500 }: PageOptions = {}) {
  const params = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (from !== undefined) params.set('from', String(from));
  if (before !== undefined) params.set('before', String(before));
  const key = params.toString();
  const existing = inFlightPages.get(key);
  if (existing) return existing;
  const pending = read<CandlePage>('candles', params).finally(() => inFlightPages.delete(key));
  inFlightPages.set(key, pending);
  return pending;
}

export function subscribeTradingViewCandles(symbol: string, interval: Interval, listener: StreamListener) {
  const key = `${symbol}|${interval}`;
  let subscription = subscriptions.get(key);
  if (!subscription) {
    subscription = connection?.retained.get(key) ?? { listeners: new Set(), status: { connection: 'connecting' } };
    connection?.retained.delete(key);
    subscriptions.set(key, subscription);
    refreshStream();
  }
  subscription.listeners.add(listener);
  listener.onStatus(subscription.status);
  if (subscription.latest) listener.onCandle(subscription.latest);

  return () => {
    subscription.listeners.delete(listener);
    if (!subscription.listeners.size && subscriptions.get(key) === subscription) {
      subscriptions.delete(key);
      if (connection?.markets.has(key)) connection.retained.set(key, subscription);
      refreshStream();
    }
  };
}
