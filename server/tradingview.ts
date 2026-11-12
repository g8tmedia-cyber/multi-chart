import type { IncomingMessage, ServerResponse } from 'node:http';
import { searchMarkets, watchQuotes, TradingViewClient, TradingViewError, type ChartSession, type SymbolInfo } from '@mathieuc/tradingview';
import type { Plugin } from 'vite';
import { duration, type Candle, type Interval } from '../src/lib/trading-types';
import type { CandleClose, CandlePage, MarketQuote, PageOptions, StreamStatus } from '../src/data/provider';
import { isTradingViewSymbol, TRADINGVIEW_INTERVALS, tradingViewTimeframe, type TradingViewSymbol } from '../src/data/tradingview-shared';
import { tradingViewCandleClose } from './tradingview-session';

type Market = { symbol: string; timeframe: string; interval: Interval };
type CacheItem<T> = { until: number; value: Promise<T> };
type ChannelSink = (event: 'status' | 'candle', value: StreamStatus | Candle) => void;

class GuestError extends Error {
  constructor(message: string, readonly status = 503) { super(message); }
}

function providerError(error: unknown) {
  if (error instanceof GuestError) return error;
  const message = error instanceof Error ? error.message : '';
  const code = error instanceof TradingViewError ? error.code : undefined;
  const marketError = code === 'SYMBOL_ERROR' || code === 'SERIES_ERROR';
  if (marketError && /entitled|permission|not authorized|not allowed|custom_resolution/i.test(message)) {
    return new GuestError('TradingView guest access does not include this symbol or interval.', 403);
  }
  if (marketError && /symbol not found|invalid symbol|unknown symbol|no such symbol|does not exist/i.test(message)) {
    return new GuestError('TradingView could not resolve that symbol.', 404);
  }
  return new GuestError('TradingView guest data is temporarily unavailable. Try again.');
}

// Each pool multiplexes chart sessions on one socket and spaces out starts.
class GuestSessions {
  private client?: TradingViewClient;
  private slots = 0;
  private nextStart = 0;
  private idle?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(private readonly capacity: number) {}

  private connection() {
    if (this.client && !this.client.isClosed) return this.client;
    const client = new TradingViewClient({ connectTimeoutMs: 10_000, inactivityTimeoutMs: 45_000 });
    this.client = client;
    const retire = () => { if (this.client === client) this.client = undefined; };
    // SDK readiness stays resolved after authentication, even during a later socket failure.
    client.on('error', retire);
    client.once('close', retire);
    return client;
  }

  private release() {
    this.slots -= 1;
    if (this.slots) return;
    this.idle = setTimeout(() => {
      if (this.slots) return;
      const client = this.client;
      this.client = undefined;
      void client?.close().catch(() => undefined);
    }, 3000);
    this.idle.unref();
  }

  async open() {
    if (this.stopped || this.slots >= this.capacity) {
      throw new GuestError('TradingView guest sessions are busy. Try again shortly.', 429);
    }
    this.slots += 1;
    clearTimeout(this.idle);
    try {
      const now = Date.now();
      const start = Math.max(now, this.nextStart);
      this.nextStart = start + 450;
      if (start > now) await new Promise<void>((resolve) => setTimeout(resolve, start - now));
      if (this.stopped) throw new GuestError('The TradingView connection stopped.');
      const client = this.connection();
      await client.ready;
      if (this.stopped || this.client !== client || !client.isOpen) {
        throw new GuestError('The TradingView connection stopped.');
      }
      const chart = client.createChart();
      let released = false;
      let unwatch: (() => void) | undefined;
      return {
        chart,
        watchDisconnect(notify: (error: unknown) => void) {
          const offError = client.on('error', notify);
          const offClose = client.on('close', () => notify(new GuestError('The TradingView connection closed.')));
          unwatch = () => { offError(); offClose(); };
        },
        close: () => {
          if (released) return;
          released = true;
          unwatch?.();
          try { chart.delete(); }
          catch { /* A transport can close while the SDK is deleting its chart. */ }
          finally { this.release(); }
        },
      };
    } catch (error) {
      this.release();
      throw error instanceof GuestError ? error : providerError(error);
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.idle);
    const client = this.client;
    this.client = undefined;
    void client?.close().catch(() => undefined);
  }
}

