import type { Drawing } from '@/drawings/types';
import { isTradingViewSymbol, TRADINGVIEW_INTERVALS } from '@/data/tradingview-shared';
import type { PriceScaleMode } from '@/lib/chart-price-scale';
import { isChartTimeZone } from '@/lib/chart-timezones';
import type { ChartView } from '@/lib/chart-types';
import { isMarketLayout, MARKET_LAYOUTS, restoreMarketGridSizes, type MarketGridSizes, type MarketLayout } from '@/lib/markets-workspace';
import type { Interval } from '@/lib/trading-types';

const STORAGE_KEY = 'multi-chart.workspace.v2';
const LEGACY_STORAGE_KEY = 'multi-chart.workspace.v1';

export const DEFAULT_COLORS = {
  up: '#2fc8a1',
  down: '#ed6378',
  upWick: '#2fc8a1',
  downWick: '#ed6378',
};
export type Colors = typeof DEFAULT_COLORS;
export type Theme = 'dark' | 'light';
export type SavedPosition = { view: ChartView; anchor?: number; anchorOffset?: number };

export type Pane = {
  id: string;
  symbol: string;
  interval: Interval;
  priceScale: PriceScaleMode;
  views: Record<string, SavedPosition>;
  drawings: Record<string, Drawing[]>;
};

export type Workspace = {
  id: string;
  name: string;
  layout: MarketLayout;
  active: number;
  maximized: number | null;
  panes: Pane[];
  sizes: Record<string, MarketGridSizes>;
};

export type AppState = {
  version: 2;
  theme: Theme;
  timeZone: string;
  colors: Colors;
  current: string;
  tabs: Workspace[];
};

export const LAYOUT_NAMES: Record<MarketLayout, string> = {
  single: 'Single chart',
  two_columns: 'Two columns',
  two_rows: 'Two rows',
  four: 'Four charts',
  six: 'Six charts',
  eight: 'Eight charts',
};

const STARTER_CHARTS = [
  ['BINANCE:BTCUSDT', '1h'], ['BINANCE:ETHUSDT', '1h'], ['BINANCE:SOLUSDT', '4h'],
  ['BINANCE:BNBUSDT', '1d'], ['BINANCE:XRPUSDT', '15m'], ['BINANCE:DOGEUSDT', '30m'],
  ['BINANCE:ADAUSDT', '1w'], ['BINANCE:LINKUSDT', '1M'],
] as const satisfies ReadonlyArray<readonly [string, Interval]>;

export function chartViewKey(symbol: string, interval: Interval) {
  return `${symbol}|${interval}`;
}

