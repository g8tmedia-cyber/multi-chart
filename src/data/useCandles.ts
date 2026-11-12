import { useCallback, useEffect, useRef, useState } from 'react';
import { timeToCandleIndex } from '@/lib/chart-time-coordinates';
import { duration, type Candle, type Interval } from '@/lib/trading-types';
import type { SavedPosition } from '@/workspace';
import { canRetryTradingView, loadTradingViewCandles, subscribeTradingViewCandles } from './tradingview';
import type { CandleClose, Connection } from './provider';

type Window = 'restore' | 'live';
type Direction = 'earlier' | 'later';
type Snapshot = {
  key: string;
  candles: Candle[];
  loading: boolean;
  error: string | null;
  loadingHistory: boolean;
  loadingLater: boolean;
  historyError: string | null;
  hasEarlier: boolean;
  hasLater: boolean;
  historical: boolean;
  connection: Connection;
  delaySeconds: number | null;
  candleClose?: CandleClose;
  windowId: number;
};

const windowSize = 500;
const pageSize = 1000;
const pollInterval = 8000;
const maxRetryDelay = 20_000;
const retainedSeries = new Map<string, Pick<Snapshot, 'candles' | 'hasEarlier'>>();

function emptySnapshot(key: string): Snapshot {
  return {
    key, candles: [], loading: true, error: null, loadingHistory: false, loadingLater: false,
    historyError: null, hasEarlier: false, hasLater: false, historical: false,
    connection: 'connecting', delaySeconds: null, windowId: 0,
  };
}

function remember(snapshot: Snapshot) {
  if (!snapshot.candles.length || snapshot.historical) return;
  const candles = snapshot.candles.slice(-12_000);
  const existing = retainedSeries.get(snapshot.key);
  if (existing && existing.candles[0].time < candles[0].time &&
      existing.candles[existing.candles.length - 1].time >= candles[candles.length - 1].time) return;
  retainedSeries.delete(snapshot.key);
  const hasEarlier = snapshot.hasEarlier || candles.length < snapshot.candles.length;
  retainedSeries.set(snapshot.key, { candles, hasEarlier });
  if (retainedSeries.size > 12) retainedSeries.delete(retainedSeries.keys().next().value!);
}