function normalizeBar(bar: Candle, now: number): Candle | undefined {
  const time = Math.round(bar.time * 1000);
  const { open, high, low, close } = bar;
  if (!Number.isSafeInteger(time) || time <= 0 || time > now ||
      ![open, high, low, close].every(Number.isFinite) ||
      high < Math.max(open, low, close) || low > Math.min(open, close)) return;
  return { time, open, high, low, close, volume: Number.isFinite(bar.volume) && bar.volume >= 0 ? bar.volume : 0 };
}

function normalizeBars(chart: ChartSession, count = Infinity): Candle[] {
  const now = Date.now();
  const unique = new Map<number, Candle>();
  for (const raw of chart.candles.slice(-count)) {
    const bar = normalizeBar(raw, now);
    if (bar) unique.set(bar.time, bar);
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}

function closeFor(info: SymbolInfo | undefined, time: number, interval: Interval): CandleClose | undefined {
  const closeAt = tradingViewCandleClose(info, time, interval);
  return closeAt !== undefined && closeAt > time ? { time, closeAt } : undefined;
}

async function readCandles(sessions: GuestSessions, market: Market, { from, before, limit = 500 }: PageOptions): Promise<CandlePage> {
  const session = await sessions.open();
  const { chart } = session;
  return new Promise((resolve, reject) => {
    const forward = from !== undefined;
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      clearTimeout(timer);
      session.close();
      return true;
    };
    const fail = (error: unknown) => { if (finish()) reject(providerError(error)); };
    const timer = setTimeout(() => fail(new GuestError('TradingView did not return candles in time. Try again.')), 12_000);
    chart.on('error', fail);
    session.watchDisconnect(fail);
    chart.on('seriesCompleted', (info) => {
      if (finished) return;
      const terminalReason = info.dataCompleted === 'end' ? 'end' : info.dataCompleted === 'limit' ? 'limit' : undefined;
      const matching = normalizeBars(chart).filter((bar) =>
        (from === undefined || bar.time >= from) && (before === undefined || bar.time < before));
      const candles = forward ? matching.slice(0, limit) : matching.slice(-limit);
      const last = candles.at(-1);
      const candleClose = last && from === undefined && before === undefined
        ? closeFor(chart.symbolInfo, last.time, market.interval) : undefined;
      finish();
      if (forward && terminalReason === 'limit') {
        reject(new GuestError('TradingView guest history does not cover that date.', 403));
        return;
      }
      if (!candles.length && !terminalReason && !forward) {
        reject(new GuestError('TradingView history did not advance. Try again.'));
        return;
      }
      resolve({
        candles,
        hasEarlier: !forward && !terminalReason,
        hasLater: forward && candles.length >= limit,
        terminalReason,
        candleClose,
      });
    });
    const anchor = from ?? before;
    try {
      chart.setMarket(market.symbol, {
        timeframe: market.timeframe,
        count: forward ? -limit : limit,
        ...(anchor === undefined ? {} : { to: Math.max(1, Math.ceil(anchor / 1000) - 1) }),
      });
    } catch (error) {
      fail(error);
    }
  });
}

function statusFor(info: SymbolInfo | undefined): StreamStatus {
  const delay = info?.delay;
  if (typeof delay === 'number' && Number.isFinite(delay) && delay >= 0) {
    return { connection: delay > 0 ? 'delayed' : 'live', delaySeconds: delay };
  }
  return { connection: 'updating', delaySeconds: null };
}