export function newWorkspace(name: string, first?: Pick<Pane, 'symbol' | 'interval' | 'priceScale'>): Workspace {
  return {
    id: crypto.randomUUID(), name, layout: 'single', active: 0, maximized: null, sizes: {},
    panes: STARTER_CHARTS.map(([symbol, interval], index) => ({
      id: `pane-${index + 1}`,
      ...(index === 0 && first
        ? { symbol: first.symbol, interval: first.interval, priceScale: first.priceScale }
        : { symbol, interval, priceScale: 'linear' }),
      views: {}, drawings: {},
    })),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);
const isInterval = (value: unknown): value is Interval => TRADINGVIEW_INTERVALS.includes(value as Interval);

function restoreSymbol(value: unknown, provider?: unknown): string | undefined {
  if (typeof value !== 'string') return;
  if (isTradingViewSymbol(value)) return value;
  if (provider === 'binance' && isTradingViewSymbol(`BINANCE:${value}`)) return `BINANCE:${value}`;
  if (provider !== 'bingx' && provider !== 'bingx-spot' && provider !== 'bingx-coin-m') return;
  if (value === 'NCSINASDAQ1002USD-USDT') return 'BINGX:NASDAQ100USDT.P';
  const ticker = `BINGX:${value.replaceAll('-', '')}${provider === 'bingx-spot' ? '' : '.P'}`;
  return isTradingViewSymbol(ticker) ? ticker : undefined;
}

function readPosition(value: unknown): SavedPosition | undefined {
  const position = record(value);
  const view = record(position.view);
  if (!finite(view.right) || !finite(view.count) || view.count < 1 || view.count > 2500) return;
  const scale = view.priceScale === 'log' ? 'log' : 'linear';
  const min = finite(view.min) && (scale !== 'log' || view.min > 0) ? view.min : null;
  const max = min !== null && finite(view.max) && view.max > min ? view.max : null;
  return {
    view: {
      right: view.right,
      count: view.count,
      min: max === null ? null : min,
      max,
      priceScale: scale,
      priceBarRatio: finite(view.priceBarRatio) && view.priceBarRatio > 0 ? view.priceBarRatio : undefined,
    },
    anchor: finite(position.anchor) && position.anchor > 0 ? position.anchor : undefined,
    anchorOffset: finite(position.anchorOffset) && Math.abs(position.anchorOffset) <= 2500 ? position.anchorOffset : undefined,
  };
}

function readDrawing(value: unknown): value is Drawing {
  const drawing = record(value);
  return typeof drawing.id === 'string' && ['line', 'ray', 'box'].includes(String(drawing.type)) &&
    Array.isArray(drawing.points) && drawing.points.length === (drawing.type === 'ray' ? 1 : 2) && drawing.points.every((point) => {
      const raw = record(point);
      return finite(raw.time) && finite(raw.price);
    });
}

function readTab(value: unknown): Workspace | undefined {
  const raw = record(value);
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || !Array.isArray(raw.panes)) return;
  const fallback = newWorkspace(raw.name.trim().slice(0, 36) || 'Workspace');
  const layout = isMarketLayout(raw.layout) ? raw.layout : 'single';
  const count = MARKET_LAYOUTS[layout].count;
  const inLayout = (value: unknown): value is number => finite(value) && Number.isInteger(value) && value >= 0 && value < count;
  const savedPanes = raw.panes;
  const panes = fallback.panes.map((pane, index): Pane => {
    const saved = record(savedPanes[index]);
    const symbol = restoreSymbol(saved.symbol, saved.provider) ?? pane.symbol;
    const interval = isInterval(saved.interval) ? saved.interval : pane.interval;
    const views: Pane['views'] = {};
    for (const [key, value] of Object.entries(record(saved.views))) {
      const parts = key.split('|');
      const [provider, ticker, resolution] = parts.length === 2 ? ['tradingview', ...parts] : parts;
      const qualified = restoreSymbol(ticker, provider);
      if (!qualified || !isInterval(resolution)) continue;
      const restored = chartViewKey(qualified, resolution);
      const position = readPosition(value);
      if (position && (provider === 'tradingview' || !views[restored])) views[restored] = position;
    }
    const drawings: Pane['drawings'] = {};
    for (const [key, items] of Object.entries(record(saved.drawings))) {
      const parts = key.split('|');
      const [provider, ticker] = parts.length === 1 ? ['tradingview', ...parts] : parts;
      const qualified = restoreSymbol(ticker, provider);
      if (qualified && Array.isArray(items) && (provider === 'tradingview' || !drawings[qualified])) {
        drawings[qualified] = items.filter(readDrawing);
      }
    }
    const priceScale = saved.priceScale === 'linear' || saved.priceScale === 'log'
      ? saved.priceScale : views[chartViewKey(symbol, interval)]?.view.priceScale ?? 'linear';
    return { ...pane, symbol, interval, priceScale, views, drawings };
  });
  const sizes: Workspace['sizes'] = {};
  for (const [key, value] of Object.entries(record(raw.sizes))) {
    const [name, width] = key.split(':');
    const columns = Number(width);
    if (!isMarketLayout(name) || ![1, 2, 3, 4].includes(columns)) continue;
    const size = restoreMarketGridSizes(value, MARKET_LAYOUTS[name].count, columns);
    if (size) sizes[key] = size;
  }
  return {
    ...fallback, id: raw.id, layout, panes, sizes,
    active: inLayout(raw.maximized) ? raw.maximized : inLayout(raw.active) ? raw.active : 0,
    maximized: inLayout(raw.maximized) ? raw.maximized : null,
  };
}

export function readWorkspace(): AppState {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = record(JSON.parse(localStorage.getItem(key) ?? 'null'));
      if ((raw.version !== 1 && raw.version !== 2) || !Array.isArray(raw.tabs)) continue;
      const tabs = raw.tabs.map(readTab).filter((tab): tab is Workspace => Boolean(tab));
      if (tabs.length) {
        const colors = { ...DEFAULT_COLORS };
        const savedColors = record(raw.colors);
        for (const key of Object.keys(colors) as (keyof Colors)[]) {
          const value = savedColors[key];
          if (isColor(value)) colors[key] = value;
        }
        return {
          version: 2, tabs, colors,
          current: tabs.find((tab) => tab.id === raw.current)?.id ?? tabs[0].id,
          theme: raw.theme === 'light' ? 'light' : 'dark',
          timeZone: isChartTimeZone(raw.timeZone) ? raw.timeZone : 'UTC',
        };
      }
    } catch { /* A fresh workspace is available if browser storage is blocked. */ }
  }
  const tab = newWorkspace('Workspace');
  return { version: 2, theme: 'dark', colors: DEFAULT_COLORS, timeZone: 'UTC', tabs: [tab], current: tab.id };
}

export function writeWorkspace(state: AppState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* Changes still apply for the current session. */ }
}