function mergeCandles(previous: Candle[], update: Candle[]): Candle[] {
  if (!previous.length) return update;
  if (!update.length) return previous;
  const previousLast = previous[previous.length - 1];
  if (previousLast.time < update[0].time) return [...previous, ...update];
  if (update[update.length - 1].time < previous[0].time) return [...update, ...previous];
  if (update.length === 1 && previousLast.time === update[0].time) {
    const candle = update[0];
    return previousLast.volume > candle.volume ||
      (previousLast.volume === candle.volume && previousLast.close === candle.close &&
       previousLast.high === candle.high && previousLast.low === candle.low) ? previous : [...previous.slice(0, -1), candle];
  }
  const merged: Candle[] = [];
  let left = 0;
  let right = 0;
  while (left < previous.length && right < update.length) {
    const a = previous[left];
    const b = update[right];
    if (a.time < b.time) { merged.push(a); left += 1; }
    else if (b.time < a.time) { merged.push(b); right += 1; }
    else { merged.push(a.volume > b.volume ? a : b); left += 1; right += 1; }
  }
  return merged.concat(previous.slice(left), update.slice(right));
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Market data is temporarily unavailable.';

type Actions = { key: string; earlier: () => void; later: () => void; retry: () => void; live: () => void };

/** Sample the saved view when a pane opens a symbol and interval. */
export function useCandles(symbol: string, interval: Interval, position?: SavedPosition) {
  const key = `${symbol}|${interval}`;
  const positionRef = useRef(position);
  positionRef.current = position;
  const [snapshot, setSnapshot] = useState(() => emptySnapshot(key));
  const actions = useRef<Actions | null>(null);

  useEffect(() => {
    const saved = positionRef.current;
    const anchor = saved?.anchor;
    const buffered = new Map<number, Candle>();
    let state = emptySnapshot(key);
    let disposed = false;
    let revision = 0;
    let failedWindow: Window | undefined;
    let failedPage: Direction | undefined;
    let transport: Connection = 'connecting';
    let repair: { from: number; before?: number } | undefined;
    let liveRefresh: number | undefined;
    let streamUpdates: Map<number, Candle> | undefined;
    let snapshotBlocked = false;
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    let syncAt = Infinity;
    let windowTimer: ReturnType<typeof setTimeout> | undefined;
    let windowRetryDelay = 1000;
    let syncRetryDelay = 1000;

    function patch(next: Partial<Snapshot>) {
      if (disposed) return;
      state = { ...state, ...next };
      setSnapshot(state);
    }

    function flushBuffered(candles: Candle[]) {
      const oldest = candles[0]?.time ?? 0;
      const pending = [...buffered.values()].filter(candle => candle.time >= oldest).sort((a, b) => a.time - b.time);
      buffered.clear();
      return mergeCandles(candles, pending);
    }

    const interrupted = () => transport === 'reconnecting' || transport === 'connecting';
    const canSync = () => !disposed && !state.loading && !state.historical && state.candles.length > 0 &&
      transport !== 'offline' && !snapshotBlocked && Boolean(repair || interrupted());
    const syncIsCurrent = (version: number) => !disposed && version === revision && !state.historical && transport !== 'offline';

    function cancelSync() {
      clearTimeout(syncTimer);
      syncAt = Infinity;
    }

    function scheduleSync(wait: number) {
      if (!canSync() || liveRefresh !== undefined || syncAt <= Date.now() + wait) return;
      cancelSync();
      syncAt = Date.now() + wait;
      syncTimer = setTimeout(() => {
        syncAt = Infinity;
        void syncLive();
      }, wait);
    }

    function markGap(from: number) {
      repair = { from: Math.min(repair?.from ?? from, from) };
    }

    async function syncLive() {
      const last = state.candles.at(-1);
      if (!last || !canSync()) return;
      const version = revision;
      liveRefresh = version;
      const concurrent = new Map<number, Candle>();
      streamUpdates = concurrent;
      const pending = repair;
      let wait: number = pollInterval;
      try {
        const recent = await loadTradingViewCandles(symbol, interval, { limit: 64 });
        if (!syncIsCurrent(version)) return;
        let bars = recent.candles;
        if (!bars.length) throw new Error('TradingView did not return recent candles.');
        let cursor = pending?.before ?? bars[0].time;
        let hasEarlier = pending?.before !== undefined || recent.hasEarlier;

        // Walk backwards from the resumed tail. Continuing in bounded batches
        // also handles longer outages without replacing a pane's current view.
        for (let pages = 0; pending && cursor > pending.from && hasEarlier && pages < 2; pages += 1) {
          const previous = await loadTradingViewCandles(symbol, interval, { before: cursor, limit: 500 });
          if (!syncIsCurrent(version)) return;
          hasEarlier = previous.hasEarlier;
          if (!previous.candles.length && !hasEarlier) break;
          const oldest = previous.candles[0]?.time;
          if (oldest === undefined || oldest >= cursor) throw new Error('TradingView history did not advance.');
          cursor = oldest;
          bars = mergeCandles(previous.candles, bars);
        }
        if (pending && repair === pending && recent.candles.at(-1)!.time >= last.time) {
          repair = cursor <= pending.from || !hasEarlier ? undefined : { from: pending.from, before: cursor };
        }
        const polling = interrupted();
        // Snapshot updates must advance zero-volume bars while polling. Any stream
        // updates received during the request still take precedence on overlap.
        const candles = polling
          ? mergeCandles(mergeCandles(state.candles, bars), [...concurrent.values()].sort((a, b) => a.time - b.time))
          : mergeCandles(bars, state.candles);
        patch({ candles, ...(polling ? { connection: 'updating' as const, candleClose: recent.candleClose } : {}) });
        syncRetryDelay = 1000;
        if (repair && !interrupted()) wait = repair.before === undefined ? 1000 : 250;
      } catch (error) {
        if (!syncIsCurrent(version)) return;
        if (!canRetryTradingView(error)) {
          repair = undefined;
          snapshotBlocked = true;
          return;
        }
        if (interrupted()) patch({ connection: 'reconnecting', candleClose: undefined });
        wait = syncRetryDelay;
        syncRetryDelay = Math.min(maxRetryDelay, syncRetryDelay * 2);
      } finally {
        if (liveRefresh === version) {
          liveRefresh = undefined;
          streamUpdates = undefined;
          scheduleSync(wait);
        }
      }
    }

    const unsubscribe = subscribeTradingViewCandles(symbol, interval, {
      onStatus({ connection, delaySeconds = null, candleClose }) {
        const wasInterrupted = interrupted();
        if (transport !== connection) snapshotBlocked = false;
        transport = connection;
        const last = state.candles.at(-1);
        if (interrupted() && !wasInterrupted && last && !state.historical) markGap(last.time);
        patch({ connection, delaySeconds, candleClose });
        if (connection === 'offline') cancelSync();
        else scheduleSync(interrupted() ? 400 : 0);
      },
      onCandle(candle) {
        const last = state.candles.at(-1);
        if (state.loading || state.historical || !last) {
          buffered.set(candle.time, candle);
          if (buffered.size > 1000) buffered.delete(buffered.keys().next().value!);
          return;
        }
        if (candle.time < last.time) return;
        if (candle.time > last.time + duration(interval)) {
          markGap(last.time);
          scheduleSync(0);
        }
        const candles = mergeCandles(state.candles, [candle]);
        if (candles !== state.candles) {
          streamUpdates?.set(candle.time, candle);
          patch({ candles });
        }
      },
    });

    async function selectWindow(kind: Window) {
      const version = ++revision;
      clearTimeout(windowTimer);
      cancelSync();
      liveRefresh = undefined;
      streamUpdates = undefined;
      snapshotBlocked = false;
      repair = undefined;
      failedWindow = undefined;
      failedPage = undefined;
      remember(state);
      patch({ loading: true, error: null, historyError: null, loadingHistory: false, loadingLater: false });
      try {
        const count = kind === 'restore' ? Math.ceil(saved?.view.count ?? 0) : 0;
        const limit = Math.max(windowSize, count + 80);
        const recent = await loadTradingViewCandles(symbol, interval, { limit });
        if (disposed || version !== revision) return;
        let { candles, hasEarlier } = recent;
        let historical = false;
        if (!candles.length) throw new Error('TradingView has no candles for this symbol and interval.');

        const cached = retainedSeries.get(key);
        if (cached && cached.candles.at(-1)!.time >= candles[0].time) {
          if (cached.candles[0].time <= candles[0].time) hasEarlier = cached.hasEarlier;
          candles = mergeCandles(cached.candles, candles);
        }

        if (kind === 'restore' && anchor !== undefined && anchor <= candles.at(-1)!.time) {
          const right = timeToCandleIndex(candles, interval, anchor) + (saved?.anchorOffset ?? 0);
          if (anchor < candles[0].time || (hasEarlier && right + 1 < count)) {
            const before = Math.min(Date.now(), Math.floor(anchor + duration(interval) * 36) + 1);
            const older = await loadTradingViewCandles(symbol, interval, { before, limit });
            if (disposed || version !== revision) return;
            if (older.candles.length && older.candles[0].time < candles[0].time) {
              historical = older.candles.at(-1)!.time < candles[0].time;
              candles = historical ? older.candles : mergeCandles(older.candles, candles);
              hasEarlier = older.hasEarlier;
            }
          }
        }
        patch({
          candles: historical ? candles : flushBuffered(candles), hasEarlier, hasLater: historical, historical,
          loading: false, windowId: state.windowId + Number(kind === 'live'),
        });
        windowRetryDelay = 1000;
        scheduleSync(400);
      } catch (error) {
        if (disposed || version !== revision) return;
        failedWindow = kind;
        const retryable = canRetryTradingView(error);
        const candles = retryable && kind === 'restore' && anchor === undefined
          ? flushBuffered(state.candles) : state.candles;
        patch({ candles, loading: false, error: errorMessage(error) });
        if (retryable) {
          windowTimer = setTimeout(() => void selectWindow(kind), windowRetryDelay);
          windowRetryDelay = Math.min(maxRetryDelay, windowRetryDelay * 2);
        }
      }
    }

    async function pageHistory(direction: Direction) {
      const earlier = direction === 'earlier';
      if (disposed || state.loading || state.loadingHistory || state.loadingLater || !state.candles.length ||
          !(earlier ? state.hasEarlier : state.hasLater)) return;
      const version = revision;
      failedPage = undefined;
      patch({ historyError: null, loadingHistory: earlier, loadingLater: !earlier });
      const options = earlier
        ? { before: state.candles[0].time, limit: pageSize }
        : { from: state.candles[state.candles.length - 1].time + 1, limit: pageSize };
      try {
        const page = await loadTradingViewCandles(symbol, interval, options);
        if (disposed || version !== revision) return;
        const candles = mergeCandles(state.candles, page.candles);
        if (earlier) {
          patch({ candles, hasEarlier: page.hasEarlier, loadingHistory: false });
        } else {
          patch({ candles: page.hasLater ? candles : flushBuffered(candles), hasLater: Boolean(page.hasLater),
            historical: Boolean(page.hasLater), loadingLater: false });
          scheduleSync(400);
        }
      } catch (error) {
        if (disposed || version !== revision) return;
        failedPage = direction;
        patch({ loadingHistory: false, loadingLater: false, historyError: errorMessage(error) });
      }
    }

    actions.current = {
      key,
      earlier: () => void pageHistory('earlier'),
      later: () => void pageHistory('later'),
      retry: () => {
        if (failedWindow) void selectWindow(failedWindow);
        else if (failedPage) void pageHistory(failedPage);
      },
      live: () => { if (!state.loading) void selectWindow('live'); },
    };
    const wake = () => {
      if (state.loading || state.historical) return;
      const last = state.candles.at(-1);
      if (last) {
        markGap(last.time);
        scheduleSync(0);
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') wake(); };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', onVisibility);
    void selectWindow('restore');
    return () => {
      disposed = true;
      clearTimeout(windowTimer);
      cancelSync();
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
      remember(state);
      if (actions.current?.key === key) actions.current = null;
    };
  }, [key, symbol, interval]);

  const loadEarlier = useCallback(() => { if (actions.current?.key === key) actions.current.earlier(); }, [key]);
  const loadLater = useCallback(() => { if (actions.current?.key === key) actions.current.later(); }, [key]);
  const retry = useCallback(() => { if (actions.current?.key === key) actions.current.retry(); }, [key]);
  const goLive = useCallback(() => { if (actions.current?.key === key) actions.current.live(); }, [key]);
  return {
    ...(snapshot.key === key ? snapshot : emptySnapshot(key)), loadEarlier, loadLater, retry, goLive,
  };
}