function send(response: ServerResponse, event: string, value: unknown) {
  if (response.destroyed || response.writableEnded) return;
  if (response.writableLength > 256_000) { response.destroy(); return; }
  response.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

function createChannel(sessions: GuestSessions, history: GuestSessions, market: Market, onClose: () => void) {
  const sinks = new Set<ChannelSink>();
  let status: StreamStatus = { connection: 'connecting' };
  let latest: Candle[] = [];
  let chartSession: Awaited<ReturnType<GuestSessions['open']>> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let release: ReturnType<typeof setTimeout> | undefined;
  let initialDataTimeout: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let attempt = 0;
  let stopped = false;
  function updateStatus(next: StreamStatus) {
    if (next.connection === status.connection && next.delaySeconds === status.delaySeconds &&
        next.candleClose?.time === status.candleClose?.time && next.candleClose?.closeAt === status.candleClose?.closeAt) return;
    status = next;
    for (const sink of sinks) sink('status', status);
  }

  function releaseChart() {
    clearTimeout(initialDataTimeout);
    clearInterval(watchdog);
    const current = chartSession;
    chartSession = undefined;
    current?.close();
  }

  function failed(error: GuestError) {
    releaseChart();
    if (stopped) return;
    if (error.status === 403 || error.status === 404) {
      updateStatus({ connection: 'offline' });
      return;
    }
    updateStatus({ ...status, connection: 'reconnecting' });
    clearTimeout(retry);
    retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)));
    retry.unref();
  }

  async function connect() {
    try {
      const session = await sessions.open();
      if (stopped) { session.close(); return; }
      chartSession = session;
      const { chart } = session;
      let candleClose: CandleClose | undefined;
      let timedBar: number | undefined;
      let timedSymbol: SymbolInfo | undefined;
      let lastQuoteAt = 0;
      let lastProbeAt = 0;
      initialDataTimeout = setTimeout(() => failed(new GuestError('TradingView stream did not return candles in time.')), 15_000);
      initialDataTimeout.unref();
      const disconnect = (error: unknown) => {
        if (chartSession === session) failed(providerError(error));
      };
      chart.on('error', disconnect);
      session.watchDisconnect(disconnect);
      chart.on('update', (changes) => {
        if (!changes.includes('$prices') || chartSession !== session) return;
        const raw = chart.lastCandle;
        const candle = raw && normalizeBar(raw, Date.now());
        const previous = latest.at(-1);
        if (!candle || (previous && candle.time < previous.time)) return;
        const firstQuote = lastQuoteAt === 0;
        lastQuoteAt = Date.now();
        clearTimeout(initialDataTimeout);
        attempt = 0;
        const { time } = candle;
        const rollsOver = firstQuote || time !== previous?.time;
        const bars = rollsOver ? normalizeBars(chart, firstQuote && previous ? 120 : 12) : [candle];
        if (rollsOver) latest = bars.slice(-12);
        else latest[latest.length - 1] = candle;
        const info = chart.symbolInfo;
        if (timedBar !== time || timedSymbol !== info) {
          timedBar = time;
          timedSymbol = info;
          candleClose = closeFor(info, time, market.interval);
        }
        updateStatus({ ...statusFor(info), candleClose });
        for (const bar of previous ? bars.filter((bar) => bar.time >= previous.time) : bars) {
          for (const sink of sinks) sink('candle', bar);
        }
      });
      watchdog = setInterval(async () => {
        const now = Date.now();
        if (!lastQuoteAt || now - lastQuoteAt < 30_000 || now - lastProbeAt < 60_000 || chartSession !== session) return;
        const effective = Math.floor(now / 1000 - (status.delaySeconds ?? 0)) * 1000;
        if (!tradingViewCandleClose(chart.symbolInfo, effective, '1m') && now - lastQuoteAt < 120_000) return;
        lastProbeAt = now;
        const observedQuoteAt = lastQuoteAt;
        try {
          // A quiet symbol is only restarted if a fresh snapshot proves its stream fell behind.
          const snapshot = await readCandles(history, market, { limit: 3 });
          if (chartSession !== session || lastQuoteAt !== observedQuoteAt) return;
          const snapshotBar = snapshot.candles.at(-1);
          const streamedBar = latest.at(-1);
          if (snapshotBar && streamedBar && (snapshotBar.time > streamedBar.time ||
            (snapshotBar.time === streamedBar.time && snapshotBar.volume >= streamedBar.volume &&
              (snapshotBar.volume !== streamedBar.volume || snapshotBar.close !== streamedBar.close ||
                snapshotBar.high !== streamedBar.high || snapshotBar.low !== streamedBar.low || snapshotBar.open !== streamedBar.open)))) {
            failed(new GuestError('The TradingView chart session stopped updating.'));
          }
        } catch { /* A snapshot failure gives no evidence that this individual stream is stale. */ }
      }, 15_000);
      watchdog.unref();
      chart.setMarket(market.symbol, { timeframe: market.timeframe, count: latest.length ? 120 : 12 });
    } catch (error) {
      failed(error instanceof GuestError ? error : providerError(error));
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(release);
    clearTimeout(retry);
    releaseChart();
    sinks.clear();
    onClose();
  }

  void connect();
  return {
    stop,
    get active() { return sinks.size > 0; },
    attach(sink: ChannelSink) {
      clearTimeout(release);
      sinks.add(sink);
      sink('status', status);
      for (const candle of latest) sink('candle', candle);
      return () => {
        sinks.delete(sink);
        if (!stopped && !sinks.size) {
          release = setTimeout(stop, 1500);
          release.unref();
        }
      };
    },
  };
}

function cached<T>(cache: Map<string, CacheItem<T>>, key: string, ttl: number, read: () => Promise<T>) {
  const existing = cache.get(key);
  if (existing && existing.until > Date.now()) return existing.value;
  const entry: CacheItem<T> = { until: Infinity, value: read() };
  cache.set(key, entry);
  entry.value.then(() => { entry.until = Date.now() + ttl; }, () => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  if (cache.size > 100) {
    for (const [oldest, item] of cache) {
      if (item.until === Infinity) continue;
      cache.delete(oldest);
      break;
    }
  }
  return entry.value;
}

function parseMarket(params: URLSearchParams): Market {
  const symbol = params.get('symbol') ?? '';
  const interval = TRADINGVIEW_INTERVALS.find((value) => value === params.get('interval'));
  const timeframe = interval && tradingViewTimeframe(interval);
  if (!isTradingViewSymbol(symbol) || !interval || !timeframe) {
    throw new GuestError('Choose an exchange-qualified TradingView symbol and supported interval.', 400);
  }
  return { symbol, timeframe, interval };
}

function parsePage(params: URLSearchParams): PageOptions {
  const number = (key: string) => params.has(key) ? Number(params.get(key)) : undefined;
  const from = number('from');
  const before = number('before');
  const limit = number('limit') ?? 500;
  if ([from, before].some((time) => time !== undefined && (!Number.isSafeInteger(time) || time < 0)) ||
      !Number.isInteger(limit) || limit < 1 || limit > 3000 ||
      (from !== undefined && before !== undefined && from >= before)) {
    throw new GuestError('Invalid TradingView candle window.', 400);
  }
  return { from, before, limit };
}

function json(response: ServerResponse, status: number, data: unknown) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

export function tradingViewApi(): Plugin {
  const chartsPerSocket = 8;
  const livePools = Array.from({ length: 2 }, () => ({ sessions: new GuestSessions(chartsPerSocket), channels: 0 }));
  const liveCapacity = chartsPerSocket * livePools.length;
  const historySessions = new GuestSessions(8);
  const streams = new Map<string, ReturnType<typeof createChannel>>();
  const streamResponses = new Set<ServerResponse>();
  const pages = new Map<string, CacheItem<CandlePage>>();
  const searches = new Map<string, CacheItem<TradingViewSymbol[]>>();
  let nextSearch = 0;
  let searchCooldown = 0;

  function beginStream(response: ServerResponse, retry: number) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    response.write(`retry: ${retry}\n\n`);
    streamResponses.add(response);
    send(response, 'heartbeat', {});
    const heartbeat = setInterval(() => send(response, 'heartbeat', {}), 15_000);
    heartbeat.unref();
    response.once('close', () => {
      streamResponses.delete(response);
      clearInterval(heartbeat);
    });
  }

  async function streamQuote(symbol: string, response: ServerResponse) {
    const controller = new AbortController();
    response.once('close', () => controller.abort());
    beginStream(response, 5000);
    try {
      const watcher = await watchQuotes({ symbols: [symbol], fields: ['lp', 'chp'], signal: controller.signal }, {
        onData(_symbol, { lp, chp }) {
          if (typeof lp !== 'number' || !Number.isFinite(lp)) return;
          const quote: MarketQuote = { price: lp, changePercent: typeof chp === 'number' && Number.isFinite(chp) ? chp : undefined };
          send(response, 'quote', quote);
        },
      });
      await watcher.closed;
    } catch (error) {
      if (error instanceof TradingViewError && error.code === 'QUOTE_ERROR') {
        send(response, 'unavailable', {});
      }
    } finally {
      if (!response.destroyed && !response.writableEnded) response.end();
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (request.method !== 'GET') { json(response, 405, { error: 'Method not allowed.' }); return; }
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/quote') {
        const symbol = url.searchParams.get('symbol') ?? '';
        if (!isTradingViewSymbol(symbol)) throw new GuestError('Choose an exchange-qualified TradingView symbol.', 400);
        await streamQuote(symbol, response);
        return;
      }
      if (url.pathname === '/search') {
        const query = (url.searchParams.get('q') ?? '').trim();
        if (!query || query.length > 80 || /[\x00-\x1f\x7f]/.test(query)) {
          throw new GuestError('Enter a symbol or name to search.', 400);
        }
        const rows = await cached(searches, query.toUpperCase(), 300_000, async () => {
          const now = Date.now();
          if (now < searchCooldown) throw new GuestError('TradingView symbol search is temporarily unavailable.', 429);
          const start = Math.max(now, nextSearch);
          if (start - now > 3000) throw new GuestError('TradingView symbol search is busy. Try again shortly.', 429);
          nextSearch = start + 600;
          if (start > now) await new Promise<void>((resolve) => setTimeout(resolve, start - now));
          if (Date.now() < searchCooldown) throw new GuestError('TradingView symbol search is temporarily unavailable.', 429);
          try {
            const results = await searchMarkets(query, {
              fetch: (resource, init) => fetch(resource, { ...init, signal: AbortSignal.timeout(7000) }),
            });
            return results.filter((row) => isTradingViewSymbol(row.id)).map((row) => ({
              symbol: row.id,
              name: row.description.replace(/<[^>]*>/g, '').slice(0, 160),
              exchange: row.exchange,
              type: row.type,
            }));
          } catch {
            searchCooldown = Date.now() + 12_000;
            throw new GuestError('TradingView symbol search is temporarily unavailable. You can enter EXCHANGE:SYMBOL directly.');
          }
        });
        json(response, 200, rows);
        return;
      }
      if (url.pathname !== '/candles' && url.pathname !== '/stream') {
        json(response, 404, { error: 'Unknown TradingView route.' });
        return;
      }
      if (url.pathname === '/candles') {
        const market = parseMarket(url.searchParams);
        const page = parsePage(url.searchParams);
        const key = JSON.stringify([market, page]);
        const historical = page.before !== undefined && page.from === undefined && page.before < Date.now() - duration(market.interval);
        const result = await cached(pages, key, historical ? 300_000 : 1500, () => readCandles(historySessions, market, page));
        json(response, 200, result);
        return;
      }
      const subscriptions = [...new Set(url.searchParams.getAll('market'))];
      if (subscriptions.length > 8) throw new GuestError('Choose up to eight TradingView charts.', 400);
      const requested = subscriptions.length ? subscriptions.map((id) => {
        const [symbol, interval, extra] = id.split('|');
        if (!interval || extra !== undefined) throw new GuestError('Invalid TradingView stream subscription.', 400);
        return { id, market: parseMarket(new URLSearchParams({ symbol, interval })) };
      }) : [{ id: '', market: parseMarket(url.searchParams) }];
      const keyFor = ({ symbol, timeframe }: Market) => `${symbol}|${timeframe}`;
      const keys = new Set(requested.map(({ market }) => keyFor(market)));
      if (new Set([...streams.keys(), ...keys]).size > liveCapacity) {
        for (const [key, channel] of streams) {
          if (!keys.has(key) && !channel.active) channel.stop();
        }
        if (new Set([...streams.keys(), ...keys]).size > liveCapacity) {
          throw new GuestError('TradingView guest streams are busy.', 429);
        }
      }
      beginStream(response, 2000);
      const cleanups = requested.map(({ id, market }) => {
        const key = keyFor(market);
        let channel = streams.get(key);
        if (!channel) {
          const pool = livePools.find(({ channels }) => channels < chartsPerSocket)!;
          pool.channels += 1;
          channel = createChannel(pool.sessions, historySessions, market, () => {
            pool.channels -= 1;
            streams.delete(key);
          });
          streams.set(key, channel);
        }
        return channel.attach((event, value) => send(response, event, id ? { market: id, value } : value));
      });
      response.once('close', () => {
        for (const cleanup of cleanups) cleanup();
      });
    } catch (error) {
      const failure = error instanceof GuestError ? error : providerError(error);
      json(response, failure.status, { error: failure.message });
    }
  }

  function middleware(request: IncomingMessage, response: ServerResponse) { void handle(request, response); }
  function stop() {
    for (const response of streamResponses) response.end();
    for (const stream of streams.values()) stream.stop();
    for (const pool of livePools) pool.sessions.stop();
    historySessions.stop();
  }

  return {
    name: 'local-tradingview-guest',
    configureServer(server) {
      server.middlewares.use('/api/tradingview', middleware);
      server.httpServer?.once('close', stop);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/tradingview', middleware);
      server.httpServer.once('close', stop);
    },
    closeBundle: stop,
  };
}
